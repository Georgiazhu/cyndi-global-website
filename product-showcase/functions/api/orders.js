import { getAuthenticatedUser, json, isValidEmail } from '../_lib/auth.js';

function orderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${ymd}-${rand}`;
}

// POST /api/orders — place an order (guest or logged-in)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const company = String(body.company || '').trim();
  const notes = String(body.notes || '').trim();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!name) return json({ error: 'Name is required' }, 400);
  if (!isValidEmail(email)) return json({ error: 'A valid email is required' }, 400);
  if (items.length === 0) return json({ error: 'Cart is empty' }, 400);

  const normalized = items.map((it) => ({
    id: it.id,
    name: String(it.name || ''),
    price: Number(Array.isArray(it.price) ? it.price[0] : it.price) || 0,
    quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
    image: String(it.image || ''),
  }));
  const total = normalized.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const user = await getAuthenticatedUser(request, env);
  const now = new Date().toISOString();
  const orderNo = orderNumber();
  const events = [{ time: now, title: 'Order received', description: 'We have received your order and will begin processing it.' }];

  await env.DB.prepare(
    `INSERT INTO orders (order_no, user_id, customer_name, customer_email, customer_phone, company, notes, items_json, total, status, events_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'received', ?10, ?11, ?11)`
  ).bind(
    orderNo,
    user ? user.id : null,
    name, email, phone, company, notes,
    JSON.stringify(normalized),
    total,
    JSON.stringify(events),
    now
  ).run();

  return json({ orderNo, status: 'received', total }, 201);
}

// GET /api/orders?orderNo=XXX — public tracking lookup
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);
  const url = new URL(request.url);
  const orderNo = String(url.searchParams.get('orderNo') || '').trim().toUpperCase();
  if (!orderNo) return json({ error: 'orderNo is required' }, 400);

  const row = await env.DB.prepare(
    'SELECT order_no, customer_name, items_json, total, status, events_json, created_at, updated_at FROM orders WHERE order_no = ?1'
  ).bind(orderNo).first();

  if (!row) return json({ error: 'Order not found' }, 404);

  return json({
    order: {
      orderNo: row.order_no,
      customerName: row.customer_name,
      items: JSON.parse(row.items_json || '[]'),
      total: row.total,
      status: row.status,
      events: JSON.parse(row.events_json || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}
