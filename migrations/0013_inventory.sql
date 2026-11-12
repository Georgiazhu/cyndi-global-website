-- 0013_inventory.sql — 广州仓 SKU 级库存（单仓，仅 Showcase）。
-- 规则：某个 Showcase 变体（product × colour × size）在 inventory 里有行 = 计库存；没有行 = 不限量/按单生产（商城与旧行为不变）。
-- 单仓假设：唯一仓库是广州，因此不设 warehouse 列。扩展到多仓见设计文档 §1.6。
-- 只新建表，可重复执行（IF NOT EXISTS）。不要用 `wrangler d1 migrations apply --remote`（未跟踪的 0010_price_backup.sql 会被一起执行）。

CREATE TABLE IF NOT EXISTS inventory (
  sku                 TEXT PRIMARY KEY,               -- 库存 SKU 编码，创建后不可变（如 T3265271-BLACK-OS）
  product_id          TEXT NOT NULL,                  -- showcase_products.id（不设 FK：该表在部分环境由运行时 DDL 创建，且删商品不应级联删库存）
  color_id            TEXT NOT NULL DEFAULT '',       -- colors_json[i].id；无颜色 ''
  size                TEXT NOT NULL DEFAULT '',       -- sizes_json 原文；无尺码 ''
  available           INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_available_nonneg CHECK (available >= 0), -- 可售，前台显示 "N in stock"
  reserved            INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_reserved_nonneg  CHECK (reserved  >= 0), -- 已下单未发货
  incoming            INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_incoming_nonneg  CHECK (incoming  >= 0), -- 采购/补货在路上，未到仓（不在库）
  damaged             INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_damaged_nonneg   CHECK (damaged   >= 0), -- 残次，不可售
  low_stock_threshold INTEGER CONSTRAINT inv_threshold_nonneg CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  created_by          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (product_id, color_id, size)
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);

-- 每单每个库存 SKU 的预留记录：取消/发货/回退的唯一依据（幂等）。
-- 不变量：inventory.reserved = SUM(qty) WHERE state = 'reserved'（按 sku）。
CREATE TABLE IF NOT EXISTS order_stock_lines (
  order_no   TEXT NOT NULL REFERENCES orders(order_no) ON UPDATE CASCADE ON DELETE CASCADE,
  sku        TEXT NOT NULL REFERENCES inventory(sku)   ON UPDATE CASCADE ON DELETE CASCADE,
  qty        INTEGER NOT NULL CONSTRAINT osl_qty_pos CHECK (qty > 0),
  state      TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT osl_state CHECK (state IN ('reserved', 'shipped', 'released')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_no, sku)
);
CREATE INDEX IF NOT EXISTS idx_osl_sku_state ON order_stock_lines(sku, state);

-- 库存流水：一次事件一行，四个桶各记一个增量 + 事件后的余额。
-- sku / ref_order_no 不设 FK：取消计库存或删除订单后，流水仍保留作审计。
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT NOT NULL,
  type            TEXT NOT NULL,      -- track|untrack|stocktake|adjust|incoming|receive|damage|repair|writeoff|reserve|release|ship|unship|relink|threshold
  d_available     INTEGER NOT NULL DEFAULT 0,
  d_reserved      INTEGER NOT NULL DEFAULT 0,
  d_incoming      INTEGER NOT NULL DEFAULT 0,
  d_damaged       INTEGER NOT NULL DEFAULT 0,
  available_after INTEGER,
  reserved_after  INTEGER,
  incoming_after  INTEGER,
  damaged_after   INTEGER,
  reason          TEXT,               -- 后台操作必填（≤ 500 字符）；订单事件可空
  ref_order_no    TEXT,               -- 订单驱动的事件
  actor           TEXT NOT NULL,      -- 'admin:<username>' | 'customer:<id>' | 'system'
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_mov_sku ON inventory_movements(sku, id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_order ON inventory_movements(ref_order_no);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created ON inventory_movements(created_at);
