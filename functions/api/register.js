import { corsHeaders, json } from '../_lib/auth.js';
import { hashPassword, randomSalt, createCustomerSession, sessionCookie } from '../_lib/customer-auth.js';

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, cors); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const displayName = (body.displayName || '').trim() || null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required' }, 400, cors);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400, cors);

  // 查重
  const existing = await env.DB.prepare('SELECT id FROM customers WHERE email = ?1').bind(email).first();
  if (existing) return json({ error: 'An account with this email already exists' }, 409, cors);

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  let id;
  try {
    const res = await env.DB.prepare(
      'INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at) VALUES (?1, ?2, ?3, ?4, \'active\', ?5)'
    ).bind(email, hash, salt, displayName, now).run();
    id = res.meta?.last_row_id;
  } catch {
    return json({ error: 'Could not create account' }, 500, cors);
  }

  const token = await createCustomerSession(env, id);
  return json(
    { user: { email, displayName: displayName || email.split('@')[0] } },
    201,
    { ...cors, 'Set-Cookie': sessionCookie(token) }
  );
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
