import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

const now = () => new Date().toISOString();
const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS showcase_categories (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_products (
     id TEXT PRIMARY KEY, category_id TEXT NOT NULL, sku TEXT, name TEXT NOT NULL, description TEXT,
     features_json TEXT, materials TEXT, image TEXT, gallery_json TEXT, colors_json TEXT, sizes_json TEXT,
     pricing_json TEXT, price_includes TEXT, price_notes_json TEXT, charges_json TEXT,
     currency TEXT NOT NULL DEFAULT '$', sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_media (
     id TEXT PRIMARY KEY, category_id TEXT, file_name TEXT, content_type TEXT,
     image_data TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_products_category ON showcase_products(category_id, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_media_category ON showcase_media(category_id)`,
];
let schemaReady = null;
async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    for (const stmt of SCHEMA) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { console.error('showcase schema:', e?.message); }
    }
  })();
  return schemaReady;
}

async function authed(request, env) {
  return isAuthenticated(request, await getAdminSecret(env));
}

// GET /api/admin/showcase —— 后台读取全量数据
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return json({ error: 'Unauthorized' }, 401);

  try { await ensureSchema(env); } catch (e) { return json({ error: e?.message || 'Schema init failed' }, 500); }
  try {
  const cats = await env.DB.prepare(
    'SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC'
  ).all();
  const prods = await env.DB.prepare(
    `SELECT * FROM showcase_products ORDER BY sort ASC, name ASC`
  ).all();
  const metaRow = await env.DB.prepare('SELECT data_json FROM showcase_meta WHERE id = 1').first();

  return json({
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
      additionalCharges: parse(p.charges_json, []),
      currency: p.currency || '$',
      sort: p.sort,
    })),
    meta: metaRow?.data_json ? parse(metaRow.data_json, null) : null,
  });
  } catch (e) { return json({ error: e?.message || 'Failed to load showcase' }, 500); }
}

// POST /api/admin/showcase —— 后台保存。body: { op, ... }
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const op = String(body.op || '').trim();
  const ts = now();

  try {
    if (op === 'saveMeta') {
      await env.DB.prepare(
        `INSERT INTO showcase_meta (id, data_json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET data_json = ?1, updated_at = ?2`
      ).bind(JSON.stringify(body.meta || {}), ts).run();
      return json({ ok: true });
    }

    if (op === 'addCategory') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      if (!id || !name) return json({ error: 'id and name are required' }, 400);
      const maxSort = await env.DB.prepare(
        'SELECT COALESCE(MAX(sort), 0) AS m FROM showcase_categories'
      ).first();
      await env.DB.prepare(
        'INSERT INTO showcase_categories (id, name, sort, updated_at) VALUES (?1, ?2, ?3, ?4)'
      ).bind(id, name, (maxSort?.m || 0) + 10, ts).run();
      return json({ ok: true, id });
    }

    if (op === 'updateCategory') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      if (!id || !name) return json({ error: 'id and name are required' }, 400);
      await env.DB.prepare(
        'UPDATE showcase_categories SET name = ?2, updated_at = ?3 WHERE id = ?1'
      ).bind(id, name, ts).run();
      return json({ ok: true });
    }

    if (op === 'deleteCategory') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: 'id is required' }, 400);
      await env.DB.prepare('DELETE FROM showcase_products WHERE category_id = ?1').bind(id).run();
      await env.DB.prepare('DELETE FROM showcase_categories WHERE id = ?1').bind(id).run();
      return json({ ok: true });
    }

    if (op === 'saveProduct') {
      const p = body.product || {};
      const id = String(p.id || '').trim();
      if (!id || !p.name) return json({ error: 'product id and name are required' }, 400);
      const categoryId = String(p.categoryId || '').trim();
      if (!categoryId) return json({ error: 'categoryId is required' }, 400);

      const existing = await env.DB.prepare(
        'SELECT sort FROM showcase_products WHERE id = ?1'
      ).bind(id).first();
      const sort = Number.isFinite(p.sort) ? p.sort : (existing?.sort ?? 0);

      await env.DB.prepare(
        `INSERT INTO showcase_products
           (id, category_id, sku, name, description, features_json, materials,
            image, gallery_json, colors_json, sizes_json, pricing_json,
            price_includes, price_notes_json, charges_json, currency, sort, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
         ON CONFLICT(id) DO UPDATE SET
           category_id=?2, sku=?3, name=?4, description=?5, features_json=?6,
           materials=?7, image=?8, gallery_json=?9, colors_json=?10, sizes_json=?11,
           pricing_json=?12, price_includes=?13, price_notes_json=?14, charges_json=?15,
           currency=?16, sort=?17, updated_at=?18`
      ).bind(
        id, categoryId,
        p.sku || null,
        p.name,
        p.description || null,
        JSON.stringify(p.features || []),
        p.materials || null,
        p.image || null,
        JSON.stringify(p.gallery || []),
        JSON.stringify(p.colors || []),
        JSON.stringify(p.sizes || []),
        JSON.stringify(p.pricing || []),
        p.priceIncludes || null,
        JSON.stringify(p.priceNotes || []),
        JSON.stringify(p.additionalCharges || []),
        p.currency || '$',
        sort, ts
      ).run();
      return json({ ok: true, id });
    }

    if (op === 'deleteProduct') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: 'id is required' }, 400);
      await env.DB.prepare('DELETE FROM showcase_products WHERE id = ?1').bind(id).run();
      return json({ ok: true });
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
      return json({ ok: true });
    }

    return json({ error: `Unknown op: ${op}` }, 400);
  } catch (e) {
    return json({ error: e?.message || 'Save failed' }, 500);
  }
}
