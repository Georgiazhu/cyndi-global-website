-- 商品数据库：SPU(款) / 颜色 / SKU(可售单元)。纯 API 方案，支持管理员后台手动上货。
-- SPU = 物流 productNo（同一套 CY-{GROUP}-{SEQ}）。无库存字段（按订单定制生产）。

-- 表1：products（SPU / 款）
CREATE TABLE IF NOT EXISTS products (
  spu             TEXT PRIMARY KEY,        -- CY-BAG-0001 (= 物流 productNo)
  name            TEXT NOT NULL,
  brand           TEXT,                    -- Patagonia / Custom / mont·bell
  group_name      TEXT,                    -- Apparel / Bags / Drinkware
  category        TEXT,                    -- section key: tshirts / totes / mugs
  category_title  TEXT,                    -- T-shirts / Totes
  source          TEXT,                    -- patagonia / 1688 / taobao
  source_id       TEXT,                    -- 来源平台商品ID: style_no / offer_id / item_id
  currency        TEXT,                    -- USD / CNY
  description     TEXT,
  price_min       REAL,                    -- 展示区间
  price_max       REAL,
  default_image   TEXT,                    -- 主图路径
  attributes_json TEXT,                    -- 结构化参数(材质/容量等,可空)
  status          TEXT NOT NULL DEFAULT 'active',  -- active / hidden (上下架)
  sort            INTEGER NOT NULL DEFAULT 0,
  source_url      TEXT,                    -- 原始爬取 URL(留痕)
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_group ON products (group_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);

-- 表2：product_colors（颜色，含该色图片）
CREATE TABLE IF NOT EXISTS product_colors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spu         TEXT NOT NULL,
  color_name  TEXT,                        -- Salt Grey / 白色空白包
  color_code  TEXT NOT NULL,               -- SGRY / C01
  swatch      TEXT,                        -- 色块图路径
  images_json TEXT,                        -- 该色所有图(JSON 数组)
  sort        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (spu, color_code)
);
CREATE INDEX IF NOT EXISTS idx_colors_spu ON product_colors (spu);

-- 表3：product_skus（SKU / 可售单元 = 颜色 × 尺码）
CREATE TABLE IF NOT EXISTS product_skus (
  sku              TEXT PRIMARY KEY,       -- CY-BAG-0001-C01-M
  spu              TEXT NOT NULL,          -- FK -> products
  color_code       TEXT,                   -- FK -> product_colors
  color_name       TEXT,                   -- 冗余,订单/对账直接读
  size             TEXT,                   -- M / OS / 容量
  price            REAL,                   -- 变体价(无 stock)
  currency         TEXT,                   -- USD / CNY
  tier_prices_json TEXT,                   -- 通用阶梯价 [{beginAmount,price}] (来源无关,可空)
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skus_spu ON product_skus (spu);
CREATE INDEX IF NOT EXISTS idx_skus_color ON product_skus (color_code);
CREATE INDEX IF NOT EXISTS idx_skus_status ON product_skus (status);
