// Portal dashboard data layer — reads/writes the REAL D1 database (cyndi-logistics).
//
// Live schema: customers(id,email,display_name,...), orders(order_no,customer_id,customer_name,
// customer_email,items_json,item_count,total,status,created_at,status_updated_at).
// The dashboard needs projects (shortlist -> mockup -> order) and an order->project link,
// which the legacy schema does not have. We add them idempotently at runtime:
//   client_projects          (new table)
//   client_project_activity  (new table — pushed updates / latest action feed)
//   orders.project_no       (new nullable column; ALTER TABLE ADD COLUMN cannot use IF NOT EXISTS)
// No existing row is modified unless the customer explicitly confirms a shortlist/mockup/order.

import { logActivity, listActivity } from './project-activity.js';

let schemaPromise = null;

export async function ensureDashboardSchema(db) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS client_projects (
        project_no      TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        title           TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        stage           INTEGER NOT NULL DEFAULT 1,
        status          TEXT NOT NULL DEFAULT 'active',
        shortlist_json  TEXT NOT NULL DEFAULT '[]',
        mockups_json    TEXT NOT NULL DEFAULT '[]',
        brief           TEXT NOT NULL DEFAULT '',
        updated_at      TEXT NOT NULL
      )`).run();
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_client_projects_user ON client_projects(user_id, created_at DESC)').run();
      } catch {}
      // Existing installs created before `brief` existed — add it defensively.
      try {
        await db.prepare("ALTER TABLE client_projects ADD COLUMN brief TEXT NOT NULL DEFAULT ''").run();
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) {
          console.error('dashboard schema (client_projects.brief):', e?.message);
        }
      }
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN project_no TEXT').run();
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) {
          console.error('dashboard schema (orders.project_no):', e?.message);
        }
      }
    })().catch((e) => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}

const now = () => new Date().toISOString();
const day = (v) => String(v || '').slice(0, 10);
const uid = (user) => String(user?.id ?? '');
const uname = (user) => user?.display_name || user?.displayName || user?.email || 'Cyndi client';

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}
function arrayOf(value) { return Array.isArray(value) ? value : []; }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function int(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Frontend order items are arrays: [name, sku, size, qty].
// D1 keeps a snapshot with shop fields; map both shapes defensively.
function shapeOrderItems(raw) {
  return arrayOf(parseJson(raw, [])).map((it) => {
    if (Array.isArray(it)) {
      return [String(it[0] || 'Product'), String(it[1] || 'ITEM'), String(it[2] || 'OS'), int(it[3], 1)];
    }
    const sku = it?.sku || it?.stockSku || it?.id || 'ITEM';
    const size = it?.selectedSize || it?.size || 'OS';
    return [String(it?.name || 'Product'), String(sku), String(size), int(it?.quantity, 1)];
  });
}
function units(items) { return items.reduce((sum, it) => sum + int(it[3], 0), 0); }

function orderNoForProject(db, projectNo) {
  return (async () => {
    const suffix = String(projectNo || '').split('-').pop();
    const prefix = `ORD-26-${suffix}-`;
    const rows = await db.prepare('SELECT order_no FROM orders WHERE order_no LIKE ?1').bind(`${prefix}%`).all();
    let seq = 0;
    for (const r of rows.results || []) {
      const n = int(String(r.order_no || '').slice(prefix.length), 0);
      if (n > seq) seq = n;
    }
    return prefix + String(seq + 1).padStart(2, '0');
  })();
}

// First visit only: if BOTH tables are empty for this customer, seed the demo program into D1.
// If the account already has real orders we never inject fake ones.
async function seedIfEmpty(db, user) {
  const id = uid(user);
  const projects = await db.prepare(
    'SELECT project_no FROM client_projects WHERE user_id = ?1 LIMIT 1'
  ).bind(id).first();
  const orders = await db.prepare(
    'SELECT order_no FROM orders WHERE customer_id = ?1 LIMIT 1'
  ).bind(Number(id)).first();
  if (projects || orders) return;

  const ts = now();
  const seeds = [
    ['PRJ-26-001', 'Q4 Onboarding Kit', 1, 'active',
      [['Heavyweight Hoodie', 'CW-HOOD-01', 38], ['Embroidered Cap', 'KP-CAP-02', 14], ['Insulated Bottle', 'BT-BTL-08', 22]],
      ['Left chest embroidery · Hoodie', 'Centre print · Tote']],
    ['PRJ-26-002', 'Global Sales Summit 2027', 2, 'active',
      [['Recycled Tote Bag', 'BG-TP-12', 18]],
      ['Front logo · Tote', 'Sleeve print · Tote']],
    ['PRJ-26-003', 'APAC Employee Care Package', 3, 'active',
      [['Insulated Bottle', 'BT-BTL-08', 22]],
      ['Laser engraving · Bottle']],
    ['PRJ-26-004', 'Brand Refresh Merch Drop', 3, 'completed',
      [['Organic Cotton Tee', 'CW-TEE-04', 26], ['Recycled Tote Bag', 'BG-TP-12', 18]],
      ['Front print · Tee']],
    ['PRJ-26-005', 'EMEA Client Gifts', 3, 'completed',
      [['Insulated Bottle', 'BT-BTL-08', 22]],
      ['Deboss · Bottle']],
  ];
  for (const [no, title, stage, status, shortlist, mockups] of seeds) {
    await db.prepare(`INSERT OR IGNORE INTO client_projects
      (project_no,user_id,title,created_by,created_at,stage,status,shortlist_json,mockups_json,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(
      no, id, title, uname(user), ts, stage, status,
      JSON.stringify(shortlist), JSON.stringify(mockups), ts
    ).run();
  }
  const realOrders = [
    ['ORD-26-004-01', 'PRJ-26-004', '2026-10-18',
      [['Organic Cotton Tee', 'CW-TEE-04', 'M', 600], ['Recycled Tote Bag', 'BG-TP-12', 'OS', 320]]],
    ['ORD-26-005-01', 'PRJ-26-005', '2026-09-02',
      [['Insulated Bottle', 'BT-BTL-08', 'OS', 280]]],
  ];
  for (const [no, project, createdAt, items] of realOrders) {
    const stamp = `${createdAt}T09:00:00.000Z`;
    await db.prepare(`INSERT OR IGNORE INTO orders
      (order_no,customer_id,customer_name,customer_email,items_json,item_count,total,status,created_at,status_updated_at,project_no)
      VALUES (?1,?2,?3,?4,?5,?6,0,'confirmed',?7,?7,?8)`).bind(
      no, Number(id), uname(user), user.email,
      JSON.stringify(items.map((it) => ({ name: it[0], sku: it[1], size: it[2], quantity: it[3] }))),
      units(items), stamp, project
    ).run();
  }
}

// One read assembles every dashboard section from real D1 rows.
export async function loadDashboard(db, user) {
  await ensureDashboardSchema(db);
  await seedIfEmpty(db, user);

  const id = uid(user);
  const pRes = await db.prepare(
    'SELECT * FROM client_projects WHERE user_id = ?1 ORDER BY created_at DESC'
  ).bind(id).all();
  const oRes = await db.prepare(
    'SELECT * FROM orders WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 200'
  ).bind(Number(id)).all();

  const orders = (oRes.results || []).map((r) => ({
    id: r.order_no,
    project: r.project_no || '',
    created: day(r.created_at),
    items: shapeOrderItems(r.items_json),
    status: r.status || 'received',
    total: Number(r.total || 0),
  }));

  const projectRows = pRes.results || [];
  const feed = await listActivity(db, projectRows.map((r) => r.project_no));
  const byProject = new Map();
  for (const a of feed) {
    if (!byProject.has(a.project)) byProject.set(a.project, []);
    byProject.get(a.project).push(a);
  }

  const projects = projectRows.map((r) => ({
    id: r.project_no,
    name: r.title,
    creator: r.created_by,
    created: day(r.created_at),
    updated: day(r.updated_at),
    brief: text(r.brief, 600),
    stage: int(r.stage, 1),
    done: r.status === 'completed',
    status: r.status || 'active',
    shortlist: arrayOf(parseJson(r.shortlist_json, [])),
    mockups: arrayOf(parseJson(r.mockups_json, [])),
    orderCount: orders.filter((o) => o.project === r.project_no).length,
    activity: byProject.get(r.project_no) || [],
    latest: (byProject.get(r.project_no) || [])[0] || null,
  }));

  // Stock is derived from confirmed orders in D1 — no separate fake inventory table.
  const stock = new Map();
  for (const o of orders) {
    for (const it of o.items) {
      const key = `${it[1]}::${it[2]}`;
      const row = stock.get(key) || { sku: it[1], name: it[0], size: it[2], onHand: 0, source: 'Confirmed orders' };
      row.onHand += int(it[3], 0);
      stock.set(key, row);
    }
  }

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName || user.display_name },
    projects,
    orders,
    inventory: [...stock.values()].sort((a, b) => b.onHand - a.onHand),
    showcases: [
      ['Cyndi Design | Global Onboarding', '74', '04/08/2026'],
      ['Brand Refresh | Holiday Event', '73', '04/02/2026'],
      ['EMEA Client Gifts | Swag', '143', '03/25/2026'],
    ],
    portals: [
      'New Hire Kits (/newhire-welcome)',
      'Employee Swag (/employeeswag)',
      'Client Gifts (/clientgifts)',
      'EMEA Portal (/emea)',
    ],
  };
}

async function getProject(db, user, projectNo) {
  const r = await db.prepare(
    'SELECT * FROM client_projects WHERE project_no = ?1 AND user_id = ?2'
  ).bind(projectNo, uid(user)).first();
  if (!r) throw Object.assign(new Error('Project not found'), { status: 404 });
  return r;
}

// POST /api/portal/dashboard/ — every dashboard action, written back to D1.
export async function mutateDashboard(db, user, body) {
  await ensureDashboardSchema(db);
  const action = text(body?.action, 40);
  const projectNo = text(body?.projectNo, 40);
  const row = await getProject(db, user, projectNo);
  const ts = now();

  const save = (patch) => {
    const shortlist = patch.shortlist !== undefined ? patch.shortlist : parseJson(row.shortlist_json, []);
    const mockups = patch.mockups !== undefined ? patch.mockups : parseJson(row.mockups_json, []);
    return db.prepare(`UPDATE client_projects SET stage=?1,status=?2,shortlist_json=?3,mockups_json=?4,updated_at=?5
      WHERE project_no=?6 AND user_id=?7`).bind(
      patch.stage ?? int(row.stage, 1), patch.status ?? row.status,
      JSON.stringify(shortlist), JSON.stringify(mockups), ts, projectNo, uid(user)
    ).run();
  };

  switch (action) {
    case 'removeShortlist': {
      const list = arrayOf(parseJson(row.shortlist_json, []));
      const i = int(body?.index, -1);
      if (i < 0 || i >= list.length) throw Object.assign(new Error('Invalid index'), { status: 400 });
      list.splice(i, 1);
      await save({ shortlist: list });
      return { ok: true, message: 'Product removed from shortlist' };
    }
    case 'confirmShortlist': {
      const list = arrayOf(parseJson(row.shortlist_json, []));
      if (!list.length) throw Object.assign(new Error('Add at least one product'), { status: 400 });
      await save({ stage: 2 });
      await logActivity(db, projectNo, uname(user), 'shortlist_confirmed', 'Client confirmed the shortlist · mockups in progress', 'client');
      return { ok: true, message: 'Shortlist confirmed · Cyndi is preparing mockups' };
    }
    case 'removeMockup': {
      const list = arrayOf(parseJson(row.mockups_json, []));
      const i = int(body?.index, -1);
      if (i < 0 || i >= list.length) throw Object.assign(new Error('Invalid index'), { status: 400 });
      const reason = text(body?.reason, 200) || 'no reason given';
      list.splice(i, 1);
      await save({ mockups: list });
      return { ok: true, message: `Design removed · reason: ${reason}` };
    }
    case 'uploadMockup': {
      const list = arrayOf(parseJson(row.mockups_json, []));
      const fileName = text(body?.fileName, 120);
      if (!fileName) throw Object.assign(new Error('Choose a file first'), { status: 400 });
      list.push(`${fileName} · uploaded by you`);
      await save({ mockups: list });
      return { ok: true, message: 'Mockup uploaded for review' };
    }
    case 'confirmMockup': {
      await save({ stage: 3 });
      await logActivity(db, projectNo, uname(user), 'mockup_confirmed', 'Client approved the mockup · ready for order', 'client');
      return { ok: true, message: 'Mockup confirmed · choose sizes and quantities' };
    }
    case 'confirmOrder': {
      if (int(row.stage, 1) < 3) throw Object.assign(new Error('Mockup is not confirmed yet'), { status: 409 });
      const selections = Array.isArray(body?.items) ? body.items : [];
      if (!selections.length) throw Object.assign(new Error('No items to order'), { status: 400 });
      const shortlist = arrayOf(parseJson(row.shortlist_json, []));
      const items = selections.map((sel, i) => {
        const src = shortlist[i] || ['Product', 'ITEM', 0];
        return [
          String(src[0] || 'Product'),
          String(src[1] || 'ITEM'),
          String(sel.size || 'OS').slice(0, 20),
          Math.max(1, int(sel.qty, 1)),
        ];
      });
      const orderNo = await orderNoForProject(db, projectNo);
      const snapshot = items.map((it) => ({ name: it[0], sku: it[1], size: it[2], quantity: it[3] }));
      await db.prepare(`INSERT INTO orders
        (order_no,customer_id,customer_name,customer_email,items_json,item_count,total,status,created_at,status_updated_at,project_no)
        VALUES (?1,?2,?3,?4,?5,?6,0,'confirmed',?7,?7,?8)`).bind(
        orderNo, Number(uid(user)), uname(user), user.email,
        JSON.stringify(snapshot), units(items), ts, projectNo
      ).run();
      await save({ status: 'completed' });
      return { ok: true, orderNo, message: `${orderNo} created · ${units(items)} pcs added to Inventory` };
    }
    default:
      throw Object.assign(new Error('Unknown action'), { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// Admin-side project management. These write the SAME client_projects rows the
// customer dashboard reads, so anything published here appears in the client's
// portal immediately (with an activity entry as the "latest action").
// ---------------------------------------------------------------------------

function nextProjectNo(db) {
  return (async () => {
    const rows = await db.prepare("SELECT project_no FROM client_projects WHERE project_no LIKE 'PRJ-%'").all();
    let max = 0;
    for (const r of rows.results || []) {
      const n = int(String(r.project_no || '').split('-').pop(), 0);
      if (n > max) max = n;
    }
    return `PRJ-26-${String(max + 1).padStart(3, '0')}`;
  })();
}

/** All projects across customers, joined with the owner, for the admin console. */
export async function listAdminProjects(db) {
  await ensureDashboardSchema(db);
  const res = await db.prepare(`SELECT p.*, c.email AS owner_email, c.display_name AS owner_name, c.username AS owner_username
    FROM client_projects p LEFT JOIN customers c ON CAST(c.id AS TEXT) = p.user_id
    ORDER BY p.updated_at DESC, p.created_at DESC`).all();
  const rows = res.results || [];
  const feed = await listActivity(db, rows.map((r) => r.project_no));
  const byProject = new Map();
  for (const a of feed) {
    if (!byProject.has(a.project)) byProject.set(a.project, []);
    byProject.get(a.project).push(a);
  }
  return rows.map((r) => ({
    id: r.project_no,
    title: r.title,
    customerId: Number(r.user_id) || 0,
    customerEmail: r.owner_email || '',
    customerName: r.owner_name || r.owner_username || '',
    creator: r.created_by,
    created: day(r.created_at),
    updated: day(r.updated_at),
    brief: text(r.brief, 600),
    stage: int(r.stage, 1),
    status: r.status || 'active',
    done: r.status === 'completed',
    shortlist: arrayOf(parseJson(r.shortlist_json, [])),
    mockups: arrayOf(parseJson(r.mockups_json, [])),
    orderCount: 0,
    activity: byProject.get(r.project_no) || [],
    latest: (byProject.get(r.project_no) || [])[0] || null,
  }));
}

export async function adminCreateProject(db, customer, data, adminName) {
  await ensureDashboardSchema(db);
  const title = text(data?.title, 160) || 'New SWAG Project';
  const brief = text(data?.brief, 600);
  const projectNo = await nextProjectNo(db);
  const ts = now();
  await db.prepare(`INSERT INTO client_projects
    (project_no,user_id,title,created_by,created_at,stage,status,shortlist_json,mockups_json,brief,updated_at)
    VALUES (?1,?2,?3,?4,?5,1,'active','[]','[]',?6,?7)`).bind(
    projectNo, String(customer.id), title, adminName, ts, brief, ts
  ).run();
  await logActivity(db, projectNo, adminName, 'project_created', `Project created for ${customer.email || 'customer'}`, 'admin');
  return { ok: true, projectNo };
}

/** Admin curates the project shortlist from the product showcase, then publishes it. */
export async function adminPublishShortlist(db, projectNo, products, adminName, confirm = false) {
  await ensureDashboardSchema(db);
  const list = (Array.isArray(products) ? products : []).slice(0, 200).map((p) => {
    const name = text(p?.name, 160) || 'Product';
    const sku = text(p?.sku, 60) || 'ITEM';
    const price = Number(p?.price) || 0;
    const image = text(p?.image, 500);
    return image ? [name, sku, price, image] : [name, sku, price];
  });
  const patch = { shortlist: list };
  if (confirm) patch.stage = 2;
  const shortlist = patch.shortlist;
  const stage = patch.stage;
  const ts = now();
  const current = await db.prepare('SELECT stage, status, mockups_json, brief FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!current) throw Object.assign(new Error('Project not found'), { status: 404 });
  await db.prepare(`UPDATE client_projects SET shortlist_json=?1, stage=?2, updated_at=?3 WHERE project_no=?4`).bind(
    JSON.stringify(shortlist), stage ?? int(current.stage, 1), ts, projectNo
  ).run();
  await logActivity(db, projectNo, adminName, confirm ? 'shortlist_confirmed' : 'shortlist_published',
    `${confirm ? 'Shortlist confirmed — mockups in progress' : `Cyndi published ${list.length} curated product${list.length === 1 ? '' : 's'}`}`, 'admin');
  return { ok: true, count: list.length };
}

/** Admin uploads design mockups (label + optional image URL) for the client to review. */
export async function adminPublishMockups(db, projectNo, mockups, adminName, confirm = false) {
  await ensureDashboardSchema(db);
  const list = (Array.isArray(mockups) ? mockups : []).slice(0, 100).map((m) => {
    if (typeof m === 'string') return text(m, 300);
    return { label: text(m?.label, 200) || 'Design mockup', image: text(m?.image, 500), by: adminName };
  });
  const current = await db.prepare('SELECT stage, status, shortlist_json, brief FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!current) throw Object.assign(new Error('Project not found'), { status: 404 });
  const ts = now();
  await db.prepare(`UPDATE client_projects SET mockups_json=?1, stage=?2, updated_at=?3 WHERE project_no=?4`).bind(
    JSON.stringify(list), confirm ? 3 : int(current.stage, 1), ts, projectNo
  ).run();
  await logActivity(db, projectNo, adminName, confirm ? 'mockup_confirmed' : 'mockups_published',
    confirm ? 'Cyndi confirmed the mockups — ready for order' : `Cyndi uploaded ${list.length} design mockup${list.length === 1 ? '' : 's'} for review`, 'admin');
  return { ok: true, count: list.length };
}

/** Admin advances a project stage (1 shortlist, 2 mockup, 3 order) or completes it. */
export async function adminSetStage(db, projectNo, stage, status, adminName, note = '') {
  await ensureDashboardSchema(db);
  const current = await db.prepare('SELECT stage, status FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!current) throw Object.assign(new Error('Project not found'), { status: 404 });
  const nextStage = stage === undefined ? int(current.stage, 1) : Math.max(1, Math.min(3, int(stage, 1)));
  const nextStatus = status === undefined ? (current.status || 'active') : (status === 'completed' ? 'completed' : 'active');
  await db.prepare('UPDATE client_projects SET stage=?1, status=?2, updated_at=?3 WHERE project_no=?4').bind(
    nextStage, nextStatus, now(), projectNo
  ).run();
  await logActivity(db, projectNo, adminName, 'stage_updated',
    text(note, 300) || `Cyndi set stage to ${['Shortlist', 'Mockup', 'Order'][nextStage - 1]}${nextStatus === 'completed' ? ' · completed' : ''}`, 'admin');
  return { ok: true };
}

export async function adminUpdateProject(db, projectNo, data, adminName) {
  await ensureDashboardSchema(db);
  const title = text(data?.title, 160);
  const brief = text(data?.brief, 600);
  if (!title && !brief) return { ok: true };
  const sets = [], binds = [];
  if (title) { sets.push('title=?'); binds.push(title); }
  if (brief) { sets.push('brief=?'); binds.push(brief); }
  sets.push('updated_at=?'); binds.push(now());
  binds.push(projectNo);
  const res = await db.prepare(`UPDATE client_projects SET ${sets.join(',')} WHERE project_no=?`).bind(...binds).run();
  if (!res?.success && !res?.changes) throw Object.assign(new Error('Project not found'), { status: 404 });
  await logActivity(db, projectNo, adminName, 'project_updated', title ? `Title set to ${title}` : 'Brief updated', 'admin');
  return { ok: true };
}

/** Admin creates a production order for a project from its shortlist. */
export async function adminCreateOrder(db, projectNo, items, adminName) {
  await ensureDashboardSchema(db);
  const row = await db.prepare('SELECT * FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!row) throw Object.assign(new Error('Project not found'), { status: 404 });
  const selections = Array.isArray(items) ? items : [];
  if (!selections.length) throw Object.assign(new Error('No items to order'), { status: 400 });
  const shortlist = arrayOf(parseJson(row.shortlist_json, []));
  const mapped = selections.map((sel, i) => {
    const src = shortlist[i] || ['Product', 'ITEM', 0];
    return [
      String(src[0] || 'Product'), String(src[1] || 'ITEM'),
      String(text(sel?.size, 20) || 'OS'), Math.max(1, int(sel?.qty, 1)),
    ];
  });
  const orderNo = await orderNoForProject(db, projectNo);
  const snapshot = mapped.map((it) => ({ name: it[0], sku: it[1], size: it[2], quantity: it[3] }));
  const ts = now();
  const customerId = Number(uid({ id: row.user_id })) || 0;
  await db.prepare(`INSERT INTO orders
    (order_no,customer_id,customer_name,customer_email,items_json,item_count,total,status,created_at,status_updated_at,project_no)
    VALUES (?1,?2,?3,?4,?5,?6,0,'confirmed',?7,?7,?8)`).bind(
    orderNo, customerId, row.creator || 'Cyndi Global', '',
    JSON.stringify(snapshot), units(mapped), ts, projectNo
  ).run();
  await db.prepare("UPDATE client_projects SET stage=3, status='completed', updated_at=?1 WHERE project_no=?2").bind(ts, projectNo).run();
  await logActivity(db, projectNo, adminName, 'order_created', `Cyndi created order ${orderNo} · ${units(mapped)} pcs`, 'admin');
  return { ok: true, orderNo, units: units(mapped) };
}

export async function adminDeleteProject(db, projectNo, adminName) {
  await ensureDashboardSchema(db);
  await logActivity(db, projectNo, adminName, 'project_deleted', 'Project deleted by Cyndi Global', 'admin');
  await db.prepare('DELETE FROM client_project_activity WHERE project_no = ?1').bind(projectNo).run();
  await db.prepare('DELETE FROM client_projects WHERE project_no = ?1').bind(projectNo).run();
  return { ok: true };
}

export { orderNoForProject };
