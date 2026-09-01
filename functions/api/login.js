import { corsHeaders, json } from '../_lib/auth.js';
import { hashPassword, createCustomerSession, sessionCookie } from '../_lib/customer-auth.js';

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, cors); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) return json({ error: 'Email and password are required' }, 400, cors);

  const row = await env.DB.prepare(
    'SELECT id, email, password_hash, password_salt, display_name, status FROM customers WHERE email = ?1'
  ).bind(email).first();

  // 统一错误信息，避免泄露账号是否存在
  if (!row) return json({ error: 'Invalid email or password' }, 401, cors);
  if (row.status !== 'active') return json({ error: 'Account is disabled' }, 403, cors);

  const hash = await hashPassword(password, row.password_salt);
  if (hash !== row.password_hash) return json({ error: 'Invalid email or password' }, 401, cors);

  const token = await createCustomerSession(env, row.id);
  return json(
    { user: { email: row.email, displayName: row.display_name || row.email.split('@')[0] } },
    200,
    { ...cors, 'Set-Cookie': sessionCookie(token) }
  );
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
