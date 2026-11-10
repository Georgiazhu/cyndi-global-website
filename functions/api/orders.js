import { corsHeaders, json } from '../_lib/auth.js';
import { getCustomerId } from '../_lib/customer-auth.js';
import { genOrderNo, insertOrder, normaliseShopItems } from '../_lib/orders.js';

// 订单号：SW-YYYYMMDD-XXXXXX（生成、快照、INSERT 逻辑在 functions/_lib/orders.js，与 showcase 共用）

// POST /api/orders —— 提交订单
export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json({ error: 'Cart is empty' }, 400, cors);

  // 已登录客户：用账户 name/email，前端可不传
  const customerId = await getCustomerId(request, env);
  let name = (body.name || '').trim();
  let email = (body.email || '').trim();
  if (customerId) {
    const cust = await env.DB.prepare('SELECT email, display_name FROM customers WHERE id = ?1').bind(customerId).first();
    if (cust) {
      email = cust.email;
      name = name || cust.display_name || cust.email.split('@')[0];
    }
  }

  // 校验（游客必须填；登录用户已从账户取到）
  if (!name) return json({ error: 'Name is required' }, 400, cors);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required' }, 400, cors);

  // 计算件数与合计（以服务端为准，不信任前端传的 total）
  const { snapshot, itemCount, total } = normaliseShopItems(items);

  const orderNo = genOrderNo('SW');

  try {
    await insertOrder(env.DB, {
      orderNo,
      name,
      email,
      phone: (body.phone || '').trim() || null,
      company: (body.company || '').trim() || null,
      notes: (body.notes || '').trim() || null,
      items: snapshot,
      itemCount,
      total,
      customerId: customerId || null,
    });
  } catch (e) {
    return json({ error: 'Could not place order' }, 500, cors);
  }

  return json({ orderNo, status: 'pending', itemCount, total: Number(total.toFixed(2)) }, 201, cors);
}

// GET /api/orders?orderNo=SW-... —— 按订单号查询（用于跟踪）
export async function onRequestGet({ request, env }) {
  const cors = corsHeaders(request);
  const orderNo = new URL(request.url).searchParams.get('orderNo')?.trim();
  if (!orderNo) return json({ error: 'orderNo is required' }, 400, cors);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  // 只查商城订单（SW-）：orders 表与 showcase 共用，SC- 订单只能经需要会话的 /api/showcase/orders 读取，这里一律按“不存在”返回 404
  const row = await env.DB.prepare(
    `SELECT order_no, customer_name, customer_email, customer_phone, company, notes,
            items_json, item_count, total, status, created_at, status_updated_at
     FROM orders WHERE order_no = ?1 AND order_no LIKE 'SW-%'`
  ).bind(orderNo).first();

  if (!row) return json({ error: 'Order not found' }, 404, cors);

  let items = [];
  try { items = JSON.parse(row.items_json); } catch {}

  return json({
    orderNo: row.order_no,
    customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone, company: row.company },
    notes: row.notes,
    items,
    itemCount: row.item_count,
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    statusUpdatedAt: row.status_updated_at,
  }, 200, cors);
}

// CORS 预检
export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
