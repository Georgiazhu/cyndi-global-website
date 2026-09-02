import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

async function authed(request, env) {
  return isAuthenticated(request, await getAdminSecret(env));
}

// GET /api/admin/products —— 后台商品列表(含 hidden)，每商品带 SKU 概览。
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return json({ error: 'Unauthorized' }, 401);

  const prod = await env.DB.prepare(
    `SELECT spu,name,brand,group_name,category,category_title,source,currency,
            price_min,price_max,default_image,status,tiered_pricing,sort
     FROM products ORDER BY sort ASC, spu ASC`
  ).all();
  const products = prod.results || [];

  // SKU 概览：每商品的 SKU 数、价格集合
  const skuRows = await env.DB.prepare(
    'SELECT spu, sku, color_code, color_name, size, price, currency, status FROM product_skus'
  ).all();
  const skusBySpu = {};
  for (const s of skuRows.results || []) (skusBySpu[s.spu] ||= []).push(s);

  const out = products.map((p) => ({
    spu: p.spu,
    name: p.name,
    brand: p.brand,
    group: p.group_name,
    category: p.category,
    categoryTitle: p.category_title,
    source: p.source,
    currency: p.currency,
    priceRange: [p.price_min, p.price_max],
    image: p.default_image,
    status: p.status,
    tieredPricing: !!p.tiered_pricing,
    skuCount: (skusBySpu[p.spu] || []).length,
    skus: (skusBySpu[p.spu] || []).map((s) => ({
      sku: s.sku, colorCode: s.color_code, colorName: s.color_name,
      size: s.size, price: s.price, currency: s.currency, status: s.status,
    })),
  }));

  return json({ products: out });
}

// POST /api/admin/products —— 更新商品 / SKU。支持三类 body（可组合）：
//  A. 商品字段：{ spu, status?, tieredPricing?, sort?, name?, description?, brand?, defaultImage?, currency? }
//  B. 批量改价：{ spu, skuPrices: [{ sku, price }] }
//  C. 全量编辑颜色+尺码（增删改）：
//     { spu, colors: [{ colorCode?, colorName, swatch, images:[url], sizes:[{size, price?}] }] }
//     以传入 colors 为准重建 product_colors + product_skus；新 SKU 价继承现价。
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (!await authed(request, env)) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const spu = String(body.spu || '').trim();
  if (!spu) return json({ error: 'spu is required' }, 400);

  const prod = await env.DB.prepare('SELECT * FROM products WHERE spu = ?1').bind(spu).first();
  if (!prod) return json({ error: 'Product not found' }, 404);

  const now = new Date().toISOString();
  const currency = body.currency || prod.currency || 'USD';

  // ---- A. 商品字段更新 ----
  const sets = [];
  const binds = [];
  if (body.status !== undefined) {
    if (!['active', 'hidden'].includes(body.status)) return json({ error: 'Invalid status' }, 400);
    sets.push('status = ?'); binds.push(body.status);
  }
  if (body.tieredPricing !== undefined) { sets.push('tiered_pricing = ?'); binds.push(body.tieredPricing ? 1 : 0); }
  if (body.sort !== undefined) { sets.push('sort = ?'); binds.push(parseInt(body.sort) || 0); }
  if (body.name !== undefined) { sets.push('name = ?'); binds.push(String(body.name)); }
  if (body.description !== undefined) { sets.push('description = ?'); binds.push(String(body.description)); }
  if (body.brand !== undefined) { sets.push('brand = ?'); binds.push(String(body.brand)); }
  if (body.defaultImage !== undefined) { sets.push('default_image = ?'); binds.push(String(body.defaultImage)); }
  if (body.currency !== undefined) { sets.push('currency = ?'); binds.push(String(body.currency)); }
  if (sets.length) {
    sets.push('updated_at = ?'); binds.push(now);
    binds.push(spu);
    await env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE spu = ?${binds.length}`).bind(...binds).run();
  }

  // ---- B. 批量改价 ----
  if (Array.isArray(body.skuPrices) && body.skuPrices.length) {
    for (const sp of body.skuPrices) {
      const sku = String(sp.sku || '').trim();
      const price = Number(sp.price);
      if (!sku || !Number.isFinite(price) || price < 0) continue;
      await env.DB.prepare('UPDATE product_skus SET price = ?1, updated_at = ?2 WHERE sku = ?3 AND spu = ?4')
        .bind(price, now, sku, spu).run();
    }
  }

  // ---- C. 全量编辑颜色 + 尺码（增删改；新 SKU 价继承现价）----
  if (Array.isArray(body.colors)) {
    // 现价基准：现有 SKU 的众数/首个价，作为新 SKU 继承价
    const priceRow = await env.DB.prepare('SELECT price FROM product_skus WHERE spu = ?1 LIMIT 1').bind(spu).first();
    const inheritPrice = priceRow?.price ?? prod.price_min ?? 0;

    // 现有 SKU（用于按 sku 保留原价）
    const existRows = await env.DB.prepare('SELECT sku, price FROM product_skus WHERE spu = ?1').bind(spu).all();
    const existPrice = {};
    for (const r of existRows.results || []) existPrice[r.sku] = r.price;

    // 全量重建：先删旧 colors + skus，再插新
    await env.DB.prepare('DELETE FROM product_skus WHERE spu = ?1').bind(spu).run();
    await env.DB.prepare('DELETE FROM product_colors WHERE spu = ?1').bind(spu).run();

    let ci = 0;
    for (const c of body.colors) {
      ci += 1;
      const code = (c.colorCode && String(c.colorCode).trim()) || `C${String(ci).padStart(2, '0')}`;
      const images = Array.isArray(c.images) ? c.images.filter(Boolean) : [];
      const swatch = c.swatch || images[0] || null;
      await env.DB.prepare(
        'INSERT INTO product_colors (spu,color_name,color_code,swatch,images_json,sort) VALUES (?1,?2,?3,?4,?5,?6)'
      ).bind(spu, c.colorName || code, code, swatch, JSON.stringify(images), ci).run();

      const sizes = Array.isArray(c.sizes) && c.sizes.length ? c.sizes : [{ size: 'OS' }];
      for (const s of sizes) {
        const size = String(s.size || 'OS').trim() || 'OS';
        const sku = `${spu}-${code}-${size}`;
        const price = Number.isFinite(Number(s.price)) ? Number(s.price)
          : (existPrice[sku] ?? inheritPrice);   // 新尺码/颜色继承现价
        await env.DB.prepare(
          'INSERT INTO product_skus (sku,spu,color_code,color_name,size,price,currency,tier_prices_json,status,created_at,updated_at) '
          + "VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,'active',?8,?8)"
        ).bind(sku, spu, code, c.colorName || code, size, price, currency, now).run();
      }
    }
  }

  // ---- 同步商品价格区间 ----
  const agg = await env.DB.prepare(
    "SELECT MIN(price) AS mn, MAX(price) AS mx FROM product_skus WHERE spu = ?1 AND status = 'active'"
  ).bind(spu).first();
  if (agg && agg.mn != null) {
    await env.DB.prepare('UPDATE products SET price_min = ?1, price_max = ?2, updated_at = ?3 WHERE spu = ?4')
      .bind(agg.mn, agg.mx, now, spu).run();
  }

  const p = await env.DB.prepare(
    'SELECT spu,name,status,tiered_pricing,price_min,price_max FROM products WHERE spu = ?1'
  ).bind(spu).first();
  // 清边缘缓存：让改动尽快在前台生效（列表 + 该商品详情）
  try {
    const origin = new URL(request.url).origin;
    const cache = caches.default;
    await cache.delete(new Request(`${origin}/api/products`));
    await cache.delete(new Request(`${origin}/api/products/${encodeURIComponent(spu)}`));
  } catch {}

  return json({ ok: true, product: {
    spu: p.spu, name: p.name, status: p.status,
    tieredPricing: !!p.tiered_pricing, priceRange: [p.price_min, p.price_max],
  } });
}
