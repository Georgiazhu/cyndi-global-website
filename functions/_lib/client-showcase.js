// Customer-specific Showcase pools.
//
// The global showcase_products table is Cyndi's catalogue. Each customer sees a
// curated subset of it: their own "showcase" / selection pool. Cyndi admins add
// new products and remove ones that do not fit the client's taste; shortlists
// for a project are then picked FROM that pool (by Cyndi or by the client).
//
// A customer with no pool row keeps the legacy behaviour (sees every catalogue
// product), so existing accounts are unaffected until an admin curates a pool.

const now = () => new Date().toISOString();
const parseJson = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

const SCHEMA = `CREATE TABLE IF NOT EXISTS client_showcase_pools (
  customer_id TEXT PRIMARY KEY,
  product_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
)`;

const schemaReady = new WeakMap();

export async function ensureClientShowcaseSchema(db) {
  if (schemaReady.has(db)) return schemaReady.get(db);
  const ready = db.prepare(SCHEMA).run();
  schemaReady.set(db, ready);
  try { await ready; } catch (e) { schemaReady.delete(db); throw e; }
}

/** null = not curated yet (all catalogue products), [] = intentionally empty pool. */
export async function getCustomerPool(db, customerId) {
  await ensureClientShowcaseSchema(db);
  const row = await db.prepare(
    'SELECT product_ids_json FROM client_showcase_pools WHERE customer_id = ?1'
  ).bind(String(customerId ?? '')).first();
  if (!row) return null;
  const arr = parseJson(row.product_ids_json, []);
  return (Array.isArray(arr) ? arr : []).map(String);
}

/** Replace the products visible to one customer in their showcase. */
export async function setCustomerPool(db, customerId, productIds) {
  await ensureClientShowcaseSchema(db);
  const id = String(customerId ?? '');
  if (!id || id === '0') throw Object.assign(new Error('customerId is required'), { status: 400 });
  const unique = [...new Set((Array.isArray(productIds) ? productIds : []).map(String).filter(Boolean))];
  await db.prepare(`INSERT INTO client_showcase_pools (customer_id, product_ids_json, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(customer_id) DO UPDATE SET product_ids_json = excluded.product_ids_json, updated_at = excluded.updated_at`)
    .bind(id, JSON.stringify(unique), now()).run();
  return { ok: true, customerId: id, count: unique.length };
}

/** Apply a customer's pool to a catalogue product list, preserving pool order. */
export function filterByPool(products, pool) {
  if (!Array.isArray(pool)) return products;
  const wanted = new Set(pool.map(String));
  const byId = new Map((products || []).map((p) => [String(p.id), p]));
  return pool.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Pool membership as a plain id list, for picker checkboxes. */
export async function customerPoolIds(db, customerId) {
  const pool = await getCustomerPool(db, customerId);
  return pool;
}
