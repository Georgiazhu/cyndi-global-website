-- 客户账户表（Swag 商城注册/登录用）
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,       -- 登录账号
  password_hash TEXT NOT NULL,      -- SHA-256(password + salt)
  password_salt TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active / disabled
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 订单关联登录客户（可空：游客下单时为 NULL）
ALTER TABLE orders ADD COLUMN customer_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
