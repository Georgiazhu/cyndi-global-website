-- 0014_customer_portal.sql — 客户 Portal：两级角色 + 项目三阶段进度。
-- 客户账户沿用 customers 表（商城 + Showcase + Portal 共用）。
--   portal_role: 'viewer'（普通，默认、最小权限） | 'senior'（高级，可查询/下载）
--   must_change_password: 1 = 管理员建号未设密码，首次登录强制自设
-- portal_projects: 每个客户一个项目，三阶段 = showcase / mockup / order。
--   进度由管理员在 /admin/portal-projects.html 手动设置，客户前台只读。
-- 线上可用两种方式执行（任选其一）：
--   npx wrangler d1 execute cyndi-logistics --remote --file=migrations/0014_customer_portal.sql
--   或不做任何事：API 首次调用时由 functions/_lib/portal.js 运行时自迁移（等价 DDL）。
-- 注意：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS；运行时用 try/catch 吞掉重复列错误。

ALTER TABLE customers ADD COLUMN portal_role TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE customers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- 原有 Showcase 权限账号平滑升级为高级角色，不破坏现有登录
UPDATE customers SET portal_role = 'senior' WHERE showcase_access = 1;

CREATE TABLE IF NOT EXISTS portal_projects (
  customer_id    INTEGER PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT 'My SWAG Program',
  showcase_pct   INTEGER NOT NULL DEFAULT 0,
  mockup_pct     INTEGER NOT NULL DEFAULT 0,
  order_pct      INTEGER NOT NULL DEFAULT 0,
  showcase_note  TEXT,
  mockup_note    TEXT,
  order_note     TEXT,
  status         TEXT NOT NULL DEFAULT 'active',   -- active / archived
  updated_at     TEXT NOT NULL,
  updated_by     TEXT,
  CONSTRAINT pp_showcase_range CHECK (showcase_pct BETWEEN 0 AND 100),
  CONSTRAINT pp_mockup_range   CHECK (mockup_pct   BETWEEN 0 AND 100),
  CONSTRAINT pp_order_range    CHECK (order_pct    BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_portal_projects_status ON portal_projects(status);
