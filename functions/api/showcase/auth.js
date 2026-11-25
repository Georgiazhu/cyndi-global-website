import { json } from '../../_lib/auth.js';
import {
  NOT_CONFIGURED_ERROR,
  authenticateCustomer,
  clearCookie,
  clearLegacyShowcaseCookie,
  createCustomerSession,
  customerSessionsConfigured,
  jsonWithCookies,
  publicUser,
  readCustomerSession,
  sessionCookie,
} from '../../_lib/customer-auth.js';

/**
 * /api/showcase/auth — Showcase sign-in, backed by the same customer accounts as the Portal.
 *  POST   { username | email | identifier, password } -> same login as /api/login.
 *  GET    -> { authenticated, user:{username,email,displayName}, showcaseAccess }
 *  DELETE -> clears the customer cookie (and the legacy showcase_gate_session cookie).
 *
 * Any signed-in Portal user can view the showcase, so no extra showcase-only password
 * or showcase_access flag is required here.
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
    showcaseAccess: true,
  }, 200, PRIVATE);
}

export async function onRequestDelete({ request }) {
  return jsonWithCookies({ ok: true }, 200, PRIVATE, [clearCookie(request), clearLegacyShowcaseCookie(request)]);
}
