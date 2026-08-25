import { getAuthenticatedUser, json } from '../../_lib/auth.js';

// GET /api/orders/mine — orders belonging to the logged-in user
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const result = await env.DB.prepare(
    'SELECT order_no, total, status, created_at FROM orders WHERE user_id = ?1 ORDER BY created_at DESC'
  ).bind(user.id).all();

  const orders = (result.results || []).map((row) => ({
    orderNo: row.order_no,
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
  }));

  return json({ orders });
}
