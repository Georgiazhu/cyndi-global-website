-- Swag 商城订单表（MVP：前端下单落库 + 按订单号查询）
-- 客户信息与商品明细以字段 + JSON 存储；状态默认 pending。
CREATE TABLE IF NOT EXISTS orders (
  order_no TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  company TEXT,
  notes TEXT,
  items_json TEXT NOT NULL,        -- 下单快照：[{id,name,price,quantity,selectedColor,selectedSize,...}]
  item_count INTEGER NOT NULL,     -- 商品总件数
  total REAL NOT NULL,             -- 下单时合计金额
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  status_updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
