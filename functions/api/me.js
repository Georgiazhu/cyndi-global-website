import { corsHeaders, json } from '../_lib/auth.js';
import { getCustomerId } from '../_lib/customer-auth.js';

export async function onRequestGet({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  const cid = await getCustomerId(request, env);
  if (!cid) return json({ user: null }, 200, cors);

  const row = await env.DB.prepare('SELECT email, display_name, status FROM customers WHERE id = ?1').bind(cid).first();
  if (!row || row.status !== 'active') return json({ user: null }, 200, cors);

  return json({ user: { email: row.email, displayName: row.display_name || row.email.split('@')[0] } }, 200, cors);
}
