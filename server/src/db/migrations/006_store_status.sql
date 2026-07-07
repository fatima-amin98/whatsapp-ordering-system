-- Migration 006: Store manual status override.
--
-- Adds a store_status column that works alongside business hours.
--   'open'              — use business hours as normal
--   'temporarily_closed' — store is closed temporarily (override)
--   'closed'             — store is permanently closed
--
-- Default: 'open' for all existing stores.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_status VARCHAR(20) NOT NULL DEFAULT 'open'
  CHECK (store_status IN ('open', 'temporarily_closed', 'closed'));
