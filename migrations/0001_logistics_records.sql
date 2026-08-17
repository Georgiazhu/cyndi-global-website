CREATE TABLE IF NOT EXISTS logistics_records (
  product_no TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logistics_records_updated_at ON logistics_records(updated_at);
