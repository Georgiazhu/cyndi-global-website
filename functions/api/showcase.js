import { json } from '../../_lib/auth.js';

const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// GET /api/showcase —— 公开读取：分类 + 商品 + 全局设置。
// 前台 https://www.cyndiglobal.com/showcase/ 使用此接口。
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);

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
}
