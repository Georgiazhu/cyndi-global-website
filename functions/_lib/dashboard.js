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
import { getCustomerPool, filterByPool } from './client-showcase.js';
import {
  CHANNELS, ensureOrderChannelSchema, normalizeChannel, channelLabel, orderKind,
} from './order-channels.js';

// Per-binding cache: previews and tests use several D1 bindings in one isolate.
const schemaByDb = new WeakMap();

export async function ensureDashboardSchema(db) {
  let schemaPromise = schemaByDb.get(db);
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
        delivery_city   TEXT NOT NULL DEFAULT '',
        updated_at      TEXT NOT NULL
      )`).run();
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_client_projects_user ON client_projects(user_id, created_at DESC)').run();
      } catch {}
      // Existing installs created before `brief` / `delivery_city` existed — add them defensively.
      try {
        await db.prepare("ALTER TABLE client_projects ADD COLUMN brief TEXT NOT NULL DEFAULT ''").run();
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) {
          console.error('dashboard schema (client_projects.brief):', e?.message);
        }
      }
      try {
        await db.prepare("ALTER TABLE client_projects ADD COLUMN delivery_city TEXT NOT NULL DEFAULT ''").run();
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) {
          console.error('dashboard schema (client_projects.delivery_city):', e?.message);
        }
      }
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN project_no TEXT').run();
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) {
          console.error('dashboard schema (orders.project_no):', e?.message);
        }
      }
      await ensureOrderChannelSchema(db);
    })().catch((e) => { schemaByDb.delete(db); throw e; });
    schemaByDb.set(db, schemaPromise);
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

// Frontend order items are arrays:
// [name, sku, size, qty, color, unitPrice, lineTotal, setupFee, printFee, decoration].
// D1 keeps a snapshot with shop fields; map both shapes defensively.
function shapeOrderItems(raw) {
  return arrayOf(parseJson(raw, [])).map((it) => {
    const common = [
      String(it?.name || 'Product'),
      String(it?.sku || it?.stockSku || it?.id || 'ITEM'),
      String(it?.selectedSize || it?.size || 'OS'),
      int(it?.quantity, 1),
      String(it?.colorName || it?.color || ''),
    ];
    if (Array.isArray(it)) {
      return [
        common[0], common[1], common[2], common[3], String(it[4] || ''),
        Number(it[5]) || 0, Number(it[6]) || 0,
        Number(it[7]) || 0, Number(it[8]) || 0, String(it[9] || ''),
      ];
    }
    return [
      ...common,
      Number(it?.unitPrice) || 0, Number(it?.lineTotal) || 0,
      Number(it?.setupFee) || 0, Number(it?.printFee) || 0,
      String(it?.decoration || ''),
    ];
  });
}
function units(items) { return items.reduce((sum, it) => sum + int(it[3], 0), 0); }
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function orderTotal(items) { return round2(items.reduce((sum, it) => sum + (Number(it[6]) || 0), 0)); }

// Same tier rule as the Showcase checkout: highest quantity tier <= ordered qty.
function tierUnitPrice(pricing, quantity) {
  const tiers = (Array.isArray(pricing) ? pricing : [])
    .filter((t) => t && Number.isFinite(Number(t.quantity)) && Number.isFinite(Number(t.price)))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  if (!tiers.length) return 0;
  let price = Number(tiers[0].price);
  for (const t of tiers) if (quantity >= Number(t.quantity)) price = Number(t.price);
  return round2(price);
}
function priceLine(catalogue, sku, qty, setupFee = 0, printFee = 0, decoration = '') {
  const product = catalogue.find((p) => String(p.sku) === String(sku));
  const unitPrice = tierUnitPrice(product?.pricing, qty);
  const setup = Math.max(0, Number(setupFee) || 0);
  const print = Math.max(0, Number(printFee) || 0);
  const lineTotal = round2(qty * unitPrice + setup + qty * print);
  return { unitPrice, setupFee: round2(setup), printFee: round2(print), decoration: text(decoration, 40), lineTotal };
}

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

// The client's showcase = their curated slice of the global product catalogue.
// These are the ONLY products a client may pick into a project shortlist.
async function showcaseForDashboard(db, customerId) {
  try {
    const pool = await getCustomerPool(db, customerId);
    const cats = await db.prepare('SELECT id, name FROM showcase_categories ORDER BY sort ASC, name ASC').all();
    const prods = await db.prepare(
      `SELECT id, category_id, sku, name, image, colors_json, sizes_json, pricing_json
       FROM showcase_products ORDER BY sort ASC, name ASC`
    ).all();
    const names = new Map((cats.results || []).map((c) => [c.id, c.name]));
    const list = (prods.results || []).map((p) => {
      let price = 0;
      try {
        const arr = JSON.parse(p.pricing_json || '[]');
        if (Array.isArray(arr) && arr.length) price = Number(arr[0].price) || 0;
      } catch {}
      return {
        id: String(p.id), sku: p.sku || String(p.id), name: p.name,
        image: p.image || '', price, category: names.get(p.category_id) || '',
        colors: arrayOf(parseJson(p.colors_json, [])),
        sizes: arrayOf(parseJson(p.sizes_json, [])),
        pricing: arrayOf(parseJson(p.pricing_json, [])),
      };
    });
    return filterByPool(list, pool);
  } catch (e) {
    console.error('dashboard showcase:', e?.message);
    return [];
  }
}

// One read assembles every dashboard section from real D1 rows.
export async function loadDashboard(db, user) {
  await ensureDashboardSchema(db);
  // New accounts start with an empty project list. Demo seeding was removed
  // because "Projects" must be the real starting point for every client event.
  const id = uid(user);
  const pRes = await db.prepare(
    'SELECT * FROM client_projects WHERE user_id = ?1 ORDER BY created_at DESC'
  ).bind(id).all();
  const oRes = await db.prepare(
    'SELECT * FROM orders WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 200'
  ).bind(Number(id)).all();

  const orders = (oRes.results || []).map((r) => {
    const channel = normalizeChannel(r.order_channel, r.source_type === 'REWARDS_STORE' ? 'M2'
      : r.source_type === 'PERSONAL_LINK' ? 'M3' : r.source_type === 'OPEN_PORTAL' ? 'M4' : 'M1');
    const meta = CHANNELS[channel];
    return {
      id: r.order_no,
      project: r.project_no || '',
      created: day(r.created_at),
      items: shapeOrderItems(r.items_json),
      status: r.status || 'received',
      total: Number(r.total || 0),
      channel,
      channelLabel: channelLabel(channel),
      kind: orderKind(r),
      portalId: r.portal_id || '',
      origin: r.origin_type || meta.origin,
      sourceType: r.source_type || meta.sourceType,
      approvalStatus: r.approval_status || 'NOT_REQUIRED',
      fulfilmentStatus: r.fulfilment_status || 'READY_FOR_DISPATCH',
      shipping: r.shipping_name ? {
        name: r.shipping_name, email: r.shipping_email || '', phone: r.shipping_phone || '',
        countryCode: r.shipping_country_code || '', state: r.shipping_state || '',
        city: r.shipping_city || '', postalCode: r.shipping_postal_code || '',
        address1: r.shipping_address_line1 || '', address2: r.shipping_address_line2 || '',
      } : null,
    };
  });

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
    deliveryCity: text(r.delivery_city, 120),
    stage: int(r.stage, 1),
    done: r.status === 'completed',
    status: r.status || 'active',
    shortlist: arrayOf(parseJson(r.shortlist_json, [])),
    mockups: arrayOf(parseJson(r.mockups_json, [])),
    orderCount: orders.filter((o) => o.project === r.project_no).length,
    activity: byProject.get(r.project_no) || [],
    latest: (byProject.get(r.project_no) || [])[0] || null,
  }));

  // Dashboard stock is the net of purchase orders (in) and requisitions (out).
  // The warehouse table is the source of truth for admin; this is the client-facing view.
  // Never let a stock-shaping edge case take down the whole Projects page.
  let inventory = [];
  try {
    const stock = new Map();
    for (const o of orders) {
      const cancelled = ['cancelled', 'rejected'].includes(String(o.status || '').toLowerCase())
        || String(o.approvalStatus || '').toUpperCase() === 'REJECTED';
      if (cancelled) continue;
      const isReq = o.kind === 'REQUISITION';
      for (const it of o.items) {
        const color = it[4] || '';
        const key = `${it[1]}::${it[2]}::${color}`;
        const row = stock.get(key) || {
          sku: it[1], name: it[0], color, size: it[2], onHand: 0,
          purchaseOrders: 0, requisitions: 0, source: 'Purchase orders − requisitions',
        };
        const qty = int(it[3], 0);
        row.purchaseOrders += isReq ? 0 : qty;
        row.requisitions += isReq ? qty : 0;
        row.onHand += isReq ? -qty : qty;
        stock.set(key, row);
      }
    }
    inventory = [...stock.values()].sort((a, b) => b.onHand - a.onHand);
  } catch (e) {
    console.error('dashboard stock:', e?.message);
    // Fallback: keep the old positive-only view so Projects / Orders still load.
    try {
      const stock = new Map();
      for (const o of orders) {
        if (!Array.isArray(o.items)) continue;
        for (const it of o.items) {
          if (!Array.isArray(it)) continue;
          const color = it[4] || '';
          const key = `${it[1]}::${it[2]}::${color}`;
          const row = stock.get(key) || {
            sku: it[1], name: it[0], color, size: it[2], onHand: 0,
            purchaseOrders: int(it[3], 0), requisitions: 0, source: 'Purchase orders',
          };
          row.onHand += int(it[3], 0);
          stock.set(key, row);
        }
      }
      inventory = [...stock.values()].sort((a, b) => b.onHand - a.onHand);
    } catch {
      inventory = [];
    }
  }

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName || user.display_name },
    projects,
    showcase: await showcaseForDashboard(db, id),
    orders,
    inventory,
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

  // Clients can start a project themselves; it starts empty and the first step
  // is picking products from their own showcase pool.
  if (action === 'createProject') {
    const title = text(body?.title, 160) || 'New SWAG Project';
    const brief = text(body?.brief, 600);
    const deliveryCity = text(body?.deliveryCity ?? body?.delivery_city, 120);
    const no = await nextProjectNo(db);
    const at = now();
    await db.prepare(`INSERT INTO client_projects
      (project_no,user_id,title,created_by,created_at,stage,status,shortlist_json,mockups_json,brief,delivery_city,updated_at)
      VALUES (?1,?2,?3,?4,?5,1,'active','[]','[]',?6,?7,?8)`).bind(
      no, uid(user), title, uname(user), at, brief, deliveryCity, at
    ).run();
    await logActivity(db, no, uname(user), 'project_created', `Client created project ${title}`, 'client');
    return { ok: true, projectNo: no, message: `${no} created · pick products from your showcase` };
  }

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
    case 'addShortlist': {
      const ids = (Array.isArray(body?.productIds) ? body.productIds : [body?.productId])
        .map((x) => text(x, 80)).filter(Boolean);
      if (!ids.length) throw Object.assign(new Error('Choose a product first'), { status: 400 });
      const pool = await showcaseForDashboard(db, uid(user));
      const list = arrayOf(parseJson(row.shortlist_json, []));
      const picked = [];
      for (const id of ids) {
        const item = pool.find((x) => x.id === id);
        if (!item) throw Object.assign(new Error('That product is not in your showcase'), { status: 403 });
        if (list.some((s) => String(s[1]) === String(item.sku))) continue;
        list.push([item.name, item.sku, item.price, item.image]);
        picked.push(item.name);
      }
      if (picked.length) {
        await save({ shortlist: list });
        await logActivity(db, projectNo, uname(user), 'shortlist_item_added',
          `${picked.length} product${picked.length === 1 ? '' : 's'} added from your showcase: ${picked.join(', ')}`, 'client');
      }
      return { ok: true, added: picked.length, message: picked.length ? `${picked.length} product(s) added to the shortlist` : 'Already in the shortlist' };
    }
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
      const removed = list[i];
      const label = typeof removed === 'string' ? removed : (removed?.label || 'Design mockup');
      list.splice(i, 1);
      await save({ mockups: list });
      await logActivity(db, projectNo, uname(user), 'mockup_rejected', `Client rejected "${label}" · ${reason}`, 'client');
      return { ok: true, message: `Design removed · reason: ${reason}` };
    }
    case 'uploadMockup': {
      const list = arrayOf(parseJson(row.mockups_json, []));
      const fileName = text(body?.fileName, 120);
      const imageUrl = text(body?.imageUrl, 500);
      if (!imageUrl && !fileName) throw Object.assign(new Error('Choose a file first'), { status: 400 });
      list.push({ label: fileName || 'Client design', image: imageUrl, by: uname(user), role: 'client' });
      await save({ mockups: list });
      await logActivity(db, projectNo, uname(user), 'mockup_uploaded', `Client uploaded ${fileName || 'a design'} for review`, 'client');
      return { ok: true, message: 'Design uploaded for Cyndi to review' };
    }
    case 'returnMockup': {
      const reason = text(body?.reason, 600);
      if (!reason) throw Object.assign(new Error('Add a note for Cyndi'), { status: 400 });
      await save({ stage: 2 });
      await logActivity(db, projectNo, uname(user), 'mockup_returned', `Client returned mockups · ${reason}`, 'client');
      return { ok: true, message: 'Mockups returned to Cyndi with your notes' };
    }
    case 'confirmMockup': {
      const list = arrayOf(parseJson(row.mockups_json, []));
      if (!list.length) throw Object.assign(new Error('Cyndi has not uploaded any mockups yet'), { status: 409 });
      await save({ stage: 3 });
      await logActivity(db, projectNo, uname(user), 'mockup_confirmed', 'Client approved the mockup · ready for order', 'client');
      return { ok: true, message: 'Mockup confirmed · choose colors, sizes and quantities' };
    }
    case 'confirmOrder': {
      if (int(row.stage, 1) < 3) throw Object.assign(new Error('Mockup is not confirmed yet'), { status: 409 });
      const selections = Array.isArray(body?.items) ? body.items : [];
      if (!selections.length) throw Object.assign(new Error('No items to order'), { status: 400 });
      const shortlist = arrayOf(parseJson(row.shortlist_json, []));
      const catalogue = await showcaseForDashboard(db, uid(user));
      const items = selections.map((sel, i) => {
        // A line can duplicate a shortlist product (different colour/size), so
        // the client sends productIndex explicitly. Legacy clients fall back to
        // the old one-line-per-shortlist-item mapping.
        const requested = sel?.productIndex !== undefined ? int(sel.productIndex, -1) : i;
        const index = requested >= 0 && requested < shortlist.length ? requested : i;
        const src = shortlist[index] || ['Product', 'ITEM', 0];
        const sku = String(src[1] || 'ITEM');
        const qty = Math.max(1, int(sel?.qty, 1));
        const color = String(text(sel?.color, 40));
        const size = String(text(sel?.size, 20) || 'OS');
        const priced = priceLine(catalogue, sku, qty);
        return [String(src[0] || 'Product'), sku, size, qty, color,
          priced.unitPrice, priced.lineTotal, priced.setupFee, priced.printFee, priced.decoration];
      });
      const orderNo = await orderNoForProject(db, projectNo);
      const channel = normalizeChannel(body?.channel, 'M1');
      if (!['M1', 'M2'].includes(channel)) {
        throw Object.assign(new Error('Only M1/M2 orders can be created from a project'), { status: 400 });
      }
      const meta = CHANNELS[channel];
      const snapshot = items.map((it) => ({
        name: it[0], sku: it[1], size: it[2], quantity: it[3], color: it[4],
        unitPrice: it[5], lineTotal: it[6], setupFee: it[7], printFee: it[8], decoration: it[9],
      }));
      await db.prepare(`INSERT INTO orders
        (order_no,customer_id,customer_name,customer_email,items_json,item_count,total,status,created_at,status_updated_at,project_no,
         source_type,approval_status,fulfilment_status,order_channel,origin_type)
        VALUES (?1,?2,?3,?4,?5,?6,?7,'confirmed',?8,?8,?9,?10,'NOT_REQUIRED','READY_FOR_DISPATCH',?11,?12)`).bind(
        orderNo, Number(uid(user)), uname(user), user.email,
        JSON.stringify(snapshot), units(items), orderTotal(items), ts, projectNo,
        meta.sourceType, channel, meta.origin
      ).run();
      await save({ status: 'completed' });
      await logActivity(db, projectNo, uname(user), 'order_created',
        `${orderNo} created · $${orderTotal(items).toFixed(2)} · ${units(items)} pcs`, 'client');
      return { ok: true, orderNo, total: orderTotal(items), message: `${orderNo} created · $${orderTotal(items).toFixed(2)} · ${units(items)} pcs` };
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
  const orderRes = await db.prepare(
    'SELECT * FROM orders WHERE project_no IS NOT NULL ORDER BY created_at DESC LIMIT 200'
  ).all();
  const ordersByProject = new Map();
  for (const o of orderRes.results || []) {
    if (!ordersByProject.has(o.project_no)) ordersByProject.set(o.project_no, []);
    const channel = normalizeChannel(o.order_channel, o.source_type === 'REWARDS_STORE' ? 'M2' : 'M1');
    ordersByProject.get(o.project_no).push({
      id: o.order_no, total: Number(o.total || 0), status: o.status || 'confirmed',
      created: day(o.created_at), items: shapeOrderItems(o.items_json),
      channel, channelLabel: channelLabel(channel),
      approvalStatus: o.approval_status || 'NOT_REQUIRED',
    });
  }
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
    deliveryCity: text(r.delivery_city, 120),
    stage: int(r.stage, 1),
    status: r.status || 'active',
    done: r.status === 'completed',
    shortlist: arrayOf(parseJson(r.shortlist_json, [])),
    mockups: arrayOf(parseJson(r.mockups_json, [])),
    orders: ordersByProject.get(r.project_no) || [],
    orderCount: (ordersByProject.get(r.project_no) || []).length,
    activity: byProject.get(r.project_no) || [],
    latest: (byProject.get(r.project_no) || [])[0] || null,
  }));
}

export async function adminCreateProject(db, customer, data, adminName) {
  await ensureDashboardSchema(db);
  const title = text(data?.title, 160) || 'New SWAG Project';
  const brief = text(data?.brief, 600);
  const deliveryCity = text(data?.deliveryCity ?? data?.delivery_city, 120);
  const projectNo = await nextProjectNo(db);
  const ts = now();
  await db.prepare(`INSERT INTO client_projects
    (project_no,user_id,title,created_by,created_at,stage,status,shortlist_json,mockups_json,brief,delivery_city,updated_at)
    VALUES (?1,?2,?3,?4,?5,1,'active','[]','[]',?6,?7,?8)`).bind(
    projectNo, String(customer.id), title, adminName, ts, brief, deliveryCity, ts
  ).run();
  await logActivity(db, projectNo, adminName, 'project_created', `Project created for ${customer.email || 'customer'}`, 'admin');
  return { ok: true, projectNo };
}

/** Admin curates the project shortlist from the product showcase, then publishes it. */
export async function adminPublishShortlist(db, projectNo, products, adminName, confirm = false) {
  await ensureDashboardSchema(db);
  const current = await db.prepare('SELECT stage, status, user_id, mockups_json, brief FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!current) throw Object.assign(new Error('Project not found'), { status: 404 });

  // Admin picks must follow the same customer showcase pool rule as client picks.
  const allowed = new Map();
  let hasPool = false;
  try {
    const pool = await getCustomerPool(db, current.user_id);
    hasPool = pool !== null;
    const poolIds = new Set((pool || []).map(String));
    const rows = await db.prepare('SELECT id, sku, name, image, pricing_json FROM showcase_products').all();
    for (const p of rows.results || []) {
      if (hasPool && !poolIds.has(String(p.id))) continue;
      allowed.set(String(p.sku || p.id), p);
    }
  } catch {}
  const incoming = (Array.isArray(products) ? products : []).slice(0, 200);
  const list = incoming.map((p) => {
    const sku = text(p?.sku, 60) || 'ITEM';
    const source = allowed.get(sku);
    if (hasPool && !source) {
      throw Object.assign(new Error(`${sku} is not in this customer's showcase`), { status: 403 });
    }
    let price = Number(p?.price) || 0;
    try {
      const tiers = arrayOf(parseJson(source?.pricing_json, []));
      if (tiers.length) price = Number(tiers[0].price) || price;
    } catch {}
    const name = text(source?.name || p?.name, 160) || 'Product';
    const image = text(source?.image || p?.image, 500);
    return image ? [name, sku, price, image] : [name, sku, price];
  });
  const patch = { shortlist: list };
  if (confirm) patch.stage = 2;
  const shortlist = patch.shortlist;
  const stage = patch.stage;
  const ts = now();
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
    return {
      label: text(m?.label, 200) || 'Design mockup',
      sku: text(m?.sku, 60),
      image: text(m?.image, 500),
      kind: text(m?.kind, 20),
      pdfUrl: text(m?.pdfUrl, 500),
      by: adminName,
      role: 'admin',
    };
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
  const deliveryCity = text(data?.deliveryCity ?? data?.delivery_city, 120);
  if (!title && !brief && !deliveryCity) return { ok: true };
  const sets = [], binds = [];
  if (title) { sets.push('title=?'); binds.push(title); }
  if (brief) { sets.push('brief=?'); binds.push(brief); }
  if (deliveryCity) { sets.push('delivery_city=?'); binds.push(deliveryCity); }
  sets.push('updated_at=?'); binds.push(now());
  binds.push(projectNo);
  const res = await db.prepare(`UPDATE client_projects SET ${sets.join(',')} WHERE project_no=?`).bind(...binds).run();
  if (!res?.success && !res?.changes) throw Object.assign(new Error('Project not found'), { status: 404 });
  await logActivity(db, projectNo, adminName, 'project_updated', title ? `Title set to ${title}` : 'Brief updated', 'admin');
  return { ok: true };
}

/** Admin creates a production order for a project from its shortlist. */
export async function adminCreateOrder(db, projectNo, items, adminName, channelInput) {
  await ensureDashboardSchema(db);
  const row = await db.prepare('SELECT * FROM client_projects WHERE project_no = ?1').bind(projectNo).first();
  if (!row) throw Object.assign(new Error('Project not found'), { status: 404 });
  const channel = normalizeChannel(channelInput, 'M1');
  if (!['M1', 'M2'].includes(channel)) {
    throw Object.assign(new Error('Only M1/M2 orders can be created from a project'), { status: 400 });
  }
  const meta = CHANNELS[channel];
  const selections = Array.isArray(items) ? items : [];
  if (!selections.length) throw Object.assign(new Error('No items to order'), { status: 400 });
  const shortlist = arrayOf(parseJson(row.shortlist_json, []));
  const catalogue = await showcaseForDashboard(db, row.user_id);
  const mapped = selections.map((sel, i) => {
    const requested = sel?.productIndex !== undefined ? int(sel.productIndex, -1) : i;
    const index = requested >= 0 && requested < shortlist.length ? requested : i;
    const src = shortlist[index] || ['Product', 'ITEM', 0];
    const sku = String(src[1] || 'ITEM');
    const qty = Math.max(1, int(sel?.qty, 1));
    const priced = priceLine(catalogue, sku, qty, sel?.setupFee, sel?.printFee, sel?.decoration);
    return [
      String(src[0] || 'Product'), sku, String(text(sel?.size, 20) || 'OS'), qty,
      String(text(sel?.color, 40)), priced.unitPrice, priced.lineTotal,
      priced.setupFee, priced.printFee, priced.decoration,
    ];
  });
  const orderNo = await orderNoForProject(db, projectNo);
  const snapshot = mapped.map((it) => ({
    name: it[0], sku: it[1], size: it[2], quantity: it[3], color: it[4],
    unitPrice: it[5], lineTotal: it[6], setupFee: it[7], printFee: it[8], decoration: it[9],
  }));
  const ts = now();
  const customerId = Number(uid({ id: row.user_id })) || 0;
  await db.prepare(`INSERT INTO orders
    (order_no,customer_id,customer_name,customer_email,items_json,item_count,total,status,created_at,status_updated_at,project_no,
     source_type,approval_status,fulfilment_status,order_channel,origin_type)
    VALUES (?1,?2,?3,?4,?5,?6,?7,'confirmed',?8,?8,?9,?10,'NOT_REQUIRED','READY_FOR_DISPATCH',?11,?12)`).bind(
    orderNo, customerId, row.creator || 'Cyndi Global', '',
    JSON.stringify(snapshot), units(mapped), orderTotal(mapped), ts, projectNo,
    meta.sourceType, channel, meta.origin
  ).run();
  await db.prepare("UPDATE client_projects SET stage=3, status='completed', updated_at=?1 WHERE project_no=?2").bind(ts, projectNo).run();
  await logActivity(db, projectNo, adminName, 'order_created',
    `Cyndi created order ${orderNo} · $${orderTotal(mapped).toFixed(2)} · ${units(mapped)} pcs`, 'admin');
  return { ok: true, orderNo, total: orderTotal(mapped), units: units(mapped) };
}

/** Cyndi adds setup / per-piece decoration fees to an existing project order. */
export async function adminUpdateOrderPricing(db, orderNo, lines, adminName) {
  await ensureDashboardSchema(db);
  const row = await db.prepare('SELECT * FROM orders WHERE order_no = ?1').bind(orderNo).first();
  if (!row) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (['M3', 'M4'].includes(normalizeChannel(row.order_channel))) {
    throw Object.assign(new Error('Personal redemption prices are fixed; only company orders can be repriced'), { status: 403 });
  }
  const items = shapeOrderItems(row.items_json);
  const updates = Array.isArray(lines) ? lines : [];
  for (const update of updates) {
    const i = int(update?.index, -1);
    if (i < 0 || i >= items.length || !items[i]) continue;
    const setup = Math.max(0, Number(update?.setupFee) || 0);
    const print = Math.max(0, Number(update?.printFee) || 0);
    const unitPrice = Number(items[i][5]) || 0;
    const qty = Math.max(1, int(items[i][3], 1));
    items[i] = [
      items[i][0], items[i][1], items[i][2], qty, String(items[i][4] || ''),
      unitPrice, round2(qty * unitPrice + setup + qty * print),
      round2(setup), round2(print), String(text(update?.decoration || items[i][9], 40)),
    ];
  }
  const total = orderTotal(items);
  await db.prepare('UPDATE orders SET items_json=?1, total=?2, status_updated_at=?3 WHERE order_no=?4').bind(
    JSON.stringify(items.map((it) => ({
      name: it[0], sku: it[1], size: it[2], quantity: it[3], color: it[4],
      unitPrice: it[5], lineTotal: it[6], setupFee: it[7], printFee: it[8], decoration: it[9],
    }))), total, now(), orderNo
  ).run();
  if (row.project_no) {
    await logActivity(db, row.project_no, adminName, 'order_priced',
      `Cyndi priced ${orderNo} · $${total.toFixed(2)}`, 'admin');
  }
  return { ok: true, orderNo, total };
}

export async function adminDeleteProject(db, projectNo, adminName) {
  await ensureDashboardSchema(db);
  await logActivity(db, projectNo, adminName, 'project_deleted', 'Project deleted by Cyndi Global', 'admin');
  await db.prepare('DELETE FROM client_project_activity WHERE project_no = ?1').bind(projectNo).run();
  await db.prepare('DELETE FROM client_projects WHERE project_no = ?1').bind(projectNo).run();
  return { ok: true };
}

export { orderNoForProject };
