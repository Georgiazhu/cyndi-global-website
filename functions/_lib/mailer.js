// Minimal password-reset email sender for Cloudflare Pages Functions.
// Preferred provider: Resend (RESEND_API_KEY + EMAIL_FROM).
// A generic JSON mail endpoint can also be used via MAIL_API_URL + MAIL_API_KEY.
// If neither is configured, the code is never exposed in production; set
// ALLOW_RESET_CODE_IN_RESPONSE=1 only for local/staging testing.

const DEFAULT_FROM = 'Cyndi Global <no-reply@cyndiglobal.com>';

function buildMessage(to, code, purpose) {
  const isRegister = purpose === 'register';
  const subject = isRegister
    ? 'Verify your Cyndi Global portal email'
    : 'Your Cyndi Global portal verification code';
  const action = isRegister ? 'create your portal account' : 'reset your portal password';
  const text = [
    `Your Cyndi Global portal verification code is ${code}.`,
    '',
    `Use this code to ${action}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
    '',
    'Cyndi Global',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.6">
      <p>Your Cyndi Global portal verification code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p>
      <p>Use this code to ${action}. It expires in 15 minutes. If you did not request this, you can ignore this email.</p>
      <p style="color:#8C7B66;font-size:12px">Cyndi Global</p>
    </div>`;
  return { to, subject, text, html };
}

export async function sendPortalCodeEmail(env, to, code, purpose = 'reset') {
  const from = env?.EMAIL_FROM || DEFAULT_FROM;
  const { to: recipient, subject, text, html } = buildMessage(to, code, purpose);
  const devCode = env?.ALLOW_RESET_CODE_IN_RESPONSE === '1' ? code : undefined;
  const apiKey = env?.RESEND_API_KEY || env?.MAIL_API_KEY;
  const apiUrl = env?.MAIL_API_URL;

  if (!apiKey && !apiUrl) {
    console.error('portal code email: no mail provider configured (set RESEND_API_KEY or MAIL_API_URL)');
    return { sent: false, reason: 'not_configured', devCode };
  }

  try {
    let res;
    if (apiUrl) {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ from, to: recipient, subject, text, html }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ from, to: [recipient], subject, text, html }),
      });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`portal code email: provider returned ${res.status}`, detail.slice(0, 500));
      return { sent: false, reason: 'provider_error', devCode };
    }
    return { sent: true, devCode };
  } catch (e) {
    console.error('portal code email: send failed', e?.message);
    return { sent: false, reason: 'send_failed', devCode };
  }
}

export async function sendPasswordResetEmail(env, to, code) {
  return sendPortalCodeEmail(env, to, code, 'reset');
}
