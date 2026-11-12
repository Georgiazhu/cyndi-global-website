// Shared order helpers for the `orders` table (migrations/0005_orders.sql + 0006 customer_id).
// Used by the shop (functions/api/orders.js, prefix SW-) and the showcase
// (functions/api/showcase/orders.js, prefix SHOWCASE-). The prefix is the only thing
// that tells the two order sources apart — there is no source column.

// Showcase order numbers: current SHOWCASE-YYYYMMDD-NNN (sgonNextShowcaseOrderNo) and
// legacy SC-YYYYMMDD-XXXXXX rows not yet renamed by the admin migrateShowcaseOrderNumbers op.
// Use these everywhere an order has to be identified as a showcase order.
export const SHOWCASE_ORDER_NO_RE = /^(SC-\d{8}-[A-Z0-9]{1,12}|SHOWCASE-\d{8}-\d{3,})$/;
export const SHOWCASE_ORDERS_WHERE = "(order_no LIKE 'SC-%' OR order_no LIKE 'SHOWCASE-%')";
export function isShowcaseOrderNo(orderNo) {
  const s = String(orderNo || '');
  return s.startsWith('SC-') || s.startsWith('SHOWCASE-');
}

// Customer-facing order item: drops internal fields. The inventory sku code (stockSku)
// stays in items_json for admin and reconciliation; customers only ever see availability.
export function customerItem(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return it;
  const { stockSku: _stockSku, ...rest } = it;
  return rest;
}

// Shop order number: SW-YYYYMMDD-XXXXXX
export function genOrderNo(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

function toNumber(v) {
  const n = parseFloat(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : 0;
}

// Showcase order number: SHOWCASE-YYYYMMDD-NNN, where NNN is a daily sequence.
// Helpers use an `sgon` prefix because Pages bundles _lib modules into one namespace.
export async function sgonNextShowcaseOrderNo(db) {
  const d = new Date();
  const sgonYmd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const sgonPrefix = `SHOWCASE-${sgonYmd}-`;
  const sgonRows = await db.prepare(
    'SELECT order_no FROM orders WHERE order_no LIKE ?1'
  ).bind(`${sgonPrefix}%`).all();
  let sgonMax = 0;
  for (const r of sgonRows?.results || []) {
    const n = Number.parseInt(String(r.order_no).slice(sgonPrefix.length), 10);
    if (Number.isFinite(n) && n > sgonMax) sgonMax = n;
  }
  return sgonPrefix + String(sgonMax + 1).padStart(3, '0');
}

// Shop item snapshot (unchanged shop behaviour: price comes from the request body).
export function normaliseShopItems(items) {
  let itemCount = 0;
  let total = 0;
  const snapshot = items.map((it) => {
    const qty = Math.max(1, parseInt(it.quantity) || 1);
    const price = toNumber(it.price);
    itemCount += qty;
    total += price * qty;
    return {
      id: it.id,
      sku: it.sku || null,
      name: it.name,
      price,
      quantity: qty,
      selectedColor: it.selectedColor || null,
      selectedSize: it.selectedSize || null,
      image: it.image || null,
    };
  });
  return { snapshot, itemCount, total };
}

// The prepared INSERT for one order row, so a caller can run it inside a db.batch()
// (showcase orders reserve stock in the same batch). Returns { stmt, createdAt }.
export function prepareInsertOrder(db, { orderNo, name, email, phone, company, notes, items, itemCount, total, customerId }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO orders
      (order_no, customer_name, customer_email, customer_phone, company, notes,
       items_json, item_count, total, status, created_at, status_updated_at, customer_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?10, ?11)`
  ).bind(
    orderNo,
    name,
    email,
    phone || null,
    company || null,
    notes || null,
    JSON.stringify(items),
    itemCount,
    Number(total.toFixed(2)),
    now,
    customerId || null
  );
  return { stmt, createdAt: now };
}

// INSERT one order row. Throws on DB failure; callers map that to a 500.
export async function insertOrder(db, fields) {
  const { stmt, createdAt } = prepareInsertOrder(db, fields);
  await stmt.run();
  return { createdAt };
}
