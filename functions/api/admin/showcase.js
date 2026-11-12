import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';
import { repricePendingShowcaseOrders } from '../../_lib/showcase-order-pricing.js';
import {
  invAssignColourIds, invClassifyError, invRowLabel, invRowsUnlinkedBy, invUnlinkVerdict,
} from '../../_lib/inventory.js';

// Authenticated admin responses (they include inventory aggregates) must never be cached.
const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const reply = (data, status = 200) => json(data, status, NO_STORE);

const now = () => new Date().toISOString();
const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// Size charts are stored as a JSON array of image URLs. Older rows were
// written as a single URL string, so accept both and always return an array.
const parseCharts = (raw) => {
  if (!raw) return [];
  let val = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try { val = JSON.parse(trimmed); } catch { val = [trimmed]; }
    } else {
      val = [trimmed];
    }
  }
  if (!Array.isArray(val)) return [];
  return val.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS showcase_categories (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_products (
     id TEXT PRIMARY KEY, category_id TEXT NOT NULL, sku TEXT, name TEXT NOT NULL, description TEXT,
     features_json TEXT, materials TEXT, image TEXT, gallery_json TEXT, colors_json TEXT, sizes_json TEXT,
     pricing_json TEXT, price_includes TEXT, price_notes_json TEXT, charges_json TEXT,
     currency TEXT NOT NULL DEFAULT '$', spec TEXT, moq INTEGER, lead_time INTEGER,
     size_chart TEXT,
     sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_media (
     id TEXT PRIMARY KEY, category_id TEXT, file_name TEXT, content_type TEXT,
     image_data TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_products_category ON showcase_products(category_id, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_media_category ON showcase_media(category_id)`,
];
// Column migration for tables created before these fields existed.
// ALTER TABLE ADD COLUMN is idempotent-safe via the error swallow below.
const MIGRATIONS = [
  `ALTER TABLE showcase_products ADD COLUMN spec TEXT`,
  `ALTER TABLE showcase_products ADD COLUMN moq INTEGER`,
  `ALTER TABLE showcase_products ADD COLUMN lead_time INTEGER`,
  `ALTER TABLE showcase_products ADD COLUMN size_chart TEXT`,
];

let schemaReady = null;
async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    for (const stmt of SCHEMA) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { console.error('showcase schema:', e?.message); }
    }
    // Existing tables keep their old shape; add the newer columns if missing.
    for (const stmt of MIGRATIONS) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { console.error('showcase migration:', e?.message); }
    }
  })();
  return schemaReady;
}

async function authed(request, env) {
  return isAuthenticated(request, await getAdminSecret(env));
}

// ---- Inventory guard (spec §6.3) --------------------------------------------------------
// Saving or deleting a product must not silently strand tracked stock:
//  - an affected variant with reserved > 0 -> 409 STOCK_RESERVED (ship or cancel first);
//  - only on-hand stock (available/incoming/damaged) -> 409 STOCK_CONFIRM_REQUIRED unless
//    the body carries confirmStockOrphan: true; the row then shows as unlinked.
// Before migration 0013 there is nothing to guard (rows === null).

const INV_COLS = 'sku, product_id, color_id, size, available, reserved, incoming, damaged';

async function loadInventoryRows(db, where, ...binds) {
  try {
    const res = await db.prepare(`SELECT ${INV_COLS} FROM inventory WHERE ${where}`).bind(...binds).all();
    return res.results || [];
  } catch (e) {
    if (invClassifyError(e) === 'missing_table') return null;
    throw e;
  }
}

// Stock fingerprint of one product, re-checked by the guarded write so stock that is
// tracked or reserved between the guard read and the write cannot slip through.
const INV_FINGERPRINT_SQL = `(SELECT COUNT(*) || ':' || COALESCE(SUM(reserved), 0) || ':' || COALESCE(SUM(available + incoming + damaged), 0)
  FROM inventory WHERE product_id = ?1)`;
// The same fingerprint over every product of category ?1 (used by deleteCategory).
const CATEGORY_PRODUCT_IDS_SQL = 'SELECT id FROM showcase_products WHERE category_id = ?1';
const CATEGORY_FINGERPRINT_SQL = `(SELECT COUNT(*) || ':' || COALESCE(SUM(reserved), 0) || ':' || COALESCE(SUM(available + incoming + damaged), 0)
  FROM inventory WHERE product_id IN (${CATEGORY_PRODUCT_IDS_SQL}))`;
const inventoryFingerprint = (rows) => (rows
  ? `${rows.length}:${rows.reduce((s, r) => s + Number(r.reserved || 0), 0)}:${rows.reduce((s, r) => s + Number(r.available || 0) + Number(r.incoming || 0) + Number(r.damaged || 0), 0)}`
  : null);

function guardResponse(affected, confirmed) {
  const verdict = invUnlinkVerdict(affected);
  if (!verdict) return null;
  if (verdict.code === 'STOCK_CONFIRM_REQUIRED' && confirmed) return null;
  return reply({ error: verdict.error, code: verdict.code, variants: verdict.variants }, 409);
}

const CHANGED_WHILE_SAVING = 'The product changed while saving (its stock or tracking was updated). Reload and try again.';

// GET /api/admin/showcase —— 后台读取全量数据
export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return reply({ error: 'Unauthorized' }, 401);

  try { await ensureSchema(env); } catch (e) { return reply({ error: e?.message || 'Schema init failed' }, 500); }
  try {
  const cats = await env.DB.prepare(
    'SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC'
  ).all();
  const prods = await env.DB.prepare(
    `SELECT * FROM showcase_products ORDER BY sort ASC, name ASC`
  ).all();
  const metaRow = await env.DB.prepare('SELECT data_json FROM showcase_meta WHERE id = 1').first();
  // Tracked-variant counts, so the editor can say a product's stock is tracked.
  const tracked = new Map();
  try {
    const inv = await env.DB.prepare(
      'SELECT product_id, COUNT(*) AS n, SUM(reserved) AS r FROM inventory GROUP BY product_id'
    ).all();
    for (const r of inv.results || []) tracked.set(r.product_id, { n: Number(r.n) || 0, r: Number(r.r) || 0 });
  } catch (e) {
    if (invClassifyError(e) !== 'missing_table') console.error('showcase: inventory counts', e?.message);
  }

  return reply({
    categories: (cats.results || []).map((c) => ({
      id: c.id, name: c.name, sort: c.sort,
    })),
    products: (prods.results || []).map((p) => ({
      id: p.id,
      categoryId: p.category_id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      features: parse(p.features_json, []),
      materials: p.materials,
      image: p.image,
      gallery: parse(p.gallery_json, []),
      colors: parse(p.colors_json, []),
      sizes: parse(p.sizes_json, []),
      pricing: parse(p.pricing_json, []),
      priceIncludes: p.price_includes,
      priceNotes: parse(p.price_notes_json, []),
      currency: p.currency || '$',
      spec: p.spec,
      moq: p.moq ?? null,
      sizeChart: parseCharts(p.size_chart),
      leadTime: p.lead_time ?? null,
      sort: p.sort,
      trackedVariants: tracked.get(p.id)?.n || 0,
      reservedUnits: tracked.get(p.id)?.r || 0,
    })),
    meta: metaRow?.data_json ? parse(metaRow.data_json, null) : null,
  });
  } catch (e) { return reply({ error: e?.message || 'Failed to load showcase' }, 500); }
}

// POST /api/admin/showcase —— 后台保存。body: { op, ... }
export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return reply({ error: 'Unauthorized' }, 401);

  // Make sure the table shape matches this code before writing: a table created
  // by an older deploy lacks the newer columns, and the INSERT would fail.
  try { await ensureSchema(env); } catch (e) { return reply({ error: e?.message || 'Schema init failed' }, 500); }

  const body = await request.json().catch(() => ({}));
  const op = String(body.op || '').trim();
  const ts = now();

  try {
    if (op === 'saveMeta') {
      await env.DB.prepare(
        `INSERT INTO showcase_meta (id, data_json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET data_json = ?1, updated_at = ?2`
      ).bind(JSON.stringify(body.meta || {}), ts).run();
      return reply({ ok: true });
    }

    if (op === 'addCategory') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      if (!id || !name) return reply({ error: 'id and name are required' }, 400);
      const maxSort = await env.DB.prepare(
        'SELECT COALESCE(MAX(sort), 0) AS m FROM showcase_categories'
      ).first();
      await env.DB.prepare(
        'INSERT INTO showcase_categories (id, name, sort, updated_at) VALUES (?1, ?2, ?3, ?4)'
      ).bind(id, name, (maxSort?.m || 0) + 10, ts).run();
      return reply({ ok: true, id });
    }

    if (op === 'updateCategory') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      if (!id || !name) return reply({ error: 'id and name are required' }, 400);
      await env.DB.prepare(
        'UPDATE showcase_categories SET name = ?2, updated_at = ?3 WHERE id = ?1'
      ).bind(id, name, ts).run();
      return reply({ ok: true });
    }

    if (op === 'deleteCategory') {
      const id = String(body.id || '').trim();
      if (!id) return reply({ error: 'id is required' }, 400);
      // Deleting a category deletes its products: guard their tracked stock first.
      const invRows = await loadInventoryRows(env.DB, `product_id IN (${CATEGORY_PRODUCT_IDS_SQL})`, id);
      const prods = await env.DB.prepare(
        'SELECT id, name, colors_json, sizes_json FROM showcase_products WHERE category_id = ?1'
      ).bind(id).all();
      const prodList = prods.results || [];
      if (invRows && invRows.length) {
        const byId = new Map(prodList.map((r) => [r.id, r]));
        const blocked = guardResponse(invRows.map((r) => ({ row: r, label: invRowLabel(byId.get(r.product_id), r) })), body.confirmStockOrphan === true);
        if (blocked) return blocked;
      }
      // One batch, locked on the category's stock fingerprint: if stock was tracked,
      // reserved or adjusted after the guard read, no product is deleted, and the
      // category is only deleted once it has no products left.
      const delProducts = invRows
        ? env.DB.prepare(`DELETE FROM showcase_products WHERE category_id = ?1 AND ${CATEGORY_FINGERPRINT_SQL} IS ?2`)
          .bind(id, inventoryFingerprint(invRows))
        : env.DB.prepare('DELETE FROM showcase_products WHERE category_id = ?1').bind(id);
      const [delRes] = await env.DB.batch([
        delProducts,
        env.DB.prepare(
          'DELETE FROM showcase_categories WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM showcase_products WHERE category_id = ?1)'
        ).bind(id),
      ]);
      if (prodList.length && !delRes?.meta?.changes) return reply({ error: CHANGED_WHILE_SAVING }, 409);
      if (invRows && invRows.length) console.warn(`showcase: deleting category ${id} leaves ${invRows.length} inventory row(s) unlinked`);
      return reply({ ok: true });
    }

    if (op === 'saveProduct') {
      const p = body.product || {};
      const id = String(p.id || '').trim();
      if (!id || !p.name) return reply({ error: 'product id and name are required' }, 400);
      const categoryId = String(p.categoryId || '').trim();
      if (!categoryId) return reply({ error: 'categoryId is required' }, 400);

      const existing = await env.DB.prepare(
        'SELECT sort, name, colors_json, sizes_json FROM showcase_products WHERE id = ?1'
      ).bind(id).first();
      const sort = Number.isFinite(p.sort) ? p.sort : (existing?.sort ?? 0);
      // Stable colour ids (inventory rows reference them): keep supplied ids, else reuse the
      // stored id of the colour with the same name + hex, else mint a new one.
      const prevColours = parse(existing?.colors_json, []);
      const colours = invAssignColourIds(Array.isArray(p.colors) ? p.colors : [], Array.isArray(prevColours) ? prevColours : []);
      const sizes = p.sizes || [];

      // Inventory guard: refuse to drop a variant with reserved stock, and ask before
      // unlinking one that still holds stock. Runs before the UPSERT (and the reprice).
      let invRows = null;
      if (existing) {
        invRows = await loadInventoryRows(env.DB, 'product_id = ?1', id);
        if (invRows && invRows.length) {
          const affected = invRowsUnlinkedBy(invRows, existing, { colors_json: colours, sizes_json: sizes })
            .map((r) => ({ row: r, label: invRowLabel(existing, r) }));
          const blocked = guardResponse(affected, body.confirmStockOrphan === true);
          if (blocked) return blocked;
          if (affected.length) console.warn(`showcase: saving ${id} leaves ${affected.length} inventory row(s) unlinked`);
        }
      }
      // An existing row is only overwritten while its colours, sizes and stock are what the
      // guard (and a concurrent inventory track) saw; otherwise 0 rows change -> 409.
      const lock = existing
        ? ` WHERE showcase_products.colors_json IS ?23 AND showcase_products.sizes_json IS ?24${invRows ? ` AND ${INV_FINGERPRINT_SQL} IS ?25` : ''}`
        : '';
      const lockBinds = existing
        ? [existing.colors_json ?? null, existing.sizes_json ?? null, ...(invRows ? [inventoryFingerprint(invRows)] : [])]
        : [];

      const saved = await env.DB.prepare(
        `INSERT INTO showcase_products
           (id, category_id, sku, name, description, features_json, materials,
            image, gallery_json, colors_json, sizes_json, pricing_json,
            price_includes, price_notes_json, charges_json, currency, spec, moq, lead_time,
            size_chart, sort, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)
         ON CONFLICT(id) DO UPDATE SET
           category_id=?2, sku=?3, name=?4, description=?5, features_json=?6,
           materials=?7, image=?8, gallery_json=?9, colors_json=?10, sizes_json=?11,
           pricing_json=?12, price_includes=?13, price_notes_json=?14, charges_json=?15,
           currency=?16, spec=?17, moq=?18, lead_time=?19, size_chart=?20, sort=?21,
           updated_at=?22${lock}`
      ).bind(
        id, categoryId,
        p.sku || null,
        p.name,
        p.description || null,
        JSON.stringify(p.features || []),
        p.materials || null,
        p.image || null,
        JSON.stringify(p.gallery || []),
        JSON.stringify(colours),
        JSON.stringify(sizes),
        JSON.stringify(p.pricing || []),
        p.priceIncludes || null,
        JSON.stringify(p.priceNotes || []),
        // Additional charges were removed from the product model. The column
        // stays for schema compatibility but is always reset to an empty list,
        // so saving a product also clears any legacy charges it still had.
        JSON.stringify([]),
        p.currency || '$',
        p.spec || null,
        Number.isFinite(p.moq) ? p.moq : null,
        Number.isFinite(p.leadTime) ? p.leadTime : null,
        JSON.stringify(parseCharts(p.sizeChart)),
        sort, ts, ...lockBinds
      ).run();
      if (existing && !saved?.meta?.changes) return reply({ error: CHANGED_WHILE_SAVING }, 409);

      // A price edit must also update PENDING showcase orders that contain
      // this product. Never let bookkeeping failure roll back a saved product.
      try {
        const synced = await repricePendingShowcaseOrders(env.DB, id);
        if (synced.updated) {
          console.log(`showcase: repriced ${synced.updated} pending order(s) for ${id}`);
        }
      } catch (e) {
        console.error('showcase: reprice pending orders', e?.message);
      }
      return reply({ ok: true, id });
    }

    // Manual full re-price: useful when a price was edited before this
    // automatic sync existed, or as a one-off reconciliation.
    if (op === 'repricePendingOrders') {
      const result = await repricePendingShowcaseOrders(env.DB);
      return reply({ ok: true, ...result });
    }

    if (op === 'deleteProduct') {
      const id = String(body.id || '').trim();
      if (!id) return reply({ error: 'id is required' }, 400);
      const invRows = await loadInventoryRows(env.DB, 'product_id = ?1', id);
      const prod = invRows ? await env.DB.prepare(
        'SELECT id, name, colors_json, sizes_json FROM showcase_products WHERE id = ?1'
      ).bind(id).first() : null;
      if (prod) {
        if (invRows.length) {
          const blocked = guardResponse(invRows.map((r) => ({ row: r, label: invRowLabel(prod, r) })), body.confirmStockOrphan === true);
          if (blocked) return blocked;
        }
        // Delete only while the stock is what the guard saw (so a concurrent track cannot slip in).
        const del = await env.DB.prepare(`DELETE FROM showcase_products WHERE id = ?1 AND ${INV_FINGERPRINT_SQL} IS ?2`)
          .bind(id, inventoryFingerprint(invRows)).run();
        if (!del?.meta?.changes) return reply({ error: CHANGED_WHILE_SAVING }, 409);
        if (invRows.length) console.warn(`showcase: deleting ${id} leaves ${invRows.length} inventory row(s) unlinked`);
        return reply({ ok: true });
      }
      await env.DB.prepare('DELETE FROM showcase_products WHERE id = ?1').bind(id).run();
      return reply({ ok: true });
    }

    if (op === 'reorder') {
      // body: { products: [{id, sort}] }
      const list = Array.isArray(body.products) ? body.products : [];
      for (const item of list) {
        if (!item?.id) continue;
        await env.DB.prepare(
          'UPDATE showcase_products SET sort = ?2, updated_at = ?3 WHERE id = ?1'
        ).bind(String(item.id), Number(item.sort) || 0, ts).run();
      }
      return reply({ ok: true });
    }

    return reply({ error: `Unknown op: ${op}` }, 400);
  } catch (e) {
    return reply({ error: e?.message || 'Save failed' }, 500);
  }
}
