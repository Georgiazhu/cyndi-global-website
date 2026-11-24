-- Customer Portal: forgot-password verification codes.
-- Runtime self-migration in functions/_lib/portal.js keeps production D1 in sync
-- even when migrations cannot be applied manually.

CREATE TABLE IF NOT EXISTS portal_password_resets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL,
  email         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  reset_at      TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_resets_customer
  ON portal_password_resets(customer_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_portal_resets_email
  ON portal_password_resets(email, created_at DESC);
