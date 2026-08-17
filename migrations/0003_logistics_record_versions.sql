CREATE TABLE IF NOT EXISTS logistics_record_versions (
  id TEXT PRIMARY KEY,
  product_no TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_record_versions_product_version
  ON logistics_record_versions(product_no, version_no);

CREATE INDEX IF NOT EXISTS idx_logistics_record_versions_product_created
  ON logistics_record_versions(product_no, created_at);
