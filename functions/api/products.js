import { corsHeaders, json } from '../_lib/auth.js';

// GET /api/products —— 商品列表（只返回 active）。
// 每个商品含基本信息 + 颜色(swatch/图) + 价格区间；不含全部 SKU（列表保持轻量）。
// 可选 query: group / category / source 过滤。
export async function onRequestGet({ request, env, waitUntil }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  // 边缘缓存：命中直接返回（商品不常变，5 分钟 TTL）
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const url = new URL(request.url);
  const group = url.searchParams.get('group');
  const category = url.searchParams.get('category');
  const source = url.searchParams.get('source');

  const where = ["status = 'active'"];
  const binds = [];
  if (group) { where.push('group_name = ?'); binds.push(group); }
  if (category) { where.push('category = ?'); binds.push(category); }
  if (source) { where.push('source = ?'); binds.push(source); }

  const prodRows = await env.DB.prepare(
    `SELECT spu,name,brand,group_name,category,category_title,source,currency,
            description,price_min,price_max,default_image,tiered_pricing,sort
     FROM products WHERE ${where.join(' AND ')} ORDER BY sort ASC, spu ASC`
  ).bind(...binds).all();

  const products = prodRows.results || [];
  if (!products.length) return json({ products: [] }, 200, cors);

  // 一次拉全部颜色，按 spu 分组
  const colorRows = await env.DB.prepare(
    'SELECT spu,color_name,color_code,swatch,images_json,sort FROM product_colors ORDER BY sort ASC'
  ).all();
  const colorsBySpu = {};
  for (const c of colorRows.results || []) {
    (colorsBySpu[c.spu] ||= []).push({
      name: c.color_name,
      code: c.color_code,
      swatch: c.swatch,
      images: safeParse(c.images_json, []),
    });
  }

  // 每个 spu 的去重尺码（供列表筛选/Quick Add），只取 active SKU
  const sizeRows = await env.DB.prepare(
    "SELECT DISTINCT spu, size FROM product_skus WHERE status = 'active'"
  ).all();
  const sizesBySpu = {};
  for (const s of sizeRows.results || []) {
    if (!s.size) continue;
    (sizesBySpu[s.spu] ||= []).push(s.size);
  }

  const out = products.map((p) => ({
    spu: p.spu,
    name: p.name,
    brand: p.brand,
    group: p.group_name,
    category: p.category,
    categoryTitle: p.category_title,
    source: p.source,
    currency: p.currency,
    description: p.description,
    // 阶梯定价关闭(默认): 只用单一价(price_min)，首页不显示区间
    priceRange: p.tiered_pricing ? [p.price_min, p.price_max] : [p.price_min, p.price_min],
    image: p.default_image,
    colorOptions: colorsBySpu[p.spu] || [],
    sizeList: sizesBySpu[p.spu] || [],
  }));

  const res = json({ products: out }, 200, {
    ...cors,
    'Cache-Control': 'public, max-age=300',   // 边缘 + 浏览器缓存 5 分钟
  });
  // 存入边缘缓存(不阻塞响应)
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
