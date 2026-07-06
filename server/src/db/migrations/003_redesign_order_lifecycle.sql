-- Migration 003: Redesign order lifecycle with explicit 7-status state machine.
--
-- New statuses:
--   Confirmation Pending       — customer placed order, merchant hasn't sent WhatsApp
--   Awaiting Customer Confirmation — merchant sent WhatsApp, waiting on customer
--   Pending                    — customer confirmed, merchant must accept or cancel
--   Accepted                   — merchant accepted the order (was "Confirmed")
--   Completed                  — order fulfilled
--   Cancelled                  — order cancelled
--   Expired                    — order expired (60+ min without customer confirmation)

-- 1. Remove the old CHECK constraint.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- 2. Update the column default and widen for longer status names.
ALTER TABLE orders ALTER COLUMN order_status TYPE VARCHAR(40);
ALTER TABLE orders ALTER COLUMN order_status SET DEFAULT 'Confirmation Pending';

-- 3. Migrate existing rows to new status names.
UPDATE orders SET order_status = 'Confirmation Pending' WHERE order_status = 'Confirmation_Pending';
UPDATE orders SET order_status = 'Accepted' WHERE order_status = 'Confirmed';
-- 'Pending', 'Completed', 'Cancelled', 'Expired' are unchanged.

-- 3. Add the new CHECK constraint with all 7 statuses.
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'Confirmation Pending',
    'Awaiting Customer Confirmation',
    'Pending',
    'Accepted',
    'Completed',
    'Cancelled',
    'Expired'
  ));
