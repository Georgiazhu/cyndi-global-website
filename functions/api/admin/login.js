import { checkAdminPassword, createSession, getAdminSecret, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const secret = await getAdminSecret(env);
  if (!secret) return json({ error: 'Admin password has not been configured' }, 503);
  if (!await checkAdminPassword(env, body.password)) return json({ error: 'Invalid password' }, 401);
  const session = await createSession(secret);
  return json({ ok: true }, 200, { 'Set-Cookie': `logistics_admin=${session}; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict` });
}
