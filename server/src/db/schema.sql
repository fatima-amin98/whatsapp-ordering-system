-- This file is the full aggregate schema for reference only.
-- It is NOT executed by the migration system.
-- All schema changes must be added as numbered migration files in:
--   server/src/db/migrations/
-- See migrate.js for the migration framework.
--
-- Current migrations:
--   001_initial_schema.sql                          — core tables and indexes
--   002_add_confirmation_message_sent_at.sql         — order confirmation tracking
--   003_redesign_order_lifecycle.sql                 — 7-status state machine
--   004_add_lifecycle_timestamps.sql                 — dedicated per-event timestamps

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  allow_delivery BOOLEAN DEFAULT TRUE,
  allow_pickup BOOLEAN DEFAULT TRUE,
  delivery_fee DECIMAL(10,2) DEFAULT 0.00,
  free_delivery_threshold DECIMAL(10,2),
  pickup_address TEXT,
  pickup_instructions TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  secure_token UUID DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  fulfillment_method VARCHAR(20) CHECK (fulfillment_method IN ('delivery', 'pickup')),
  delivery_address TEXT,
  order_status VARCHAR(40) DEFAULT 'Confirmation Pending'
    CHECK (order_status IN (
      'Confirmation Pending',
      'Awaiting Customer Confirmation',
      'Pending',
      'Accepted',
      'Completed',
      'Cancelled',
      'Expired'
    )),
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL,
  confirmation_sent_at TIMESTAMPTZ DEFAULT NOW(),
  confirmation_message_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  customer_confirmed_at TIMESTAMPTZ,
  merchant_accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  UNIQUE(store_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_store_id ON business_hours(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(secure_token);
