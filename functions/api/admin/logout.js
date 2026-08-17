import { json } from '../../_lib/auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': 'logistics_admin=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict' });
}
