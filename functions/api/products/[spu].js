import { corsHeaders, json } from '../../_lib/auth.js';

// GET /api/products/:spu —— 商品详情(PDP)。
// 含商品信息 + 所有颜色 + 每颜色下的 SKU(尺码/价格/阶梯价)。只返回 active 商品与 active SKU。
export async function onRequestGet({ request, env, params, waitUntil }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  const spu = String(params.spu || '').trim();
  if (!spu) return json({ error: 'spu is required' }, 400, cors);

  // 边缘缓存
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const p = await env.DB.prepare(
    `SELECT spu,name,brand,group_name,category,category_title,source,source_id,currency,
            description,price_min,price_max,default_image,attributes_json,status,tiered_pricing
     FROM products WHERE spu = ?1 AND status = 'active'`
  ).bind(spu).first();
  if (!p) return json({ error: 'Product not found' }, 404, cors);

  const colorRows = await env.DB.prepare(
    'SELECT color_name,color_code,swatch,images_json,sort FROM product_colors WHERE spu = ?1 ORDER BY sort ASC'
  ).bind(spu).all();

  const skuRows = await env.DB.prepare(
    `SELECT sku,color_code,color_name,size,price,currency,tier_prices_json
     FROM product_skus WHERE spu = ?1 AND status = 'active'`
  ).bind(spu).all();

  const tiered = !!p.tiered_pricing;   // 阶梯定价开关(默认关)
  const skusByColor = {};
  for (const s of skuRows.results || []) {
    (skusByColor[s.color_code] ||= []).push({
      sku: s.sku,
      size: s.size,
      price: s.price,
      currency: s.currency,
      // 开关关闭时不下发阶梯价（前端只用单一价）
      tierPrices: tiered ? safeParse(s.tier_prices_json, null) : null,
    });
  }

  const colorOptions = (colorRows.results || []).map((c) => ({
    name: c.color_name,
    code: c.color_code,
    swatch: c.swatch,
    images: safeParse(c.images_json, []),
    skus: skusByColor[c.color_code] || [],
  }));

  const res = json({
    product: {
      spu: p.spu,
      name: p.name,
      brand: p.brand,
      group: p.group_name,
      category: p.category,
      categoryTitle: p.category_title,
      source: p.source,
      sourceId: p.source_id,
      currency: p.currency,
      description: p.description,
      priceRange: [p.price_min, p.price_max],
      image: p.default_image,
      tieredPricing: tiered,
      attributes: safeParse(p.attributes_json, null),
      colorOptions,
    },
  }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
  if (waitUntil) waitUntil(cache.put(cacheKey, res.clone()));
  else await cache.put(cacheKey, res.clone());
  return res;
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
