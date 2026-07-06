import { Router } from 'express';
import pool from '../db/pool.js';
import { generalRateLimit } from '../middleware/rateLimit.js';

const router = Router();

function getStatusInfo(order) {
  switch (order.order_status) {
    case 'Confirmation Pending':
      return { message: 'Waiting for the merchant to send the confirmation link. Please check back after you receive the WhatsApp message.', canConfirm: false, canCancel: false };
    case 'Awaiting Customer Confirmation':
      return { message: 'Please confirm or cancel your order below.', canConfirm: true, canCancel: true };
    case 'Pending':
      return { message: 'Your order has been confirmed. The merchant will review it shortly.', canConfirm: false, canCancel: false };
    case 'Accepted':
      return { message: 'Your order has been accepted by the merchant.', canConfirm: false, canCancel: false };
    case 'Completed':
      return { message: 'Your order has been completed.', canConfirm: false, canCancel: false };
    case 'Cancelled':
      return { message: 'This order has been cancelled.', canConfirm: false, canCancel: false };
    case 'Expired':
      return { message: 'This order has expired.', canConfirm: false, canCancel: false };
    default:
      return { message: 'Unknown order status.', canConfirm: false, canCancel: false };
  }
}

router.get('/:orderId', generalRateLimit(20, 60000), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `SELECT o.id, o.secure_token, o.store_id, o.customer_name, o.customer_phone,
              o.fulfillment_method, o.delivery_address, o.order_status,
              o.subtotal, o.delivery_fee, o.total,
              o.confirmation_sent_at, o.reminder_sent_at, o.customer_confirmed_at, o.created_at,
              o.confirmation_message_sent_at,
              s.store_name, s.slug, s.whatsapp_number
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.id = $1`,
      [orderIdNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];

    if (order.secure_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const itemsResult = await pool.query(
      `SELECT id, product_name, quantity, unit_price
       FROM order_items WHERE order_id = $1`,
      [orderIdNum]
    );

    const statusInfo = getStatusInfo(order);

    res.json({
      order: {
        id: order.id,
        storeId: order.store_id,
        storeName: order.store_name,
        storeSlug: order.slug,
        whatsappNumber: order.whatsapp_number,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        fulfillmentMethod: order.fulfillment_method,
        deliveryAddress: order.delivery_address,
        orderStatus: order.order_status,
        subtotal: parseFloat(order.subtotal),
        deliveryFee: parseFloat(order.delivery_fee),
        total: parseFloat(order.total),
        confirmationMessageSentAt: order.confirmation_message_sent_at,
        customerConfirmedAt: order.customer_confirmed_at,
        createdAt: order.created_at,
        items: itemsResult.rows.map(i => ({
          id: i.id,
          productName: i.product_name,
          quantity: i.quantity,
          unitPrice: parseFloat(i.unit_price),
          lineTotal: parseFloat(i.unit_price) * i.quantity,
        })),
        statusMessage: statusInfo.message,
        canConfirm: statusInfo.canConfirm,
        canCancel: statusInfo.canCancel,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:orderId/confirm', generalRateLimit(10, 60000), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET order_status = 'Pending', customer_confirmed_at = NOW()
       WHERE id = $1 AND secure_token = $2
         AND order_status = 'Awaiting Customer Confirmation'
       RETURNING id, order_status, store_id`,
      [orderIdNum, token]
    );

    if (result.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1',
        [orderIdNum]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const status = current.rows[0].order_status;
      if (status === 'Pending' || status === 'Accepted') {
        return res.status(409).json({ error: 'This order is already confirmed', alreadyConfirmed: true });
      }
      if (status === 'Expired') {
        return res.status(410).json({ error: 'This order has expired', expired: true });
      }
      if (status === 'Cancelled') {
        return res.status(410).json({ error: 'This order has been cancelled', cancelled: true });
      }
      if (status === 'Completed') {
        return res.status(409).json({ error: 'This order is already completed', alreadyConfirmed: true });
      }
      return res.status(409).json({ error: `Cannot confirm order in status "${status}"` });
    }

    const updated = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${updated.store_id}`).emit('order-confirmed', {
        orderId: updated.id,
        newStatus: 'Pending',
      });
      io.to(`store:${updated.store_id}`).emit('order-status-changed', {
        orderId: updated.id,
        oldStatus: 'Confirmation Pending',
        newStatus: 'Pending',
      });
    }

    res.json({
      message: 'Order confirmed successfully',
      orderStatus: 'Pending',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:orderId/cancel', generalRateLimit(10, 60000), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET order_status = 'Cancelled', cancelled_at = NOW()
       WHERE id = $1 AND secure_token = $2
         AND order_status = 'Awaiting Customer Confirmation'
       RETURNING id, order_status, store_id`,
      [orderIdNum, token]
    );

    if (result.rows.length === 0) {
      const current = await pool.query(
        'SELECT order_status FROM orders WHERE id = $1',
        [orderIdNum]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const status = current.rows[0].order_status;
      if (status === 'Cancelled') {
        return res.status(409).json({ error: 'This order is already cancelled', alreadyCancelled: true });
      }
      if (status === 'Expired') {
        return res.status(410).json({ error: 'This order has already expired', expired: true });
      }
      if (['Accepted', 'Completed', 'Pending'].includes(status)) {
        return res.status(409).json({ error: `Cannot cancel an order in status "${status}". Please contact the merchant.` });
      }
      return res.status(409).json({ error: `Cannot cancel order in status "${status}"` });
    }

    const updated = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`store:${updated.store_id}`).emit('order-status-changed', {
        orderId: updated.id,
        oldStatus: 'Confirmation Pending',
        newStatus: 'Cancelled',
      });
    }

    res.json({
      message: 'Order cancelled',
      orderStatus: 'Cancelled',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
