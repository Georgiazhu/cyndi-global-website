import { corsHeaders, json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession } from '../../_lib/customer-auth.js';

function orderType(orderNo) {
  const p = String(orderNo || '').slice(0, 3);
  return p === 'SW-' ? 'SW' : p === 'SC-' ? 'SC' : null;
}

// 单一币种时返回该币种（SC 单的 currency 是 '$' / '¥' 之类符号），否则 null
function itemsCurrency(raw) {
  let items = [];
  try { items = JSON.parse(raw || '[]'); } catch {}
  if (!Array.isArray(items)) return null;
  const set = new Set(items.map((i) => (i && i.currency) || null));
  return set.size === 1 ? [...set][0] : null;
}

// GET /api/orders/mine —— 当前登录客户自己的订单（商城 SW- 与 Showcase SC- 都有，带 type）
export async function onRequestGet({ request, env }) {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  if (!session.customer) return json({ error: 'Please sign in to view your orders' }, 401, cors);

  const rows = await env.DB.prepare(
    `SELECT order_no, item_count, total, status, created_at, items_json
     FROM orders
     WHERE customer_id = ?1 AND (order_no LIKE 'SW-%' OR order_no LIKE 'SC-%')
     ORDER BY created_at DESC
     LIMIT 100`
  ).bind(session.customer.id).all();

  const orders = (rows.results || []).map((r) => ({
    orderNo: r.order_no,
    type: orderType(r.order_no),
    itemCount: r.item_count,
    total: r.total,
    currency: itemsCurrency(r.items_json),
    status: r.status,
    createdAt: r.created_at,
  }));

  return json({ orders }, 200, cors);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
