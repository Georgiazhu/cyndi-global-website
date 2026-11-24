// POST /api/password-reset/request { email }
// Always returns the same generic response: no account enumeration, no domain
// allowlist, no approval gate. If an active customer matches, a 6-digit code
// is emailed to that address.

import { corsHeaders, json } from '../../_lib/auth.js';
import { sendPasswordResetEmail } from '../../_lib/mailer.js';
import { createResetRecord, findCustomerByEmail, randomCode } from '../../_lib/password-reset.js';

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

  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400, headers);

  const email = String(body.email || '').trim().toLowerCase();
  // Generic success for every syntactically plausible address, known or not.
  if (email && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    try {
      const customer = await findCustomerByEmail(env.DB, email);
      if (customer && customer.status === 'active') {
        const code = randomCode();
        await createResetRecord(env.DB, customer, code);
        const mail = await sendPasswordResetEmail(env, email, code);
        if (env.ALLOW_RESET_CODE_IN_RESPONSE === '1' && mail.devCode) {
          return json({ ok: true, sent: mail.sent, devCode: mail.devCode }, 200, headers);
        }
      }
    } catch (e) {
      console.error('password reset request:', e?.message);
    }
  }

  return json({ ok: true }, 200, headers);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
