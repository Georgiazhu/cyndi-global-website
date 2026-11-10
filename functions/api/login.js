import { corsHeaders, json } from '../_lib/auth.js';
import {
  NOT_CONFIGURED_ERROR,
  authenticateCustomer,
  createCustomerSession,
  customerSessionsConfigured,
  publicUser,
  sessionCookie,
} from '../_lib/customer-auth.js';

// POST /api/login  { email | username | identifier, password }
// email 字段既可填邮箱也可填用户名（"Email or username"）。
export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, cors); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400, cors);

  const identifier = String(body.identifier || body.email || body.username || '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password) return json({ error: 'Email or username and password are required' }, 400, cors);

  const result = await authenticateCustomer(env, identifier, password);
  // 统一错误信息，避免泄露账号是否存在
  if (result.status === 'invalid') return json({ error: 'Invalid email/username or password' }, 401, cors);
  if (result.status === 'disabled') return json({ error: 'Account is disabled' }, 403, cors);

  const token = await createCustomerSession(env, result.customer.id);
  return json(
    { user: publicUser(result.customer) },
    200,
    { ...cors, 'Set-Cookie': sessionCookie(token, request) }
  );
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
