// POST /api/set-initial-password { newPassword } — 首次登录后客户自设密码。
// 前提：当前会话客户 must_change_password=1（管理员建号时标记）。设置成功后清除标记。
import { corsHeaders, json } from '../_lib/auth.js';
import {
  NOT_CONFIGURED_ERROR,
  hashPassword,
  loadCustomerById,
  readCustomerSession,
  customerSessionsConfigured,
} from '../_lib/customer-auth.js';

const PW_RE_UPPER = /[A-Z]/;
const PW_RE_NUM = /[0-9]/;

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);

  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  if (!session.customer) return json({ error: 'Not signed in' }, 401, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, cors); }
  const pw = body?.newPassword;
  if (typeof pw !== 'string') return json({ error: 'newPassword is required' }, 400, cors);
  if (pw.length < 8 || pw.length > 128) return json({ error: 'Password must be 8–128 characters' }, 400, cors);
  if (!PW_RE_UPPER.test(pw)) return json({ error: 'Password must include an uppercase letter' }, 400, cors);
  if (!PW_RE_NUM.test(pw)) return json({ error: 'Password must include a number' }, 400, cors);

  const rec = await hashPassword(pw, env);
  await env.DB.prepare(
    'UPDATE customers SET password_hash = ?2, password_salt = ?3, must_change_password = 0 WHERE id = ?1'
  ).bind(session.customer.id, rec.hash, rec.salt).run();

  const fresh = await loadCustomerById(env.DB, session.customer.id);
  return json({ ok: true }, 200, cors);
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
