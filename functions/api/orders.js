import { corsHeaders, json } from '../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, hasCustomerCookie, readCustomerSession } from '../_lib/customer-auth.js';
import { genOrderNo, insertOrder, isShowcaseOrderNo, normaliseShopItems } from '../_lib/orders.js';
import { shpLoadForOrderSafe } from '../_lib/shipments.js';

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

  // 已登录客户：用账户 name/email，前端可不传。
  // 带着客户 cookie 但服务端没配置会话密钥 -> 503，避免把登录用户的订单静默记成游客单。
  const session = await readCustomerSession(request, env);
  if (!session.configured && hasCustomerCookie(request)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  const cust = session.customer;
  const customerId = cust ? cust.id : null;
  let name = (body.name || '').trim();
  let email = (body.email || '').trim();
  if (cust) {
    email = cust.email;
    name = name || cust.display_name || cust.email.split('@')[0];
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

// GET /api/orders?orderNo=... —— 按订单号查询
//  - SW-（商城单）：公开跟踪，知道单号即可查（行为不变）
//  - SHOWCASE- / 旧 SC-（Showcase 单）：只有下单本人（customer_session 的 id == orders.customer_id）能查，其他人一律 404
export async function onRequestGet({ request, env }) {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const orderNo = new URL(request.url).searchParams.get('orderNo')?.trim();
  if (!orderNo) return json({ error: 'orderNo is required' }, 400, cors);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  // 允许名单：只认 SW-（公开）和 Showcase 单（SHOWCASE-/旧 SC-，仅限下单本人）；其他前缀一律 404。
  // 匿名或非本人请求 Showcase 单，与“不存在”返回同样的 404。
  const notFound = () => json({ error: 'Order not found' }, 404, cors);
  const type = orderNo.startsWith('SW-') ? 'SW' : isShowcaseOrderNo(orderNo) ? 'SC' : null;
  if (!type) return notFound();

  const row = await env.DB.prepare(
    `SELECT order_no, customer_name, customer_email, customer_phone, company, notes,
            items_json, item_count, total, status, created_at, status_updated_at, customer_id
     FROM orders WHERE order_no = ?1`
  ).bind(orderNo).first();
  if (!row) return notFound();

  let notes = row.notes;
  if (type === 'SC') {
    const session = await readCustomerSession(request, env);
    if (!session.customer || row.customer_id == null || Number(row.customer_id) !== Number(session.customer.id)) return notFound();
    // 去掉内部的 [showcase:<账号>] 标签
    notes = (notes || '').replace(/^\[showcase:[^\]]*\]\s?/, '') || null;
  }

  let items = [];
  try { items = JSON.parse(row.items_json); } catch {}

  // 物流信息：只在上面的归属校验通过后才加载（失败时降级为 []）
  const shipments = await shpLoadForOrderSafe(env.DB, row.order_no);

  return json({
    orderNo: row.order_no,
    type,
    customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone, company: row.company },
    notes,
    items,
    itemCount: row.item_count,
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    statusUpdatedAt: row.status_updated_at,
    shipments,
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
