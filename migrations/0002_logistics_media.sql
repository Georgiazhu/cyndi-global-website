CREATE TABLE IF NOT EXISTS logistics_media (
  id TEXT PRIMARY KEY,
  product_no TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  image_data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logistics_media_product_no
  ON logistics_media(product_no, created_at);
