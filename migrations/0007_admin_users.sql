-- 多管理员账号体系：username + 加盐密码哈希，替代原单一共享密码。
-- 兼容：原 logistics_admin_settings（单密码）和环境变量 LOGISTICS_ADMIN_PASSWORD 仍作兜底。

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username);

-- 初始管理员：username=admin，密码=password
-- password_hash = SHA-256("password" + salt)，salt 见下。
-- salt = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
-- SHA-256("password" + "a1b2c3d4e5f60718293a4b5c6d7e8f90") 在应用层生成；这里用预计算值。
INSERT OR IGNORE INTO admin_users (username, password_hash, password_salt, display_name, status, created_at, updated_at)
VALUES (
  'admin',
  '6c34f47abc0b3c35be244c4be5d011d11e393f806b7a88ac9df7c22d42184165',
  'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  'Administrator',
  'active',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);
