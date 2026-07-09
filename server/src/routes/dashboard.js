import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import {
  validateProductInput,
  validateStoreSettings,
  validateBusinessHours,
} from '../middleware/validate.js';
import { uploadMiddleware, handleUploadError } from '../middleware/upload.js';
import { uploadProductImage, deleteProductImage } from '../services/imageService.js';
import { buildWaDeepLink } from '../utils/waLink.js';
import { generateQrDataUrl } from '../utils/qrCode.js';
import config from '../config.js';

const router = Router();

router.use(requireAuth);

function storeQuery(query, params = []) {
  return pool.query(query, params);
}

function buildStoreIdCondition(req) {
  return req.merchant.storeId;
}

function formatOrderRow(o) {
  return {
    id: o.id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    fulfillmentMethod: o.fulfillment_method,
    deliveryAddress: o.delivery_address,
    orderStatus: o.order_status,
    subtotal: parseFloat(o.subtotal),
    deliveryFee: parseFloat(o.delivery_fee),
    total: parseFloat(o.total),
    confirmationSentAt: o.confirmation_sent_at,
    confirmationMessageSentAt: o.confirmation_message_sent_at,
    reminderSentAt: o.reminder_sent_at,
    customerConfirmedAt: o.customer_confirmed_at,
    merchantAcceptedAt: o.merchant_accepted_at,
    completedAt: o.completed_at,
    cancelledAt: o.cancelled_at,
    expiredAt: o.expired_at,
    createdAt: o.created_at,
  };
}

router.get('/orders', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { status, limit } = req.query;

    let sql = `SELECT id, customer_name, customer_phone, fulfillment_method, delivery_address,
                      order_status, subtotal, delivery_fee, total,
                      confirmation_sent_at, confirmation_message_sent_at,
                      reminder_sent_at, customer_confirmed_at,
                      merchant_accepted_at, completed_at, cancelled_at, expired_at,
                      created_at
               FROM orders WHERE store_id = $1`;
    const params = [storeId];

    const validStatuses = ['Confirmation Pending', 'Awaiting Customer Confirmation', 'Pending', 'Accepted', 'Completed', 'Cancelled', 'Expired'];
    if (status) {
      const statuses = status.split(',').filter(s => validStatuses.includes(s));
      if (statuses.length === 1) {
        sql += ` AND order_status = $2`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        const placeholders = statuses.map((_, i) => `$${i + 2}`).join(', ');
        sql += ` AND order_status IN (${placeholders})`;
        params.push(...statuses);
      }
    }

    sql += ` ORDER BY created_at DESC`;

    // Optional LIMIT for performance (e.g. dashboard recent orders)
    const limitNum = limit ? parseInt(limit, 10) : 0;
    if (limitNum > 0) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(limitNum);
    }

    const result = await storeQuery(sql, params);
    const orders = result.rows.map(formatOrderRow);

    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const itemsResult = await storeQuery(
        `SELECT id, order_id, product_name, quantity, unit_price
         FROM order_items WHERE order_id = ANY($1)
         ORDER BY id`,
        [orderIds]
      );
      const itemsByOrder = {};
      for (const item of itemsResult.rows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price),
          lineTotal: parseFloat(item.unit_price) * item.quantity,
        });
      }
      for (const order of orders) {
        order.items = itemsByOrder[order.id] || [];
      }
    }

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const orderIdNum = parseInt(req.params.orderId, 10);

    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const orderResult = await storeQuery(
      `SELECT id, customer_name, customer_phone, fulfillment_method, delivery_address,
              order_status, subtotal, delivery_fee, total,
              confirmation_sent_at, reminder_sent_at, customer_confirmed_at,
              merchant_accepted_at, completed_at, cancelled_at, expired_at,
              created_at
       FROM orders WHERE id = $1 AND store_id = $2`,
      [orderIdNum, storeId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsResult = await storeQuery(
      `SELECT id, product_name, quantity, unit_price
       FROM order_items WHERE order_id = $1`,
      [orderIdNum]
    );

    const o = orderResult.rows[0];
    res.json({
      order: {
        ...formatOrderRow(o),
        items: itemsResult.rows.map(i => ({
          id: i.id,
          productName: i.product_name,
          quantity: i.quantity,
          unitPrice: parseFloat(i.unit_price),
          lineTotal: parseFloat(i.unit_price) * i.quantity,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:orderId/accept', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const orderIdNum = parseInt(req.params.orderId, 10);

    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `UPDATE orders SET order_status = 'Accepted', merchant_accepted_at = NOW()
       WHERE id = $1 AND store_id = $2 AND order_status = 'Pending'
       RETURNING id, order_status`,
      [orderIdNum, storeId]
    );

    if (result.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1 AND store_id = $2',
        [orderIdNum, storeId]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(409).json({
        error: `Cannot accept order in status "${current.rows[0].order_status}"`,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${storeId}`).emit('order-status-changed', {
        orderId: orderIdNum,
        oldStatus: 'Pending',
        newStatus: 'Accepted',
      });
    }

    res.json({ message: 'Order accepted', orderStatus: 'Accepted' });
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:orderId/complete', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const orderIdNum = parseInt(req.params.orderId, 10);

    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `UPDATE orders SET order_status = 'Completed', completed_at = NOW()
       WHERE id = $1 AND store_id = $2 AND order_status = 'Accepted'
       RETURNING id, order_status`,
      [orderIdNum, storeId]
    );

    if (result.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1 AND store_id = $2',
        [orderIdNum, storeId]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(409).json({
        error: `Cannot complete order in status "${current.rows[0].order_status}"`,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${storeId}`).emit('order-status-changed', {
        orderId: orderIdNum,
        oldStatus: 'Accepted',
        newStatus: 'Completed',
      });
    }

    res.json({ message: 'Order completed', orderStatus: 'Completed' });
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:orderId/cancel', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const orderIdNum = parseInt(req.params.orderId, 10);

    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `UPDATE orders SET order_status = 'Cancelled', cancelled_at = NOW()
       WHERE id = $1 AND store_id = $2
         AND order_status IN ('Pending', 'Accepted')
       RETURNING id, order_status, customer_phone`,
      [orderIdNum, storeId]
    );

    if (result.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1 AND store_id = $2',
        [orderIdNum, storeId]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(409).json({
        error: `Cannot cancel order in status "${current.rows[0].order_status}"`,
      });
    }

    const order = result.rows[0];

    const storeResult = await pool.query(
      `SELECT store_name, whatsapp_number FROM stores WHERE id = $1`,
      [storeId]
    );
    const store = storeResult.rows[0];

    const waText = `Your order at ${store.store_name} has been cancelled by the merchant. Please contact them on WhatsApp for details.`;
    const waLink = buildWaDeepLink(order.customer_phone, waText);

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${storeId}`).emit('order-status-changed', {
        orderId: orderIdNum,
        oldStatus: order.order_status,
        newStatus: 'Cancelled',
      });
    }

    res.json({ message: 'Order cancelled', waLink, orderStatus: 'Cancelled' });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return handleUploadError(err, req, res, next);
    next();
  });
}, async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    if (!config.supabaseConfigured) {
      return res.status(501).json({ error: 'Image upload is not configured. Contact the system administrator.' });
    }

    const publicUrl = await uploadProductImage(storeId, req.file);

    res.status(201).json({
      imageUrl: publicUrl,
      message: 'Image uploaded successfully',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { search } = req.query;

    let sql = `SELECT id, name, price, description, is_available, image_url, category_id, sort_order
               FROM products WHERE store_id = $1`;
    const params = [storeId];

    if (search && typeof search === 'string' && search.trim()) {
      sql += ` AND name ILIKE $2`;
      params.push(`%${search.trim()}%`);
    }

    sql += ` ORDER BY sort_order ASC, created_at ASC`;

    const result = await pool.query(sql, params);

    res.json({
      products: result.rows.map(p => ({
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        description: p.description,
        isAvailable: p.is_available,
        imageUrl: p.image_url,
        categoryId: p.category_id,
        sortOrder: p.sort_order,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/products', validateProductInput, async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { name, price, description, imageUrl, categoryId } = req.cleanInput;

    // Determine sort_order: place after the last product in the same category
    const lastOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM products WHERE store_id = $1`,
      [storeId]
    );

    const result = await pool.query(
      `INSERT INTO products (store_id, name, price, description, image_url, category_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, price, description, is_available, image_url, category_id, sort_order`,
      [storeId, name, price, description, imageUrl, categoryId, lastOrder.rows[0].next_order]
    );

    const p = result.rows[0];
    res.status(201).json({
      product: {
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        description: p.description,
        isAvailable: p.is_available,
        imageUrl: p.image_url,
        categoryId: p.category_id,
        sortOrder: p.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/products/:productId', validateProductInput, async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { productId } = req.params;
    const { name, price, description, imageUrl, categoryId } = req.cleanInput;

    const result = await pool.query(
      `UPDATE products
       SET name = $1, price = $2, description = $3, image_url = $4, category_id = $5
       WHERE id = $6 AND store_id = $7
       RETURNING id, name, price, description, is_available, image_url, category_id, sort_order`,
      [name, price, description, imageUrl, categoryId, productId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const p = result.rows[0];
    res.json({
      product: {
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        description: p.description,
        isAvailable: p.is_available,
        imageUrl: p.image_url,
        categoryId: p.category_id,
        sortOrder: p.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/products/:productId/toggle', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { productId } = req.params;

    const result = await pool.query(
      `UPDATE products
       SET is_available = NOT is_available
       WHERE id = $1 AND store_id = $2
       RETURNING id, name, price, description, is_available, image_url, category_id, sort_order`,
      [productId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const p = result.rows[0];
    res.json({
      product: {
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        description: p.description,
        isAvailable: p.is_available,
        imageUrl: p.image_url,
        categoryId: p.category_id,
        sortOrder: p.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Duplicate product ──────────────────────────────────────────
router.post('/products/:productId/duplicate', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { productId } = req.params;

    const source = await pool.query(
      `SELECT name, price, description, image_url, is_available, category_id
       FROM products WHERE id = $1 AND store_id = $2`,
      [productId, storeId]
    );

    if (source.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const p = source.rows[0];

    const lastOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM products WHERE store_id = $1`,
      [storeId]
    );

    const result = await pool.query(
      `INSERT INTO products (store_id, name, price, description, image_url, is_available, category_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, price, description, is_available, image_url, category_id, sort_order`,
      [storeId, `${p.name} (Copy)`, p.price, p.description, p.image_url, p.is_available, p.category_id, lastOrder.rows[0].next_order]
    );

    const dup = result.rows[0];
    res.status(201).json({
      product: {
        id: dup.id,
        name: dup.name,
        price: parseFloat(dup.price),
        description: dup.description,
        isAvailable: dup.is_available,
        imageUrl: dup.image_url,
        categoryId: dup.category_id,
        sortOrder: dup.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/products/:productId', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { productId } = req.params;

    const result = await pool.query(
      `DELETE FROM products WHERE id = $1 AND store_id = $2
       RETURNING id, image_url`,
      [productId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const imageUrl = result.rows[0].image_url;
    if (imageUrl) {
      deleteProductImage(imageUrl).catch((e) =>
        console.error('[Storage] Cleanup error on product delete:', e.message)
      );
    }

    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Reorder products ────────────────────────────────────────────
router.put('/products/reorder', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < productIds.length; i++) {
        await client.query(
          `UPDATE products SET sort_order = $1 WHERE id = $2 AND store_id = $3`,
          [i, productIds[i], storeId]
        );
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error('Failed to reorder products');
    } finally {
      client.release();
    }

    res.json({ message: 'Products reordered' });
  } catch (err) {
    next(err);
  }
});

// ─── Categories ──────────────────────────────────────────────────
router.get('/categories', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const result = await pool.query(
      `SELECT id, name, sort_order
       FROM categories WHERE store_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [storeId]
    );

    res.json({
      categories: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Category name is required (1-100 chars)' });
    }

    const lastOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM categories WHERE store_id = $1`,
      [storeId]
    );

    const result = await pool.query(
      `INSERT INTO categories (store_id, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, sort_order`,
      [storeId, name.trim(), lastOrder.rows[0].next_order]
    );

    const c = result.rows[0];
    res.status(201).json({
      category: { id: c.id, name: c.name, sortOrder: c.sort_order },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/categories/:categoryId', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Category name is required (1-100 chars)' });
    }

    const result = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2 AND store_id = $3
       RETURNING id, name, sort_order`,
      [name.trim(), categoryId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const c = result.rows[0];
    res.json({
      category: { id: c.id, name: c.name, sortOrder: c.sort_order },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:categoryId', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const { categoryId } = req.params;

    // Set category_id to null for all products in this category
    await pool.query(
      `UPDATE products SET category_id = NULL WHERE category_id = $1 AND store_id = $2`,
      [categoryId, storeId]
    );

    const result = await pool.query(
      `DELETE FROM categories WHERE id = $1 AND store_id = $2
       RETURNING id`,
      [categoryId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const result = await pool.query(
      `SELECT store_name, slug, whatsapp_number, email, allow_delivery, allow_pickup,
              delivery_fee, free_delivery_threshold, pickup_address, pickup_instructions,
              store_status
       FROM stores WHERE id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const s = result.rows[0];
    res.json({
      settings: {
        storeName: s.store_name,
        slug: s.slug,
        whatsappNumber: s.whatsapp_number,
        email: s.email,
        allowDelivery: s.allow_delivery,
        allowPickup: s.allow_pickup,
        deliveryFee: parseFloat(s.delivery_fee),
        freeDeliveryThreshold: s.free_delivery_threshold ? parseFloat(s.free_delivery_threshold) : null,
        pickupAddress: s.pickup_address,
        pickupInstructions: s.pickup_instructions,
        storeStatus: s.store_status || 'open',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', validateStoreSettings, async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(req.cleanInput)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(storeId);
    const result = await pool.query(
      `UPDATE stores SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING store_name, slug, whatsapp_number, email, allow_delivery, allow_pickup,
                delivery_fee, free_delivery_threshold, pickup_address, pickup_instructions,
                store_status`,
      values
    );

    const s = result.rows[0];
    res.json({
      settings: {
        storeName: s.store_name,
        slug: s.slug,
        whatsappNumber: s.whatsapp_number,
        email: s.email,
        allowDelivery: s.allow_delivery,
        allowPickup: s.allow_pickup,
        deliveryFee: parseFloat(s.delivery_fee),
        freeDeliveryThreshold: s.free_delivery_threshold ? parseFloat(s.free_delivery_threshold) : null,
        pickupAddress: s.pickup_address,
        pickupInstructions: s.pickup_instructions,
        storeStatus: s.store_status || 'open',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/business-hours', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const result = await pool.query(
      `SELECT day_of_week, open_time, close_time, is_closed
       FROM business_hours WHERE store_id = $1
       ORDER BY day_of_week ASC`,
      [storeId]
    );

    res.json({
      hours: result.rows.map(h => ({
        dayOfWeek: h.day_of_week,
        openTime: h.open_time,
        closeTime: h.close_time,
        isClosed: h.is_closed,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/business-hours', validateBusinessHours, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const storeId = buildStoreIdCondition(req);

    await client.query('BEGIN');

    for (const h of req.cleanHours) {
      await client.query(
        `UPDATE business_hours
         SET open_time = $1, close_time = $2, is_closed = $3
         WHERE store_id = $4 AND day_of_week = $5`,
        [h.open_time, h.close_time, h.is_closed, storeId, h.day_of_week]
      );
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT day_of_week, open_time, close_time, is_closed
       FROM business_hours WHERE store_id = $1
       ORDER BY day_of_week ASC`,
      [storeId]
    );

    res.json({
      hours: result.rows.map(h => ({
        dayOfWeek: h.day_of_week,
        openTime: h.open_time,
        closeTime: h.close_time,
        isClosed: h.is_closed,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.post('/orders/:orderId/send-confirmation', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const orderIdNum = parseInt(req.params.orderId, 10);

    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const updateResult = await pool.query(
      `UPDATE orders SET order_status = 'Awaiting Customer Confirmation', confirmation_message_sent_at = NOW()
       WHERE id = $1 AND store_id = $2
         AND order_status = 'Confirmation Pending'
       RETURNING id, customer_phone, secure_token`,
      [orderIdNum, storeId]
    );

    if (updateResult.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1 AND store_id = $2',
        [orderIdNum, storeId]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(409).json({
        error: `Cannot send confirmation for order in status "${current.rows[0].order_status}". Order must be in Confirmation Pending.`,
      });
    }

    const order = updateResult.rows[0];

    const appUrl = config.frontendUrl;
    const confirmUrl = `${appUrl}/confirm/${orderIdNum}?token=${order.secure_token}`;
    const waText = `السلام علیکم!\n\nThank you for placing your order.\n\nPlease confirm your order using the secure link below:\n\n${confirmUrl}\n\nThis confirmation link expires in 60 minutes.\n\nThank you.`;
    const waLink = buildWaDeepLink(order.customer_phone, waText);

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${storeId}`).emit('confirmation-sent', {
        orderId: orderIdNum,
        confirmationMessageSentAt: new Date().toISOString(),
      });
    }

    res.json({
      waLink,
      confirmationMessageSentAt: new Date().toISOString(),
      message: 'WhatsApp confirmation link generated',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/qrcode', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);
    const result = await pool.query(
      'SELECT slug FROM stores WHERE id = $1',
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const appUrl = config.frontendUrl;

    const storeUrl = `${appUrl}/store/${result.rows[0].slug}`;
    const dataUrl = await generateQrDataUrl(storeUrl);

    res.json({ qrCode: dataUrl, storeUrl });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const storeId = buildStoreIdCondition(req);

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE order_status = 'Pending') AS pending_count,
         COUNT(*) FILTER (WHERE order_status = 'Accepted') AS accepted_count,
         COUNT(*) FILTER (WHERE order_status = 'Completed') AS completed_count,
         COUNT(*) FILTER (WHERE order_status IN ('Confirmation Pending', 'Awaiting Customer Confirmation')) AS unconfirmed_count,
         COUNT(*) FILTER (WHERE order_status = 'Cancelled') AS cancelled_count,
         COUNT(*) FILTER (WHERE order_status = 'Expired') AS expired_count,
         COUNT(*) FILTER (WHERE order_status = 'Awaiting Customer Confirmation') AS awaiting_confirmation_count,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h_count,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS orders_today,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS orders_this_week,
         COALESCE(SUM(total) FILTER (WHERE order_status = 'Completed'), 0) AS total_revenue,
         COALESCE(SUM(total) FILTER (WHERE order_status = 'Completed' AND completed_at >= CURRENT_DATE), 0) AS revenue_today,
         COALESCE(SUM(total) FILTER (WHERE order_status = 'Completed' AND completed_at >= date_trunc('week', CURRENT_DATE)), 0) AS revenue_this_week,
         CASE
           WHEN COUNT(*) FILTER (WHERE order_status = 'Completed') > 0
           THEN ROUND(COALESCE(SUM(total) FILTER (WHERE order_status = 'Completed'), 0) /
                      COUNT(*) FILTER (WHERE order_status = 'Completed'), 2)
           ELSE 0
         END AS average_order_value
       FROM orders WHERE store_id = $1`,
      [storeId]
    );

    const stats = result.rows[0];

    // Fetch best selling product
    const bestProduct = await pool.query(
      `SELECT p.id, p.name,
              SUM(oi.quantity) AS total_sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.store_id = $1 AND o.order_status = 'Completed'
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC
       LIMIT 1`,
      [storeId]
    );

    stats.best_selling_product = bestProduct.rows.length > 0
      ? { id: bestProduct.rows[0].id, name: bestProduct.rows[0].name, totalSold: parseInt(bestProduct.rows[0].total_sold, 10) }
      : null;

    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

export default router;
