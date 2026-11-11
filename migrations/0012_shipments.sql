-- 0012_shipments.sql — order-attached shipment tracking (Requirement 5).
-- Replaces the legacy product-keyed logistics_records / logistics_media (left untouched here).
-- One order -> N shipments. Shipment status is independent of orders.status and never drives it.
-- FKs use ON UPDATE / ON DELETE CASCADE because D1 enforces foreign keys and
-- functions/api/admin/orders.js renames orders (UPDATE orders SET order_no, SC- -> SHOWCASE-)
-- and deletes cancelled orders (DELETE FROM orders); without CASCADE both ops would fail
-- with a FOREIGN KEY constraint error as soon as an order has a shipment.
-- R2 objects are NOT removed by the cascade; the API deletes them explicitly.

CREATE TABLE IF NOT EXISTS shipments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL REFERENCES orders(order_no) ON UPDATE CASCADE ON DELETE CASCADE,
  carrier       TEXT,
  tracking_no   TEXT,
  tracking_url  TEXT,                         -- http/https only (validated in API)
  status        TEXT NOT NULL DEFAULT 'pending', -- functions/_lib/shipment-status.js
  origin        TEXT,
  destination   TEXT,
  packages      INTEGER,
  shipped_at    TEXT,                         -- ISO-8601 UTC
  eta           TEXT,                         -- YYYY-MM-DD
  delivered_at  TEXT,                         -- ISO-8601 UTC
  note          TEXT,                         -- customer-visible
  internal_note TEXT,                         -- admin only
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipments_order_no ON shipments(order_no, id);

CREATE TABLE IF NOT EXISTS shipment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  event_time  TEXT NOT NULL,                  -- ISO-8601 UTC (normalised by the API)
  status      TEXT,                           -- optional label from the same 7-value set
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id, event_time);

CREATE TABLE IF NOT EXISTS shipment_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id  INTEGER NOT NULL REFERENCES shipments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  r2_key       TEXT NOT NULL UNIQUE,          -- shipments/<shipmentId>/<uuid>.<ext>, server-generated
  content_type TEXT NOT NULL,                 -- one of the allowlisted image types
  file_name    TEXT,
  size_bytes   INTEGER,
  caption      TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_photos_shipment_id ON shipment_photos(shipment_id, id);
