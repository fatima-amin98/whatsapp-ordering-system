-- Migration 004: Add dedicated timestamps for every lifecycle event.
--
-- Rename confirmed_at → customer_confirmed_at for clarity.
-- Add columns for merchant_accepted_at, completed_at, cancelled_at, expired_at.

-- 1. Rename confirmed_at for clarity.
ALTER TABLE orders RENAME COLUMN confirmed_at TO customer_confirmed_at;

-- 2. Add missing lifecycle timestamps.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
