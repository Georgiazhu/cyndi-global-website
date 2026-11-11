import { json } from '../../_lib/auth.js';
import { SHOWCASE_ORDERS_WHERE, SHOWCASE_ORDER_NO_RE, sgonNextShowcaseOrderNo, insertOrder } from '../../_lib/orders.js';
import { ensureSchema } from '../showcase.js';
import { requireShowcaseCustomer } from './auth-lib.js';
import { shpLoadForOrderSafe } from '../../_lib/shipments.js';
import { CUSTOMER_CANCELLABLE_STATUSES, DISPATCHED_STATUSES } from '../../_lib/order-status.js';

/**
 * /api/showcase/orders — real server-side orders placed from the Showcase.
 *
 * Writes into the same `orders` table as the shop (functions/api/orders.js) through
 * functions/_lib/orders.js. New showcase orders use the `SHOWCASE-` prefix (legacy rows may
 * still be `SC-` until renamed by the admin op); shop orders use `SW-`.
 * This endpoint only ever reads showcase rows and only writes `SHOWCASE-` rows.
 *
 * Security:
 *  - Every method requires a customer session with Showcase access (see auth-lib.js).
 *  - Orders belong to the customer who placed them (orders.customer_id): the list and the
 *    by-number lookup only ever return the caller's own orders; anyone else's -> 404.
 *  - Prices are never taken from the client: unit price, line totals and the order total
 *    are computed here from showcase_products.pricing_json.
 *  - Same-origin only (no CORS headers); POST must be application/json.
 *  - Responses are private, no-store.
 *
 * Customer self-service cancel: POST /api/showcase/orders {op:'cancel', orderNo}
 *  - same session gate and same ownership rule as the by-number GET (not yours -> 404);
 *  - only while the order is pending/processing (before dispatch); enforced by a
 *    conditional UPDATE, so a concurrent staff change wins and the caller gets a 409;
 *  - touches only orders.status / status_updated_at (no inventory, no shipments).
 */

const MAX_LINES = 100;
const MAX_QTY = 1000000;
const MAX_BODY_BYTES = 64 * 1024;
const LIMITS = { name: 120, email: 254, phone: 40, company: 160, notes: 2000, size: 60 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

const reply = (data, status = 200) => json(data, status, PRIVATE);

const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

/**
 * Unit price rule (mirrors unitPrice() in showcase/src/data/cart.js):
 *  - tiers are [{quantity, price}] sorted by quantity ascending;
 *  - the price of the highest tier whose quantity <= ordered quantity applies;
 *  - below the lowest tier, the lowest tier's price applies;
 *  - no valid tiers -> 0 (the showcase treats that as "price on request").
 */
function tierUnitPrice(pricing, quantity) {
  const tiers = (Array.isArray(pricing) ? pricing : [])
    .filter((t) => t && Number.isFinite(Number(t.quantity)) && Number.isFinite(Number(t.price)))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  if (!tiers.length) return 0;
  let price = Number(tiers[0].price);
  for (const t of tiers) {
    if (quantity >= Number(t.quantity)) price = Number(t.price);
  }
  return price;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Trimmed string with a hard length cap. Returns { value } or { error }.
function field(raw, label, max, required = false) {
  if (raw != null && typeof raw !== 'string') return { error: `${label} must be text` };
  const value = (raw || '').trim();
  if (required && !value) return { error: `${label} is required` };
  if (value.length > max) return { error: `${label} is too long (max ${max} characters)` };
  return { value };
}

// Split the stored notes back into the placing account and the customer's own notes.
function splitNotes(notes) {
  const m = /^\[showcase:([^\]]*)\]\s?/.exec(notes || '');
  if (!m) return { placedBy: null, notes: notes || '' };
  return { placedBy: m[1] || null, notes: (notes || '').slice(m[0].length) };
}

function orderCurrency(items) {
  const set = new Set(items.map((i) => i.currency).filter(Boolean));
  return set.size === 1 ? [...set][0] : null;
}

function rowToOrder(row) {
  const items = parse(row.items_json, []);
  const { placedBy, notes } = splitNotes(row.notes);
  return {
    orderNo: row.order_no,
    status: row.status,
    createdAt: row.created_at,
    statusUpdatedAt: row.status_updated_at,
    placedBy,
    contact: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      company: row.company,
    },
    notes,
    items: Array.isArray(items) ? items : [],
    lineCount: Array.isArray(items) ? items.length : 0,
    itemCount: row.item_count,
    total: row.total,
    currency: Array.isArray(items) ? orderCurrency(items) : null,
  };
}

// One of the caller's showcase orders (with shipments), or null when it is not theirs / not found.
async function loadOwnOrder(db, orderNo, customerId) {
  const row = await db.prepare(
    `SELECT order_no, customer_name, customer_email, customer_phone, company, notes,
            items_json, item_count, total, status, created_at, status_updated_at
     FROM orders WHERE order_no = ?1 AND ${SHOWCASE_ORDERS_WHERE} AND customer_id = ?2`
  ).bind(orderNo, customerId).first();
  if (!row) return null;
  return { ...rowToOrder(row), shipments: await shpLoadForOrderSafe(db, row.order_no) };
}

const SHIPPED_MESSAGE = 'This order has already shipped and can no longer be cancelled.';
const ALREADY_CANCELLED_MESSAGE = 'This order has already been cancelled.';

function cancelRefusal(order) {
  const status = String(order.status || '').toLowerCase();
  if (status === 'cancelled') return reply({ ok: true, alreadyCancelled: true, message: ALREADY_CANCELLED_MESSAGE, order });
  if (DISPATCHED_STATUSES.includes(status)) return reply({ error: SHIPPED_MESSAGE, order }, 409);
  return reply({ error: 'This order can no longer be cancelled. Please contact us for help.', order }, 409);
}

// POST {op:'cancel', orderNo} — the caller cancels one of their own orders before dispatch.
async function cancelOwnOrder(env, customer, rawOrderNo) {
  const orderNo = typeof rawOrderNo === 'string' ? rawOrderNo.trim() : '';
  // Same rule as the GET: anything that is not a showcase order number is simply "not found".
  if (!SHOWCASE_ORDER_NO_RE.test(orderNo)) return reply({ error: 'Order not found' }, 404);
  try {
    const current = await loadOwnOrder(env.DB, orderNo, customer.id);
    if (!current) return reply({ error: 'Order not found' }, 404);
    const from = String(current.status || '');
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(from)) return cancelRefusal(current);

    const now = new Date().toISOString();
    const placeholders = CUSTOMER_CANCELLABLE_STATUSES.map((_, i) => `?${i + 4}`).join(', ');
    const res = await env.DB.prepare(
      `UPDATE orders SET status = 'cancelled', status_updated_at = ?3
       WHERE order_no = ?1 AND customer_id = ?2 AND ${SHOWCASE_ORDERS_WHERE} AND status IN (${placeholders})`
    ).bind(orderNo, customer.id, now, ...CUSTOMER_CANCELLABLE_STATUSES).run();

    const updated = await loadOwnOrder(env.DB, orderNo, customer.id);
    if (!updated) return reply({ error: 'Order not found' }, 404);
    if (!res?.meta?.changes) {
      // Status changed between the read and the update (e.g. staff dispatched it).
      if (String(updated.status).toLowerCase() === 'cancelled') return cancelRefusal(updated);
      const msg = DISPATCHED_STATUSES.includes(String(updated.status).toLowerCase())
        ? SHIPPED_MESSAGE
        : 'The order status has just changed, so it could not be cancelled. Please review the order and try again.';
      return reply({ error: msg, order: updated }, 409);
    }

    console.log(`showcase orders: customer ${customer.id} cancelled ${orderNo} ${from} -> cancelled`);
    return reply({ ok: true, order: updated });
  } catch (e) {
    console.error('showcase orders: cancel', e?.message);
    return reply({ error: 'Could not cancel the order' }, 500);
  }
}

async function readJsonBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return { error: 'Content-Type must be application/json', status: 415 };
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

// POST /api/showcase/orders — place an order.
// Body: { contact:{name,email,phone?,company?,notes?}, items:[{productId, colorIndex?, size?, quantity}] }
export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const gate = await requireShowcaseCustomer(request, env);
  if (gate.response) return gate.response;
  const { customer } = gate;

  const parsed = await readJsonBody(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status);
  const { body } = parsed;

  if (body.op !== undefined) {
    if (body.op === 'cancel') return cancelOwnOrder(env, customer, body.orderNo);
    return reply({ error: 'Unknown operation' }, 400);
  }

  // ---- Contact ----
  const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};
  const name = field(contact.name, 'Name', LIMITS.name, true);
  const email = field(contact.email, 'Email', LIMITS.email, true);
  const phone = field(contact.phone, 'Phone', LIMITS.phone);
  const company = field(contact.company, 'Company', LIMITS.company);
  const notes = field(contact.notes, 'Notes', LIMITS.notes);
  for (const f of [name, email, phone, company, notes]) {
    if (f.error) return reply({ error: f.error }, 400);
  }
  if (!EMAIL_RE.test(email.value)) return reply({ error: 'A valid email is required' }, 400);

  // ---- Items (shape only; prices are looked up below) ----
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) return reply({ error: 'Cart is empty' }, 400);
  if (rawItems.length > MAX_LINES) return reply({ error: `Too many order lines (max ${MAX_LINES})` }, 400);

  const lines = [];
  for (const [i, it] of rawItems.entries()) {
    const n = i + 1;
    if (!it || typeof it !== 'object') return reply({ error: `Line ${n}: invalid item` }, 400);
    const productId = typeof it.productId === 'string' ? it.productId.trim() : '';
    if (!productId || productId.length > 100) return reply({ error: `Line ${n}: productId is required` }, 400);
    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return reply({ error: `Line ${n}: quantity must be a whole number between 1 and ${MAX_QTY}` }, 400);
    }
    let colorIndex = null;
    if (it.colorIndex !== undefined && it.colorIndex !== null) {
      colorIndex = Number(it.colorIndex);
      if (!Number.isInteger(colorIndex) || colorIndex < 0) return reply({ error: `Line ${n}: invalid colour` }, 400);
    }
    let size = null;
    if (it.size !== undefined && it.size !== null && it.size !== '') {
      if (typeof it.size !== 'string' || it.size.length > LIMITS.size) return reply({ error: `Line ${n}: invalid size` }, 400);
      size = it.size;
    }
    lines.push({ n, productId, quantity, colorIndex, size });
  }

  // ---- Load products (only those in an existing category, i.e. visible on /api/showcase) ----
  await ensureSchema(env);
  const ids = [...new Set(lines.map((l) => l.productId))];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ');
  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT p.id, p.sku, p.name, p.image, p.gallery_json, p.colors_json, p.sizes_json,
              p.pricing_json, p.currency, p.moq, p.lead_time
       FROM showcase_products p
       JOIN showcase_categories c ON c.id = p.category_id
       WHERE p.id IN (${placeholders})`
    ).bind(...ids).all();
  } catch (e) {
    console.error('showcase orders: product lookup', e?.message);
    return reply({ error: 'Could not place order' }, 500);
  }
  const products = {};
  for (const r of rows.results || []) products[r.id] = r;

  // ---- Build the snapshot with server-side pricing ----
  const snapshot = [];
  let itemCount = 0;
  let total = 0;
  for (const l of lines) {
    const p = products[l.productId];
    if (!p) return reply({ error: `Line ${l.n}: product not found` }, 400);

    const moqRaw = Math.floor(Number(p.moq));
    const moq = Number.isFinite(moqRaw) && moqRaw > 1 ? moqRaw : 1;
    if (l.quantity < moq) return reply({ error: `Line ${l.n}: ${p.name} has a minimum order of ${moq}` }, 400);

    const colors = parse(p.colors_json, []);
    let color = null;
    if (l.colorIndex !== null) {
      if (!Array.isArray(colors) || l.colorIndex >= colors.length) return reply({ error: `Line ${l.n}: invalid colour for ${p.name}` }, 400);
      color = colors[l.colorIndex] || null;
    }

    const sizes = parse(p.sizes_json, []);
    if (l.size !== null && !(Array.isArray(sizes) && sizes.includes(l.size))) {
      return reply({ error: `Line ${l.n}: invalid size for ${p.name}` }, 400);
    }

    const unitPrice = round2(tierUnitPrice(parse(p.pricing_json, []), l.quantity));
    const lineTotal = round2(unitPrice * l.quantity);
    const gallery = parse(p.gallery_json, []);
    snapshot.push({
      productId: p.id,
      sku: p.sku || null,
      name: p.name,
      colorIndex: l.colorIndex,
      colorName: color?.name || null,
      colorHex: color?.hex || null,
      size: l.size,
      quantity: l.quantity,
      unitPrice,
      lineTotal,
      currency: p.currency || '$',
      moq,
      leadTime: p.lead_time ?? null,
      image: color?.image || p.image || (Array.isArray(gallery) ? gallery[0] : null) || null,
    });
    itemCount += l.quantity;
    total += lineTotal;
  }

  // One order, one currency: a total across currencies would be meaningless.
  if (new Set(snapshot.map((s) => s.currency)).size > 1) {
    return reply({ error: 'All products in one order must share a currency' }, 400);
  }

  // The order belongs to customer_id; the notes prefix is kept so existing reports keep working.
  const tag = `[showcase:${String(customer.username || customer.email).replace(/[\[\]]/g, '').slice(0, 64)}]`;
  const storedNotes = notes.value ? `${tag} ${notes.value}` : tag;
  total = round2(total);

  let orderNo;
  let createdAt;
  try {
    orderNo = await sgonNextShowcaseOrderNo(env.DB);
    ({ createdAt } = await insertOrder(env.DB, {
      orderNo,
      name: name.value,
      email: email.value,
      phone: phone.value || null,
      company: company.value || null,
      notes: storedNotes,
      items: snapshot,
      itemCount,
      total,
      customerId: customer.id,
    }));
  } catch (e) {
    console.error('showcase orders: insert', e?.message);
    return reply({ error: 'Could not place order' }, 500);
  }

  const order = rowToOrder({
    order_no: orderNo,
    status: 'pending',
    created_at: createdAt,
    status_updated_at: createdAt,
    notes: storedNotes,
    customer_name: name.value,
    customer_email: email.value,
    customer_phone: phone.value || null,
    company: company.value || null,
    items_json: JSON.stringify(snapshot),
    item_count: itemCount,
    total,
  });
  return reply({ ok: true, orderNo, order }, 200);
}

// GET /api/showcase/orders?orderNo=SHOWCASE-... (or legacy SC-...)  -> one of the caller's orders
// GET /api/showcase/orders  -> the caller's 50 most recent showcase orders (summary)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const gate = await requireShowcaseCustomer(request, env);
  if (gate.response) return gate.response;
  const { customer } = gate;

  const orderNo = new URL(request.url).searchParams.get('orderNo')?.trim();

  try {
    if (orderNo) {
      // Never serve shop (SW-) or any other non-showcase order here.
      if (!SHOWCASE_ORDER_NO_RE.test(orderNo)) return reply({ error: 'Order not found' }, 404);
      const order = await loadOwnOrder(env.DB, orderNo, customer.id);
      if (!order) return reply({ error: 'Order not found' }, 404);
      return reply({ order });
    }

    // Summary list: no email/phone/notes, just what the "Previous orders" list needs.
    const res = await env.DB.prepare(
      `SELECT order_no, company, items_json, item_count, total, status, created_at, status_updated_at
       FROM orders WHERE ${SHOWCASE_ORDERS_WHERE} AND customer_id = ?1
       ORDER BY created_at DESC LIMIT 50`
    ).bind(customer.id).all();
    const orders = (res.results || []).map((r) => {
      const items = parse(r.items_json, []);
      const list = Array.isArray(items) ? items : [];
      return {
        orderNo: r.order_no,
        status: r.status,
        createdAt: r.created_at,
        statusUpdatedAt: r.status_updated_at,
        company: r.company,
        lineCount: list.length,
        itemCount: r.item_count,
        total: r.total,
        currency: orderCurrency(list),
      };
    });
    return reply({ orders });
  } catch (e) {
    console.error('showcase orders: read', e?.message);
    return reply({ error: 'Could not load orders' }, 500);
  }
}
