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
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Enter a valid email address' }, 400, headers);
  }

  try {
    const code = randomCode();
    const recordId = await createRegistrationCode(env.DB, email, code);
    const mail = await sendPortalCodeEmail(env, email, code, 'register');
    const devMode = env.ALLOW_RESET_CODE_IN_RESPONSE === '1' && !!mail.devCode;

    // Never claim a code was sent when no email provider accepted it. In local
    // dev mode the code is returned explicitly so the flow remains testable.
    if (!mail.sent && !devMode) {
      if (recordId) {
        try { await env.DB.prepare('DELETE FROM portal_registrations WHERE id = ?1').bind(recordId).run(); } catch {}
      }
      return json({
        error: 'Email delivery is not configured or failed. Please contact Cyndi Global or try again later.',
        reason: mail.reason || 'send_failed',
      }, 503, headers);
    }

    return json({ ok: true, sent: true, devCode: devMode ? mail.devCode : undefined }, 200, headers);
  } catch (e) {
    console.error('portal register request:', e?.message);
    return json({ error: 'Could not start registration. Please try again.' }, 500, headers);
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
