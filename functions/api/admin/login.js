import { verifyAdminCredentials, createSession, getAdminSecret, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdminCredentials(env, body.username, body.password);
  if (!admin) return json({ error: 'Invalid username or password' }, 401);
  const secret = await getAdminSecret(env);
  const session = await createSession(secret, admin.username);
  return json(
    { ok: true, user: { username: admin.username, displayName: admin.displayName } },
    200,
    { 'Set-Cookie': `logistics_admin=${session}; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict` }
  );
}
