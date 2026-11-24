-- Customer Portal: public self-registration email verification codes.
-- Runtime self-migration in functions/_lib/portal.js keeps production D1 in sync.

CREATE TABLE IF NOT EXISTS portal_registrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  registered_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_registrations_email
  ON portal_registrations(email, id DESC);
