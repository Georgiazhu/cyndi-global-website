import { corsHeaders } from '../_lib/auth.js';
import { clearCookie, clearLegacyShowcaseCookie, jsonWithCookies } from '../_lib/customer-auth.js';

export async function onRequestPost({ request }) {
  const cors = corsHeaders(request);
  return jsonWithCookies({ ok: true }, 200, cors, [clearCookie(request), clearLegacyShowcaseCookie(request)]);
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
