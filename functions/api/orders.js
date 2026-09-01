import { corsHeaders, json } from '../_lib/auth.js';
import { getCustomerId } from '../_lib/customer-auth.js';

// 生成订单号：SW-YYYYMMDD-XXXXXX
function genOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SW-${ymd}-${rand}`;
}

function toNumber(v) {
  const n = parseFloat(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : 0;
}

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
  let itemCount = 0;
  let total = 0;
  const snapshot = items.map((it) => {
    const qty = Math.max(1, parseInt(it.quantity) || 1);
    const price = toNumber(it.price);
    itemCount += qty;
    total += price * qty;
    return {
      id: it.id,
      sku: it.sku || null,
      name: it.name,
      price,
      quantity: qty,
      selectedColor: it.selectedColor || null,
      selectedSize: it.selectedSize || null,
      image: it.image || null,
    };
  });

  const now = new Date().toISOString();
  const orderNo = genOrderNo();

  try {
    await env.DB.prepare(
      `INSERT INTO orders
        (order_no, customer_name, customer_email, customer_phone, company, notes,
         items_json, item_count, total, status, created_at, status_updated_at, customer_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?10, ?11)`
    ).bind(
      orderNo,
      name,
      email,
      (body.phone || '').trim() || null,
      (body.company || '').trim() || null,
      (body.notes || '').trim() || null,
      JSON.stringify(snapshot),
      itemCount,
      Number(total.toFixed(2)),
      now,
      customerId || null
    ).run();
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

  const row = await env.DB.prepare(
    `SELECT order_no, customer_name, customer_email, customer_phone, company, notes,
            items_json, item_count, total, status, created_at, status_updated_at
     FROM orders WHERE order_no = ?1`
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
