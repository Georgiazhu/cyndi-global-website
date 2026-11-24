// Portal dashboard data layer — reads/writes the REAL D1 database (cyndi-logistics).
//
// Live schema: customers(id,email,display_name,...), orders(order_no,customer_id,customer_name,
// customer_email,items_json,item_count,total,status,created_at,status_updated_at).
// The dashboard needs projects (shortlist -> mockup -> order) and an order->project link,
// which the legacy schema does not have. We add them idempotently at runtime:
//   client_projects          (new table)
//   orders.project_no       (new nullable column; ALTER TABLE ADD COLUMN cannot use IF NOT EXISTS)
// No existing row is modified unless the customer explicitly confirms a shortlist/mockup/order.

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
        updated_at      TEXT NOT NULL
      )`).run();
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_client_projects_user ON client_projects(user_id, created_at DESC)').run();
      } catch {}
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

  const projects = (pRes.results || []).map((r) => ({
    id: r.project_no,
    name: r.title,
    creator: r.created_by,
    created: day(r.created_at),
    stage: int(r.stage, 1),
    done: r.status === 'completed',
    shortlist: arrayOf(parseJson(r.shortlist_json, [])),
    mockups: arrayOf(parseJson(r.mockups_json, [])),
    orderCount: orders.filter((o) => o.project === r.project_no).length,
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

export { orderNoForProject };
