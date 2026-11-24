// POST /api/portal/register/request { email }
// Public registration: any valid email may request a verification code.
// No account lookup, domain allowlist or approval gate.

import { corsHeaders, json } from '../../../_lib/auth.js';
import { sendPortalCodeEmail } from '../../../_lib/mailer.js';
import { createRegistrationCode } from '../../../_lib/portal-registration.js';
import { randomCode } from '../../../_lib/password-reset.js';

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
  if (email && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    try {
      const code = randomCode();
      await createRegistrationCode(env.DB, email, code);
      const mail = await sendPortalCodeEmail(env, email, code, 'register');
      // Controlled diagnostic: only for a reserved internal address, never real customers.
      if (email === 'diag-sendtest@cyndiglobal.com') {
        return json({ ok: true, sent: mail.sent, reason: mail.reason, status: mail.status, detail: mail.detail, hasKey: !!env.RESEND_API_KEY, from: env.EMAIL_FROM || null }, 200, headers);
      }
      if (env.ALLOW_RESET_CODE_IN_RESPONSE === '1' && mail.devCode) {
        return json({ ok: true, sent: mail.sent, devCode: mail.devCode }, 200, headers);
      }
    } catch (e) {
      console.error('portal register request:', e?.message);
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
