import { getAdminSecret, isAuthenticated, json, readSession } from '../../_lib/auth.js';
import { ORDER_STATUSES, allowedNext, statusLabel, transitionError } from '../../_lib/order-status.js';

/**
 * /api/admin/orders — admin view of every order in the `orders` table
 * (shop SW- orders from /api/orders and showcase SHOWCASE- orders from /api/showcase/orders).
 *
 *  GET  /api/admin/orders?type=&status=&q=&page=&pageSize=  -> paged list
 *  GET  /api/admin/orders?orderNo=SW-...                     -> one order with items + allowedNext
 *  POST /api/admin/orders {orderNo, status, expectedStatus}   -> change status
 *  POST /api/admin/orders {op:'migrateShowcaseOrderNumbers'}  -> rename legacy SC- numbers
 *  POST /api/admin/orders {op:'deleteCancelledOrders', orderNos:[...]} -> delete cancelled only
 *
 * Security: admin session required on every method; same-origin only (no CORS);
 * responses are no-store; parameterized queries only.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const ORDER_NO_RE = /^(SW-\d{8}-[A-Z0-9]{1,12}|SHOWCASE-\d{8}-\d{3,})$/;
const MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_Q = 100;

const reply = (data, status = 200) => json(data, status, NO_STORE);

// Returns { username } for a valid admin session, else null.
async function requireAdmin(request, env) {
  const secret = await getAdminSecret(env);
  const session = await readSession(request, secret);
  if (session) return session;
  // Legacy token format still accepted by the other admin endpoints.
  if (await isAuthenticated(request, secret)) return { username: 'admin' };
  return null;
}

const parseItems = (raw) => {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

function orderType(orderNo) {
  const s = String(orderNo || '');
  if (s.startsWith('SW-')) return 'SW';
  if (s.startsWith('SHOWCASE-')) return 'SC';
  return null;
}

function itemsCurrency(items) {
  const set = new Set(items.map((i) => (i && i.currency) || null));
  if (set.size !== 1) return null;
  const [only] = [...set];
  return only || null;
}

// Showcase orders store who placed them as a "[showcase:<username>]" notes prefix.
function splitNotes(notes) {
  const m = /^\[showcase:([^\]]*)\]\s?/.exec(notes || '');
  if (!m) return { placedBy: null, notes: notes || '' };
  return { placedBy: m[1] || null, notes: (notes || '').slice(m[0].length) };
}

function rowToDetail(row) {
  const items = parseItems(row.items_json);
  const { placedBy, notes } = splitNotes(row.notes);
  return {
    orderNo: row.order_no,
    type: orderType(row.order_no),
    status: row.status,
    statusLabel: statusLabel(row.status),
    allowedNext: allowedNext(row.status).map((s) => ({ value: s, label: statusLabel(s) })),
    createdAt: row.created_at,
    statusUpdatedAt: row.status_updated_at,
    customerId: row.customer_id ?? null,
    placedBy,
    contact: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      company: row.company,
    },
    notes,
    rawNotes: row.notes,
    items,
    lineCount: items.length,
    itemCount: row.item_count,
    total: row.total,
    currency: itemsCurrency(items),
  };
}

const DETAIL_SQL = `SELECT order_no, customer_name, customer_email, customer_phone, company, notes,
                           items_json, item_count, total, status, created_at, status_updated_at, customer_id
                    FROM orders WHERE order_no = ?1`;

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toInt(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await requireAdmin(request, env)) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(request.url).searchParams;

  // ---- One order ----
  const orderNo = params.get('orderNo');
  if (orderNo !== null) {
    const no = orderNo.trim();
    if (!ORDER_NO_RE.test(no)) return reply({ error: 'Invalid order number' }, 400);
    try {
      const row = await env.DB.prepare(DETAIL_SQL).bind(no).first();
      if (!row) return reply({ error: 'Order not found' }, 404);
      return reply({ order: rowToDetail(row) });
    } catch (e) {
      console.error('admin orders: detail', e?.message);
      return reply({ error: 'Could not load order' }, 500);
    }
  }

  // ---- List ----
  const type = (params.get('type') || 'all').trim();
  if (!['all', 'SW', 'SC'].includes(type)) return reply({ error: 'type must be all, SW or SC' }, 400);
  const status = (params.get('status') || '').trim();
  if (status.length > 40) return reply({ error: 'Invalid status filter' }, 400);
  const q = (params.get('q') || '').trim();
  if (q.length > MAX_Q) return reply({ error: `Search is too long (max ${MAX_Q} characters)` }, 400);
  const page = Math.max(1, toInt(params.get('page'), 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(params.get('pageSize'), DEFAULT_PAGE_SIZE)));

  // Base filter (type + search) — used for statusCounts so the status dropdown shows
  // counts for the current tab/search regardless of the selected status.
  const where = [];
  const binds = [];
  const bind = (v) => { binds.push(v); return `?${binds.length}`; };
  if (type === 'SW') where.push(`order_no LIKE 'SW-%'`);
  else if (type === 'SC') where.push(`order_no LIKE 'SHOWCASE-%'`);
  if (q) {
    const p = bind(`%${escapeLike(q)}%`);
    where.push(`(order_no LIKE ${p} ESCAPE '\\' OR customer_name LIKE ${p} ESCAPE '\\'`
      + ` OR customer_email LIKE ${p} ESCAPE '\\' OR company LIKE ${p} ESCAPE '\\')`);
  }
  const baseWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const baseBinds = [...binds];

  if (status) where.push(`status = ${bind(status)}`);
  const listWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const countsRes = await env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM orders ${baseWhere} GROUP BY status`
    ).bind(...baseBinds).all();
    const statusCounts = {};
    for (const s of ORDER_STATUSES) statusCounts[s] = 0;
    for (const r of countsRes.results || []) statusCounts[r.status] = Number(r.n) || 0;

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders ${listWhere}`).bind(...binds).first();
    const total = Number(totalRow?.n || 0);

    const limitP = bind(pageSize);
    const offsetP = bind((page - 1) * pageSize);
    const res = await env.DB.prepare(
      `SELECT order_no, customer_name, customer_email, company, items_json, item_count, total,
              status, created_at, status_updated_at
       FROM orders ${listWhere}
       ORDER BY created_at DESC, order_no DESC
       LIMIT ${limitP} OFFSET ${offsetP}`
    ).bind(...binds).all();

    const orders = (res.results || []).map((r) => ({
      orderNo: r.order_no,
      type: orderType(r.order_no),
      status: r.status,
      statusLabel: statusLabel(r.status),
      createdAt: r.created_at,
      statusUpdatedAt: r.status_updated_at,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      company: r.company,
      itemCount: r.item_count,
      total: r.total,
      currency: itemsCurrency(parseItems(r.items_json)),
    }));

    return reply({ orders, total, page, pageSize, statusCounts });
  } catch (e) {
    console.error('admin orders: list', e?.message);
    return reply({ error: 'Could not load orders' }, 500);
  }
}

async function readJsonBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return { error: 'Content-Type must be application/json', status: 415 };
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid JSON body', status: 400 };
    return { body };
  } catch {
    return { error: 'Invalid JSON body', status: 400 };
  }
}

// One-off maintenance: rename legacy SC-YYYYMMDD-XXXXXX rows to
// SHOWCASE-YYYYMMDD-NNN. Idempotent — a second call finds no SC- rows.
async function adminMigrateOrderNumbers(db, admin) {
  try {
    const legacy = await db.prepare(
      "SELECT order_no, created_at FROM orders WHERE order_no LIKE 'SC-%' ORDER BY created_at ASC"
    ).all();
    const renamed = [];
    for (const row of legacy.results || []) {
      const from = String(row.order_no);
      const day = String(row.created_at || '').slice(0, 10).replace(/-/g, '');
      const ymd = /^\d{8}$/.test(day) ? day : '19700101';
      const prefix = `SHOWCASE-${ymd}-`;
      const existing = await db.prepare(
        'SELECT order_no FROM orders WHERE order_no LIKE ?1'
      ).bind(`${prefix}%`).all();
      let seq = 0;
      for (const r of existing.results || []) {
        const n = Number.parseInt(String(r.order_no).slice(prefix.length), 10);
        if (Number.isFinite(n) && n > seq) seq = n;
      }
      let to = prefix + String(seq + 1).padStart(3, '0');
      while (await db.prepare('SELECT 1 FROM orders WHERE order_no = ?1').bind(to).first()) {
        seq += 1;
        to = prefix + String(seq + 1).padStart(3, '0');
      }
      await db.prepare('UPDATE orders SET order_no = ?1 WHERE order_no = ?2').bind(to, from).run();
      renamed.push({ from, to });
    }
    console.log(`admin orders: ${admin.username} migrated ${renamed.length} legacy order number(s)`);
    return reply({ ok: true, renamed, count: renamed.length });
  } catch (e) {
    console.error('admin orders: migrate', e?.message);
    return reply({ error: 'Could not migrate order numbers' }, 500);
  }
}

// Delete cancelled orders only. Every other status is refused so a live order
// can never be removed by accident. Requires an admin session (checked by caller).
async function adminDeleteCancelledOrders(db, orderNos, admin) {
  const list = Array.isArray(orderNos) ? orderNos.map((v) => String(v).trim()) : [];
  if (!list.length || list.length > 50) {
    return reply({ error: 'orderNos must be a non-empty array (max 50)' }, 400);
  }
  const deleted = [];
  const skipped = [];
  try {
    for (const no of list) {
      if (!/^[A-Za-z0-9-]{6,64}$/.test(no)) {
        skipped.push({ orderNo: no, reason: 'invalid number' });
        continue;
      }
      const row = await db.prepare('SELECT status FROM orders WHERE order_no = ?1').bind(no).first();
      if (!row) {
        skipped.push({ orderNo: no, reason: 'not found' });
        continue;
      }
      if (String(row.status).toLowerCase() !== 'cancelled') {
        skipped.push({ orderNo: no, reason: 'not cancelled' });
        continue;
      }
      await db.prepare('DELETE FROM orders WHERE order_no = ?1 AND status = ?2')
        .bind(no, row.status).run();
      deleted.push(no);
    }
    console.log(`admin orders: ${admin.username} deleted ${deleted.length} cancelled order(s)`);
    return reply({ ok: true, deleted, skipped });
  } catch (e) {
    console.error('admin orders: delete', e?.message);
    return reply({ error: 'Could not delete orders', deleted }, 500);
  }
}

// POST /api/admin/orders — change one order's status, or run a maintenance op.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status);
  const op = typeof parsed.body.op === 'string' ? parsed.body.op.trim() : '';
  if (op === 'migrateShowcaseOrderNumbers') return adminMigrateOrderNumbers(env.DB, admin);
  if (op === 'deleteCancelledOrders') return adminDeleteCancelledOrders(env.DB, parsed.body.orderNos, admin);
  const { orderNo, status, expectedStatus } = parsed.body;

  if (typeof orderNo !== 'string' || !ORDER_NO_RE.test(orderNo.trim())) return reply({ error: 'Invalid order number' }, 400);
  if (typeof status !== 'string' || !status.trim()) return reply({ error: 'status is required' }, 400);
  if (typeof expectedStatus !== 'string' || !expectedStatus.trim()) return reply({ error: 'expectedStatus is required' }, 400);
  const no = orderNo.trim();
  const to = status.trim();
  const expected = expectedStatus.trim();

  try {
    const row = await env.DB.prepare(DETAIL_SQL).bind(no).first();
    if (!row) return reply({ error: 'Order not found' }, 404);

    const from = row.status;
    if (expected !== from) {
      return reply({
        error: `Order status has changed to ${statusLabel(from)} since you loaded it. Refresh and try again.`,
        order: rowToDetail(row),
      }, 409);
    }

    const invalid = transitionError(from, to);
    if (invalid) return reply({ error: invalid }, 400);

    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      'UPDATE orders SET status = ?3, status_updated_at = ?4 WHERE order_no = ?1 AND status = ?2'
    ).bind(no, from, to, now).run();

    const updated = await env.DB.prepare(DETAIL_SQL).bind(no).first();
    if (!res?.meta?.changes) {
      return reply({
        error: 'Order status was changed by someone else. Refresh and try again.',
        order: updated ? rowToDetail(updated) : null,
      }, 409);
    }

    console.log(`admin orders: ${admin.username} changed ${no} ${from} -> ${to}`);
    return reply({ ok: true, order: rowToDetail(updated) });
  } catch (e) {
    console.error('admin orders: update', e?.message);
    return reply({ error: 'Could not update order' }, 500);
  }
}
