// Portal 数据层：运行时自迁移 + 项目进度读写。
// 线上 D1 无需手工执行 migration：首次调用时按需建表/加列（DDL 错误吞掉，幂等）。
// 与 migrations/0014_customer_portal.sql 完全等价。

let schemaReady = null; // 每个 isolate 只跑一次

export async function ensurePortalSchema(db) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    // customers 新列（重复列错误吞掉）
    for (const sql of [
      `ALTER TABLE customers ADD COLUMN portal_role TEXT NOT NULL DEFAULT 'viewer'`,
      `ALTER TABLE customers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
    ]) {
      try { await db.prepare(sql).run(); } catch (e) {
        if (!/duplicate column/i.test(e?.message || '')) console.error('portal schema:', e?.message);
      }
    }
    // 平滑升级：有 Showcase 权限的账号升为 senior
    try { await db.prepare(`UPDATE customers SET portal_role='senior' WHERE showcase_access=1 AND (portal_role IS NULL OR portal_role='viewer')`).run(); } catch {}

    await db.prepare(`CREATE TABLE IF NOT EXISTS portal_projects (
      customer_id    INTEGER PRIMARY KEY,
      title          TEXT NOT NULL DEFAULT 'My SWAG Program',
      showcase_pct   INTEGER NOT NULL DEFAULT 0,
      mockup_pct     INTEGER NOT NULL DEFAULT 0,
      order_pct      INTEGER NOT NULL DEFAULT 0,
      showcase_note  TEXT,
      mockup_note    TEXT,
      order_note     TEXT,
      status         TEXT NOT NULL DEFAULT 'active',
      updated_at     TEXT NOT NULL,
      updated_by     TEXT
    )`).run();
    try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_portal_projects_status ON portal_projects(status)`).run(); } catch {}
  })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

export function isSenior(row) {
  return !!row && (row.portal_role === 'senior' || Number(row.showcase_access) === 1);
}

const clampPct = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const now = () => new Date().toISOString();

// 客户读取自己的项目（不存在则按需建一个空项目，首访即有内容）
export async function getProjectForCustomer(db, customerId) {
  await ensurePortalSchema(db);
  let row = await db.prepare('SELECT * FROM portal_projects WHERE customer_id = ?1').bind(customerId).first();
  if (!row) {
    await db.prepare(`INSERT OR IGNORE INTO portal_projects (customer_id, title, updated_at)
      VALUES (?1, 'My SWAG Program', ?2)`).bind(customerId, now()).run();
    row = await db.prepare('SELECT * FROM portal_projects WHERE customer_id = ?1').bind(customerId).first();
  }
  return shapeProject(row);
}

function shapeProject(r) {
  if (!r) return null;
  return {
    title: r.title || 'My SWAG Program',
    stages: {
      showcase: { pct: Number(r.showcase_pct || 0), note: r.showcase_note || '' },
      mockup:   { pct: Number(r.mockup_pct || 0),   note: r.mockup_note || '' },
      order:    { pct: Number(r.order_pct || 0),    note: r.order_note || '' },
    },
    status: r.status || 'active',
    updatedAt: r.updated_at || null,
  };
}

// 管理员列出所有客户项目（LEFT JOIN，未建项目的客户也能设置）
export async function listProjects(db) {
  await ensurePortalSchema(db);
  const res = await db.prepare(`
    SELECT c.id AS customer_id, c.email, c.display_name, c.status AS customer_status,
           cl.name AS client_name,
           p.title, p.showcase_pct, p.mockup_pct, p.order_pct,
           p.showcase_note, p.mockup_note, p.order_note, p.status, p.updated_at
    FROM customers c
    LEFT JOIN clients cl ON cl.id = c.client_id
    LEFT JOIN portal_projects p ON p.customer_id = c.id
    ORDER BY c.id DESC
  `).all();
  return (res.results || []).map((r) => ({
    customerId: r.customer_id,
    email: r.email,
    displayName: r.display_name || null,
    clientName: r.client_name || null,
    customerStatus: r.customer_status,
    title: r.title || 'My SWAG Program',
    stages: {
      showcase: { pct: Number(r.showcase_pct || 0), note: r.showcase_note || '' },
      mockup:   { pct: Number(r.mockup_pct || 0),   note: r.mockup_note || '' },
      order:    { pct: Number(r.order_pct || 0),    note: r.order_note || '' },
    },
    status: r.status || (r.showcase_pct != null ? 'active' : 'none'),
    updatedAt: r.updated_at || null,
  }));
}

// 管理员 upsert 客户项目进度
export async function saveProject(db, body, actor) {
  await ensurePortalSchema(db);
  const customerId = Number(body.customerId);
  if (!Number.isInteger(customerId) || customerId < 1) throw new Error('Invalid customerId');
  const cust = await db.prepare('SELECT id FROM customers WHERE id = ?1').bind(customerId).first();
  if (!cust) throw new Error('Customer not found');

  const stages = body.stages && typeof body.stages === 'object' ? body.stages : {};
  const s = (key) => (stages[key] && typeof stages[key] === 'object' ? stages[key] : {});
  const sh = s('showcase'), mu = s('mockup'), or = s('order');
  const note = (v) => (typeof v === 'string' ? v.slice(0, 500) : '');

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : 'My SWAG Program';
  const status = ['active', 'archived'].includes(body.status) ? body.status : 'active';
  const ts = now();

  await db.prepare(`
    INSERT INTO portal_projects (customer_id, title, showcase_pct, mockup_pct, order_pct,
      showcase_note, mockup_note, order_note, status, updated_at, updated_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(customer_id) DO UPDATE SET
      title=excluded.title, showcase_pct=excluded.showcase_pct, mockup_pct=excluded.mockup_pct,
      order_pct=excluded.order_pct, showcase_note=excluded.showcase_note,
      mockup_note=excluded.mockup_note, order_note=excluded.order_note,
      status=excluded.status, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).bind(
    customerId, title,
    clampPct(sh.pct), clampPct(mu.pct), clampPct(or.pct),
    note(sh.note), note(mu.note), note(or.note),
    status, ts, actor || 'admin'
  ).run();

  const row = await db.prepare('SELECT * FROM portal_projects WHERE customer_id = ?1').bind(customerId).first();
  return shapeProject(row);
}
