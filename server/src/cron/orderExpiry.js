import cron from 'node-cron';
import pool from '../db/pool.js';
import config from '../config.js';

export function startOrderExpiryCron(io) {
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Checking order expiry and reminders...');

    try {
      await handleReminders();
      await handleExpiry(io);
    } catch (err) {
      console.error('[Cron] Error:', err.message);
    }
  });

  console.log('[Cron] Order expiry/reminder job scheduled (every 5 minutes)');
}

async function handleReminders() {
  const result = await pool.query(
    `UPDATE orders
     SET reminder_sent_at = NOW()
     WHERE order_status IN ('Confirmation Pending', 'Awaiting Customer Confirmation')
       AND reminder_sent_at IS NULL
       AND EXTRACT(EPOCH FROM (NOW() - confirmation_sent_at)) / 60 BETWEEN $1 AND $2
     RETURNING id, customer_phone`,
    [config.cron.reminderMinMinutes, config.cron.reminderMaxMinutes]
  );

  if (result.rows.length > 0) {
    for (const order of result.rows) {
      console.log(`[Cron] Reminder sent for order ${order.id}`);
    }
  }
}

async function handleExpiry(io) {
  const result = await pool.query(
    `UPDATE orders
     SET order_status = 'Expired', expired_at = NOW()
     WHERE order_status IN ('Confirmation Pending', 'Awaiting Customer Confirmation')
       AND EXTRACT(EPOCH FROM (NOW() - confirmation_sent_at)) / 60 > $1
     RETURNING id, store_id, order_status`,
    [config.cron.expiryMinutes]
  );

  if (result.rows.length > 0) {
    console.log(`[Cron] Expired ${result.rows.length} order(s)`);

    if (io) {
      for (const order of result.rows) {
        io.to(`store:${order.store_id}`).emit('order-status-changed', {
          orderId: order.id,
          oldStatus: order.order_status,
          newStatus: 'Expired',
        });
      }
    }
  }
}
