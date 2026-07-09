-- Migration 007: Add email column to stores for email OTP registration and notifications.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_stores_email ON stores(email);
