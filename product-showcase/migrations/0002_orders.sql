-- Orders table for product-showcase order tracking
CREATE TABLE IF NOT EXISTS orders (
  order_no TEXT PRIMARY KEY,
  user_id TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  company TEXT,
  notes TEXT,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  events_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
