import { hashPassword, timingSafeEqual, createSession, sessionCookie, json } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);
  if (!env.SESSION_SECRET) return json({ error: 'Session secret is not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) return json({ error: 'Email and password are required' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = ?1'
  ).bind(email).first();

  // Always compute a hash to keep timing consistent whether or not the user exists.
  const candidateHash = await hashPassword(password);
  if (!user || !timingSafeEqual(candidateHash, user.password_hash)) {
    return json({ error: 'Invalid email or password' }, 401);
  }

  const token = await createSession(user.id, env.SESSION_SECRET);
  return json(
    { user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at } },
    200,
    { 'Set-Cookie': sessionCookie(token) }
  );
}
