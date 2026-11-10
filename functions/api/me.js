import { corsHeaders, json } from '../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, hasShowcaseAccess, publicUser, readCustomerSession } from '../_lib/customer-auth.js';

export async function onRequestGet({ request, env }) {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);

  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  // 无会话 / 签名不对 / 账号被禁用 -> 未登录
  if (!session.customer) return json({ user: null }, 200, cors);

  const row = session.customer;
  return json({ user: { ...publicUser(row), showcaseAccess: hasShowcaseAccess(row) } }, 200, cors);
}
