-- Migration 002: Add column to track when merchant sent the confirmation WhatsApp message.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_message_sent_at TIMESTAMPTZ;
