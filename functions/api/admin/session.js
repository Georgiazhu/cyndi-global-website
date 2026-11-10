import { getAdminSecret, json, readSession } from '../../_lib/auth.js';

/**
 * GET /api/admin/session — lightweight admin session probe used by
 * /admin/admin-auth.js (shared login for every admin page and tab).
 *
 *   200 { authenticated: true, username }   valid admin session cookie
 *   401 { authenticated: false }            no / invalid / expired session
 *
 * 401 (not 200) is deliberate: it matches every other /api/admin/* endpoint,
 * so the client rule "401 = needs sign-in, anything else non-2xx = service
 * error" is the same for the probe and for feature APIs.
 *
 * Validation is exactly the one the other admin endpoints use
 * (readSession, aud:'admin', HMAC, expiry; isAuthenticated() is a wrapper
 * around it). Nothing beyond the username is returned. No parameters,
 * no CORS (same-origin only), never cached.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, await getAdminSecret(env));
  if (!session) return json({ authenticated: false }, 401, NO_STORE);
  return json({ authenticated: true, username: String(session.username || 'admin') }, 200, NO_STORE);
}
