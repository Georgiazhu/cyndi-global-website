-- 0017_redemption_portals.sql — external gift redemption portals (M3 personal links / M4 open portal).
-- Mirrors functions/_lib/redemption.js ensureRedemptionSchema(). The functions apply this
-- defensively at runtime, so applying this migration manually is optional (idempotent).

CREATE TABLE IF NOT EXISTS redemption_portals (
  id                TEXT PRIMARY KEY,
  customer_id       TEXT NOT NULL,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  slug              TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  custom_title      TEXT NOT NULL DEFAULT '',
  custom_description TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_portals_slug
  ON redemption_portals(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_redemption_portals_customer
  ON redemption_portals(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS redemption_portal_items (
  portal_id         TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  max_qty_per_order INTEGER,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (portal_id, product_id)
);

CREATE TABLE IF NOT EXISTS redemption_invites (
  id                TEXT PRIMARY KEY,
  portal_id         TEXT NOT NULL,
  recipient_name    TEXT NOT NULL,
  recipient_email   TEXT NOT NULL,
  token             TEXT NOT NULL UNIQUE,
  email_status      TEXT NOT NULL DEFAULT 'PENDING',
  email_sent_at     TEXT,
  email_error       TEXT,
  is_redeemed       INTEGER NOT NULL DEFAULT 0,
  redeemed_at       TEXT,
  order_id          TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_redemption_invites_portal
  ON redemption_invites(portal_id, id DESC);

ALTER TABLE orders ADD COLUMN source_type TEXT NOT NULL DEFAULT 'INTERNAL_TEAM';
ALTER TABLE orders ADD COLUMN portal_id TEXT;
ALTER TABLE orders ADD COLUMN invite_id TEXT;
ALTER TABLE orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE orders ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'READY_FOR_DISPATCH';
ALTER TABLE orders ADD COLUMN reviewed_by TEXT;
ALTER TABLE orders ADD COLUMN reviewed_at TEXT;
ALTER TABLE orders ADD COLUMN review_note TEXT;
ALTER TABLE orders ADD COLUMN shipping_name TEXT;
ALTER TABLE orders ADD COLUMN shipping_email TEXT;
ALTER TABLE orders ADD COLUMN shipping_phone TEXT;
ALTER TABLE orders ADD COLUMN shipping_country_code TEXT;
ALTER TABLE orders ADD COLUMN shipping_state TEXT;
ALTER TABLE orders ADD COLUMN shipping_city TEXT;
ALTER TABLE orders ADD COLUMN shipping_postal_code TEXT;
ALTER TABLE orders ADD COLUMN shipping_address_line1 TEXT;
ALTER TABLE orders ADD COLUMN shipping_address_line2 TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source_type, status);
CREATE INDEX IF NOT EXISTS idx_orders_portal ON orders(portal_id, created_at DESC);
