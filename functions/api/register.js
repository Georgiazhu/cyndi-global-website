import { corsHeaders, json } from '../_lib/auth.js';
import {
  EMAIL_RE,
  NOT_CONFIGURED_ERROR,
  createCustomerSession,
  customerSessionsConfigured,
  hashPassword,
  sessionCookie,
} from '../_lib/customer-auth.js';

// POST /api/register —— 商城自助注册。新账号没有 Showcase 权限（showcase_access = 0）、不属于任何客户公司。
export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, cors); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400, cors);

  const email = String(body.email || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = String(body.displayName || '').trim().slice(0, 60) || null;

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'A valid email is required' }, 400, cors);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400, cors);
  if (password.length > 128) return json({ error: 'Password is too long (max 128 characters)' }, 400, cors);

  // 查重（大小写不敏感）
  const existing = await env.DB.prepare('SELECT id FROM customers WHERE lower(email) = ?1').bind(email).first();
  if (existing) return json({ error: 'An account with this email already exists' }, 409, cors);

  const rec = await hashPassword(password, env);
  const now = new Date().toISOString();

  let id;
  try {
    const res = await env.DB.prepare(
      `INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at, client_id, showcase_access)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, NULL, 0)`
    ).bind(email, rec.hash, rec.salt, displayName, now).run();
    id = res.meta?.last_row_id;
  } catch {
    return json({ error: 'Could not create account' }, 500, cors);
  }

  const token = await createCustomerSession(env, id);
  return json(
    { user: { email, username: null, displayName: displayName || email.split('@')[0] } },
    201,
    { ...cors, 'Set-Cookie': sessionCookie(token, request) }
  );
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
