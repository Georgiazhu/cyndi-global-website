CREATE TABLE IF NOT EXISTS logistics_admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
