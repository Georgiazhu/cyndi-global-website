// GET  /api/portal/dashboard/  — projects, orders, inventory from the real D1 database.
// POST /api/portal/dashboard/  — shortlist / mockup / order actions, written back to D1.
// Uses the same customer session as /api/me and /api/login (cookie: customer_session).
import { corsHeaders, json } from '../../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession } from '../../../_lib/customer-auth.js';
import { loadDashboard, mutateDashboard } from '../../../_lib/dashboard.js';

async function session(request, env) {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!env.DB) return { error: json({ error: 'Database binding is not configured' }, 503, cors) };
  const s = await readCustomerSession(request, env);
  if (!s.configured) return { error: json({ error: NOT_CONFIGURED_ERROR }, 503, cors) };
  if (!s.customer) return { error: json({ error: 'Not signed in' }, 401, cors) };
  return { customer: s.customer, cors };
}

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (s.error) return s.error;
  try {
    return json(await loadDashboard(env.DB, s.customer), 200, s.cors);
  } catch (e) {
    console.error('portal dashboard GET:', e?.message);
    return json({ error: 'Could not load dashboard data' }, 500, s.cors);
  }
}

export async function onRequestPost({ request, env }) {
  const s = await session(request, env);
  if (s.error) return s.error;
  const body = await request.json().catch(() => ({}));
  try {
    return json(await mutateDashboard(env.DB, s.customer, body), 200, s.cors);
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('portal dashboard POST:', e?.message);
    return json({ error: e?.message || 'Could not save change' }, status, s.cors);
  }
}
