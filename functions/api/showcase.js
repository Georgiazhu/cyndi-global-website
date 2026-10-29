import { json } from '../_lib/auth.js';

const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// D1 表可能尚未创建（迁移未执行）。这里做一次幂等的建表，
// 避免接口直接抛错导致 Worker 1101，也让首次部署无需手工跑迁移。
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
      try { await env.DB.prepare(stmt).run(); }
      catch (e) { console.error('showcase schema:', e?.message); }
    }
  })();
  return schemaReady;
}

// GET /api/showcase —— 公开读取：分类 + 商品 + 全局设置。
// 前台 https://www.cyndiglobal.com/showcase/ 使用此接口。
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);

  try {
    await ensureSchema(env);

    const catRows = await env.DB.prepare(
      'SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC'
    ).all();
    const prodRows = await env.DB.prepare(
      `SELECT id, category_id, sku, name, description, features_json, materials,
              image, gallery_json, colors_json, sizes_json, pricing_json,
              price_includes, price_notes_json, charges_json, currency, sort
       FROM showcase_products ORDER BY sort ASC, name ASC`
    ).all();

    const byCategory = {};
    for (const p of prodRows.results || []) {
      (byCategory[p.category_id] ||= []).push({
        id: p.id,
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
      });
    }

    const categories = (catRows.results || []).map((c) => ({
      id: c.id,
      name: c.name,
      products: byCategory[c.id] || [],
    }));

    let meta = null;
    const metaRow = await env.DB.prepare('SELECT data_json FROM showcase_meta WHERE id = 1').first();
    if (metaRow?.data_json) meta = parse(metaRow.data_json, null);

    return json({ meta, categories }, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (e) {
    return json({ error: e?.message || 'Failed to load showcase', categories: [], meta: null }, 500);
  }
}
