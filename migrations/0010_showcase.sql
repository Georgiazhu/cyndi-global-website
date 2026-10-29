-- Showcase 选品展示站数据表
-- 数据在后台（/admin/showcase.html）可视化编辑，前台 https://www.cyndiglobal.com/showcase/ 读取。

-- 分类（对应 Kotis showcase 的 quote-header-wrapper 分组）
CREATE TABLE IF NOT EXISTS showcase_categories (
  id          TEXT PRIMARY KEY,          -- 英文锚点 id，如 canvas-totes
  name        TEXT NOT NULL,             -- 分类名（英文，不翻译）
  sort        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

-- 商品
CREATE TABLE IF NOT EXISTS showcase_products (
  id                 TEXT PRIMARY KEY,    -- 商品唯一 id
  category_id        TEXT NOT NULL,       -- 所属分类
  sku                TEXT,                -- 款号 / 产品编号
  name               TEXT NOT NULL,
  description        TEXT,
  features_json      TEXT,                -- JSON 数组：卖点
  materials          TEXT,
  image              TEXT,                -- 主图 URL
  gallery_json       TEXT,                -- JSON 数组：图库
  colors_json        TEXT,                -- JSON 数组：{name, hex, image}
  sizes_json         TEXT,                -- JSON 数组：尺寸
  pricing_json       TEXT,                -- JSON 数组：{quantity, price}
  price_includes     TEXT,
  price_notes_json   TEXT,                -- JSON 数组：价格备注
  charges_json       TEXT,                -- JSON 数组：{label, amount}
  currency           TEXT NOT NULL DEFAULT '$',
  sort               INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES showcase_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_showcase_products_category ON showcase_products(category_id, sort);

-- 全局设置（项目名、日期、收件人、免责声明等）
CREATE TABLE IF NOT EXISTS showcase_meta (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 图片存储回退表（仅当 R2 未启用时使用）
CREATE TABLE IF NOT EXISTS showcase_media (
  id           TEXT PRIMARY KEY,
  category_id  TEXT,
  file_name    TEXT,
  content_type TEXT,
  image_data   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_showcase_media_category ON showcase_media(category_id);
