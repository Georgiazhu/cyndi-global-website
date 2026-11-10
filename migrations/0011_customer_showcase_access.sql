-- Showcase 改用商城客户账户（方案一）。
--  1) 客户公司表 clients；customers 增加 client_id / showcase_access / username。
--  2) 把原 Showcase 的 HRT 账号复制成客户账户（邮箱占位 hrt@clients.cyndiglobal.invalid，用户名 HRT），
--     密码哈希原样复制：showcase_users 与 customers 用的是同一种旧格式 SHA-256(password + salt) hex，
--     盐单独存在 password_salt 列，两边校验函数逐字节一致；首次登录后自动升级为 PBKDF2。
--  3) 已有的 HRT Showcase 订单（SC-，notes 以 [showcase:HRT] 开头）归到这个客户账户。
-- 其他 showcase_users 账号（如有）在第一次登录时由 functions/_lib/customer-auth.js 懒迁移。
-- 注意：ALTER TABLE ADD COLUMN 在 SQLite 里不能写 IF NOT EXISTS，本文件只能执行一次（D1 migrations 会保证）。

CREATE TABLE IF NOT EXISTS clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',   -- active / disabled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE customers ADD COLUMN client_id INTEGER;
ALTER TABLE customers ADD COLUMN showcase_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_username ON customers(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_client_id ON customers(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

INSERT OR IGNORE INTO clients (code, name, status, created_at, updated_at)
VALUES ('HRT', 'HRT', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- 原先运行时才建的表（functions/api/showcase/auth-lib.js 旧 SHOWCASE_USERS_SCHEMA），保证下面的复制在新库上也不报错
CREATE TABLE IF NOT EXISTS showcase_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 先清掉悬空的 orders.customer_id（指向已不存在的客户）。否则新建的客户账户如果拿到同一个 id，
-- 会"继承"别人的历史订单并在"我的订单"里看到它们。
UPDATE orders
SET customer_id = NULL
WHERE customer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = orders.customer_id);

-- 复制 HRT（保留原密码；原账号被禁用则客户账户也是 disabled）
INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at, client_id, showcase_access, username)
SELECT 'hrt@clients.cyndiglobal.invalid',
       su.password_hash,
       su.password_salt,
       COALESCE(su.display_name, 'HRT'),
       CASE WHEN su.status = 'active' THEN 'active' ELSE 'disabled' END,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       (SELECT id FROM clients WHERE code = 'HRT'),
       1,
       'HRT'
FROM showcase_users su
WHERE su.username = 'HRT'
  AND NOT EXISTS (SELECT 1 FROM customers WHERE lower(email) = 'hrt@clients.cyndiglobal.invalid' OR username = 'HRT');

-- 库里根本没有 HRT 旧账号时，也建好 HRT 客户账户，但没有可用密码（'!'），由管理员在后台重置密码
INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at, client_id, showcase_access, username)
SELECT 'hrt@clients.cyndiglobal.invalid', '!', '', 'HRT', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       (SELECT id FROM clients WHERE code = 'HRT'), 1, 'HRT'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE lower(email) = 'hrt@clients.cyndiglobal.invalid' OR username = 'HRT');

-- 已复制成功的旧账号标记为 migrated，之后不再被任何代码使用
UPDATE showcase_users
SET status = 'migrated', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE username = 'HRT'
  AND EXISTS (SELECT 1 FROM customers c
              WHERE c.username = 'HRT'
                AND c.password_hash = showcase_users.password_hash
                AND c.password_salt = showcase_users.password_salt);

-- 回填：HRT 下过的 Showcase 订单归到 HRT 客户账户（substr 做大小写精确匹配）
UPDATE orders
SET customer_id = (SELECT id FROM customers WHERE username = 'HRT')
WHERE order_no LIKE 'SC-%'
  AND customer_id IS NULL
  AND notes LIKE '[showcase:HRT]%'
  AND substr(notes, 1, 14) = '[showcase:HRT]'
  AND EXISTS (SELECT 1 FROM customers WHERE username = 'HRT');
