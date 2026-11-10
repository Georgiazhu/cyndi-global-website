import { json } from '../../_lib/auth.js';
import {
  NOT_CONFIGURED_ERROR,
  authenticateCustomer,
  clearCookie,
  clearLegacyShowcaseCookie,
  createCustomerSession,
  customerSessionsConfigured,
  hasShowcaseAccess,
  jsonWithCookies,
  publicUser,
  readCustomerSession,
  sessionCookie,
} from '../../_lib/customer-auth.js';
import { NO_SHOWCASE_ACCESS } from './auth-lib.js';

/**
 * /api/showcase/auth — Showcase sign-in, backed by the shop's customer accounts.
 *  POST   { username | email | identifier, password } -> same login as /api/login, plus
 *         showcase access is required. Sets the customer_session cookie.
 *  GET    -> { authenticated, user:{username,email,displayName}, showcaseAccess }
 *  DELETE -> clears the customer cookie (and the legacy showcase_gate_session cookie).
 */

const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, PRIVATE);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, PRIVATE);

  const body = await request.json().catch(() => ({}));
  const identifier = String((body && (body.identifier || body.username || body.email)) || '').trim();
  const password = body && typeof body.password === 'string' ? body.password : '';

  const result = await authenticateCustomer(env, identifier, password);
  // Wrong credentials (whether or not the account exists) always look the same.
  if (result.status === 'invalid') return json({ error: 'Incorrect email/username or password' }, 401, PRIVATE);
  if (result.status === 'disabled') return json({ error: 'Account is disabled' }, 403, PRIVATE);
  // Correct credentials but no access: say so, and do not sign the user in.
  if (!hasShowcaseAccess(result.customer)) {
    return json({ error: NO_SHOWCASE_ACCESS, showcaseAccess: false }, 403, PRIVATE);
  }

  const token = await createCustomerSession(env, result.customer.id);
  return jsonWithCookies(
    { ok: true, user: publicUser(result.customer), showcaseAccess: true },
    200,
    PRIVATE,
    [sessionCookie(token, request), clearLegacyShowcaseCookie(request)]
  );
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ authenticated: false, error: 'Database binding is not configured' }, 503, PRIVATE);
  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ authenticated: false, error: NOT_CONFIGURED_ERROR }, 503, PRIVATE);
  if (!session.customer) return json({ authenticated: false, showcaseAccess: false }, 200, PRIVATE);
  return json({
    authenticated: true,
    user: publicUser(session.customer),
    showcaseAccess: hasShowcaseAccess(session.customer),
  }, 200, PRIVATE);
}

export async function onRequestDelete({ request }) {
  return jsonWithCookies({ ok: true }, 200, PRIVATE, [clearCookie(request), clearLegacyShowcaseCookie(request)]);
}
