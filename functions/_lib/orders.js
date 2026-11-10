// Shared order helpers for the `orders` table (migrations/0005_orders.sql + 0006 customer_id).
// Used by the shop (functions/api/orders.js, prefix SW-) and the showcase
// (functions/api/showcase/orders.js, prefix SC-). The prefix is the only thing that
// tells the two order sources apart — there is no source column.

// Order number: <PREFIX>-YYYYMMDD-XXXXXX
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

// INSERT one order row. Throws on DB failure; callers map that to a 500.
export async function insertOrder(db, { orderNo, name, email, phone, company, notes, items, itemCount, total, customerId }) {
  const now = new Date().toISOString();
  await db.prepare(
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
  ).run();
  return { createdAt: now };
}
