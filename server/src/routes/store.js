import { Router } from 'express';
import pool from '../db/pool.js';
import { validateCheckoutInput } from '../middleware/validate.js';
import { orderRateLimit } from '../middleware/rateLimit.js';
import config from '../config.js';

const router = Router();

async function isStoreOpen(storeId, storeStatus = 'open') {
  // Manual status overrides business hours
  if (storeStatus === 'closed') {
    return { open: false, hours: [], storeStatusLabel: 'closed' };
  }
  if (storeStatus === 'temporarily_closed') {
    return { open: false, hours: [], storeStatusLabel: 'temporarily_closed' };
  }

  const { rows } = await pool.query(
    'SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1',
    [storeId]
  );

  const now = new Date();
  const pakistanOffset = 5 * 60 + 30;
  const pkMs = now.getTime() + pakistanOffset * 60 * 1000;
  const pkDate = new Date(pkMs);
  const currentDay = pkDate.getUTCDay();
  const hour = pkDate.getUTCHours().toString().padStart(2, '0');
  const minute = pkDate.getUTCMinutes().toString().padStart(2, '0');
  const currentTime = `${hour}:${minute}`;

  const today = rows.find(r => r.day_of_week === currentDay);
  if (!today || today.is_closed) {
    return { open: false, hours: rows, storeStatusLabel: null };
  }

  const open = currentTime >= today.open_time.slice(0, 5) && currentTime <= today.close_time.slice(0, 5);
  return { open, hours: rows, storeStatusLabel: null };
}

router.get('/:slug', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, store_name, slug, whatsapp_number, allow_delivery, allow_pickup,
              delivery_fee, free_delivery_threshold, pickup_address, pickup_instructions,
              store_status
       FROM stores WHERE slug = $1`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const s = result.rows[0];
    const statusInfo = await isStoreOpen(s.id, s.store_status || 'open');

    res.json({
      store: {
        id: s.id,
        storeName: s.store_name,
        slug: s.slug,
        whatsappNumber: s.whatsapp_number,
        allowDelivery: s.allow_delivery,
        allowPickup: s.allow_pickup,
        deliveryFee: parseFloat(s.delivery_fee),
        freeDeliveryThreshold: s.free_delivery_threshold ? parseFloat(s.free_delivery_threshold) : null,
        pickupAddress: s.pickup_address,
        pickupInstructions: s.pickup_instructions,
        storeStatus: s.store_status || 'open',
        isOpen: statusInfo.open,
        storeStatusLabel: statusInfo.storeStatusLabel,
        businessHours: statusInfo.hours.map(h => ({
          dayOfWeek: h.day_of_week,
          openTime: h.open_time,
          closeTime: h.close_time,
          isClosed: h.is_closed,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/products', async (req, res, next) => {
  try {
    const storeResult = await pool.query(
      'SELECT id FROM stores WHERE slug = $1',
      [req.params.slug]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const storeId = storeResult.rows[0].id;

    const result = await pool.query(
      `SELECT id, name, price, description, is_available, image_url, category_id
       FROM products WHERE store_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [storeId]
    );

    res.json({
      products: result.rows.map(p => ({
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        description: p.description,
        isAvailable: p.is_available,
        imageUrl: p.image_url,
        categoryId: p.category_id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/categories', async (req, res, next) => {
  try {
    const storeResult = await pool.query(
      'SELECT id FROM stores WHERE slug = $1',
      [req.params.slug]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const result = await pool.query(
      `SELECT id, name FROM categories WHERE store_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [storeResult.rows[0].id]
    );

    res.json({
      categories: result.rows.map(c => ({
        id: c.id,
        name: c.name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/orders', validateCheckoutInput, orderRateLimit, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const storeResult = await pool.query(
      `SELECT id, store_name, slug, whatsapp_number, delivery_fee, free_delivery_threshold,
              allow_delivery, allow_pickup, store_status
       FROM stores WHERE slug = $1`,
      [req.params.slug]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const store = storeResult.rows[0];

    const storeStatus = await isStoreOpen(store.id, store.store_status || 'open');
    if (!storeStatus.open) {
      return res.status(400).json({ error: 'Store is currently closed. Please check business hours and try again.' });
    }

    if (req.cleanInput.fulfillmentMethod === 'delivery' && !store.allow_delivery) {
      return res.status(400).json({ error: 'This store does not offer delivery' });
    }
    if (req.cleanInput.fulfillmentMethod === 'pickup' && !store.allow_pickup) {
      return res.status(400).json({ error: 'This store does not offer pickup' });
    }

    const { customerName, customerPhone, fulfillmentMethod, deliveryAddress, items } = req.cleanInput;

    const productIds = items.map(i => i.productId);
    const productsResult = await pool.query(
      `SELECT id, name, price, is_available FROM products WHERE id = ANY($1) AND store_id = $2`,
      [productIds, store.id]
    );

    if (productsResult.rows.length !== items.length) {
      return res.status(400).json({ error: 'One or more products not found' });
    }

    const productMap = {};
    for (const p of productsResult.rows) {
      if (!p.is_available) {
        return res.status(400).json({ error: `"${p.name}" is currently unavailable` });
      }
      productMap[p.id] = p;
    }

    let subtotal = 0;
    const orderItemsData = [];
    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found in this store` });
      }
      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: Math.round(parseFloat(product.price) * 100) / 100,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    let deliveryFee = 0;
    if (fulfillmentMethod === 'delivery') {
      deliveryFee = parseFloat(store.delivery_fee);
      if (store.free_delivery_threshold !== null && subtotal >= parseFloat(store.free_delivery_threshold)) {
        deliveryFee = 0;
      }
    }

    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (store_id, customer_name, customer_phone, fulfillment_method, delivery_address,
                           subtotal, delivery_fee, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, secure_token, order_status, created_at`,
      [store.id, customerName, customerPhone, fulfillmentMethod, deliveryAddress, subtotal, deliveryFee, total]
    );
    const order = orderResult.rows[0];

    for (const item of orderItemsData) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.productName, item.quantity, item.unitPrice]
      );
    }

    await client.query('COMMIT');

    const confirmUrl = `/confirm/${order.id}?token=${order.secure_token}`;

    const io = req.app.get('io');
    if (io) {
      const orderWithItems = {
        id: order.id,
        customerName,
        customerPhone,
        fulfillmentMethod,
        deliveryAddress,
        orderStatus: order.order_status,
        subtotal,
        deliveryFee,
        total,
        createdAt: order.created_at,
        confirmationMessageSentAt: null,
        items: orderItemsData,
      };
      io.to(`store:${store.id}`).emit('new-order', { order: orderWithItems });
    }

    res.status(201).json({
      orderId: order.id,
      secureToken: order.secure_token,
      confirmUrl,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;
