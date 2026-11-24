// POST /api/password-reset/verify { email, code }
// Verifies the emailed code and returns a short-lived single-use reset token.

import { corsHeaders, json } from '../../_lib/auth.js';
import { consumeResetCode, createResetToken } from '../../_lib/password-reset.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Origin' };

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
  if (!env.CUSTOMER_SESSION_SECRET) return json({ error: 'Customer sessions are not configured' }, 503, headers);

  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400, headers);

  const result = await consumeResetCode(env.DB, body.email, body.code);
  if (!result.ok) {
    const status = result.reason === 'too_many' ? 429 : 400;
    return json({ error: result.message || 'Invalid code' }, status, headers);
  }

  const token = await createResetToken(env, { recordId: result.recordId, customerId: result.customerId });
  return json({ ok: true, token }, 200, headers);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
