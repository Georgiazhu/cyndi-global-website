import { json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession } from '../../_lib/customer-auth.js';

/**
 * Showcase access gate.
 *
 * The Showcase shares the Portal account system (customers table + customer_session
 * cookie). Since the showcase is now a tab inside the signed-in dashboard, any valid
 * Portal sign-in is enough — there is no separate showcase password and no second
 * login. The legacy showcase_access flag is still used for role display, but it no
 * longer gates access to the product proposals.
 */

const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

/**
 * Returns { customer } when the request may use the Showcase, otherwise { response }
 * with 503 (sessions not configured) or 401 (not signed in).
 */
export async function requireShowcaseCustomer(request, env) {
  const session = await readCustomerSession(request, env);
  if (!session.configured) return { response: json({ error: NOT_CONFIGURED_ERROR }, 503, PRIVATE) };
  if (!session.customer) return { response: json({ error: 'Unauthorized', authenticated: false }, 401, PRIVATE) };
  return { customer: session.customer };
}
