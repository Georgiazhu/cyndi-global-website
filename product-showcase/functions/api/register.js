import { hashPassword, createSession, sessionCookie, json, isValidEmail } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);
  if (!env.SESSION_SECRET) return json({ error: 'Session secret is not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  let displayName = String(body.displayName || '').trim();

  if (!isValidEmail(email)) return json({ error: 'Please enter a valid email address' }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: 'Password must be 8 to 128 characters' }, 400);
  if (displayName.length > 60) return json({ error: 'Display name must be 60 characters or fewer' }, 400);

  // Display name is optional; default to the local part of the email.
  if (!displayName) displayName = email.split('@')[0];

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (existing) return json({ error: 'An account with this email already exists' }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(id, email, passwordHash, displayName, createdAt).run();

  const token = await createSession(id, env.SESSION_SECRET);
  return json(
    { user: { id, email, displayName, createdAt } },
    201,
    { 'Set-Cookie': sessionCookie(token) }
  );
}
