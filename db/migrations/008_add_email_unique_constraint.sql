-- Migration 008: Add UNIQUE constraint on stores.email
--
-- First, deduplicate: keep the earliest store for any duplicate emails.
-- Then add a UNIQUE index/constraint.

-- 1. Remove duplicates: keep the row with the earliest created_at per email
DELETE FROM stores
WHERE email IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (email) id
    FROM stores
    WHERE email IS NOT NULL
    ORDER BY email, created_at ASC, id ASC
  );

-- 2. Remove the plain index (it would conflict with the unique index)
DROP INDEX IF EXISTS idx_stores_email;

-- 3. Add a unique partial index (NULLs can still be multiple)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_email_unique ON stores(email)
  WHERE email IS NOT NULL;
