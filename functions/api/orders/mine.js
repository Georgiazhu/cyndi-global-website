import { corsHeaders, json } from '../../_lib/auth.js';
import { getCustomerId } from '../../_lib/customer-auth.js';

// GET /api/orders/mine —— 当前登录客户的订单列表（需 customer_session）
export async function onRequestGet({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  const customerId = await getCustomerId(request, env);
  if (!customerId) return json({ error: 'Please sign in to view your orders' }, 401, cors);

  const rows = await env.DB.prepare(
    `SELECT order_no, item_count, total, status, created_at
     FROM orders
     WHERE customer_id = ?1
     ORDER BY created_at DESC
     LIMIT 100`
  ).bind(customerId).all();

  const orders = (rows.results || []).map((r) => ({
    orderNo: r.order_no,
    itemCount: r.item_count,
    total: r.total,
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
