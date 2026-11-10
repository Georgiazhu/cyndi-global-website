import { json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, hasShowcaseAccess, readCustomerSession } from '../../_lib/customer-auth.js';

/**
 * Showcase access gate.
 *
 * The Showcase no longer has its own account system: it uses the shop's customer accounts
 * (customers table + customer_session cookie, functions/_lib/customer-auth.js).
 * A request may use the Showcase when:
 *  - it carries a valid customer session for an active customer,
 *  - that customer has showcase_access = 1, and
 *  - if the customer belongs to a client, the client is active.
 *
 * The old showcase_users table is only read once per user by the lazy migration in
 * customer-auth.js; the old showcase_gate_session cookie is no longer issued or accepted.
 */

export const NO_SHOWCASE_ACCESS = 'This account does not have Showcase access';

const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

/**
 * Returns { customer } when the request may use the Showcase, otherwise { response }
 * with 503 (sessions not configured), 401 (not signed in) or 403 (signed in, no access).
 */
export async function requireShowcaseCustomer(request, env) {
  const session = await readCustomerSession(request, env);
  if (!session.configured) return { response: json({ error: NOT_CONFIGURED_ERROR }, 503, PRIVATE) };
  if (!session.customer) return { response: json({ error: 'Unauthorized', authenticated: false }, 401, PRIVATE) };
  if (!hasShowcaseAccess(session.customer)) {
    return { response: json({ error: NO_SHOWCASE_ACCESS, authenticated: true, showcaseAccess: false }, 403, PRIVATE) };
  }
  return { customer: session.customer };
}
