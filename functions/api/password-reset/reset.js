// POST /api/password-reset/reset { token, newPassword }
// Consumes a verified reset token and saves the new password.

import { corsHeaders, json } from '../../_lib/auth.js';
import { hashPassword } from '../../_lib/customer-auth.js';
import { readResetToken } from '../../_lib/password-reset.js';
import { ensurePortalSchema } from '../../_lib/portal.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Origin' };
const PW_RE_UPPER = /[A-Z]/;
const PW_RE_NUM = /[0-9]/;

async function readBody(request) {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  const headers = { ...NO_STORE, ...cors };
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, headers);

  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400, headers);

  const claims = await readResetToken(env, body.token);
  if (!claims) return json({ error: 'This reset link is invalid or has expired. Please request a new code.' }, 400, headers);

  const pw = body.newPassword;
  if (typeof pw !== 'string') return json({ error: 'newPassword is required' }, 400, headers);
  if (pw.length < 8 || pw.length > 128) return json({ error: 'Password must be 8–128 characters' }, 400, headers);
  if (!PW_RE_UPPER.test(pw)) return json({ error: 'Password must include an uppercase letter' }, 400, headers);
  if (!PW_RE_NUM.test(pw)) return json({ error: 'Password must include a number' }, 400, headers);

  await ensurePortalSchema(env.DB);
  const record = await env.DB.prepare('SELECT * FROM portal_password_resets WHERE id = ?1')
    .bind(claims.recordId).first();
  if (!record || Number(record.customer_id) !== Number(claims.customerId) || !record.used_at || record.reset_at) {
    return json({ error: 'This reset link has already been used. Please request a new code.' }, 400, headers);
  }

  const rec = await hashPassword(pw, env);
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE customers SET password_hash = ?2, password_salt = ?3, must_change_password = 0 WHERE id = ?1'
  ).bind(claims.customerId, rec.hash, rec.salt).run();
  await env.DB.prepare('UPDATE portal_password_resets SET reset_at = ?2 WHERE id = ?1')
    .bind(claims.recordId, nowIso).run();

  return json({ ok: true }, 200, headers);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
