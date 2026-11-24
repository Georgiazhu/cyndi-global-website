// GET  /api/portal/dashboard/  — projects, orders, inventory from the real D1 database.
// POST /api/portal/dashboard/  — shortlist / mockup / order actions, written back to D1.
// Both routes require the same customer session used by /api/me and /api/login.
import { getAuthenticatedUser, json } from '../../../_lib/auth.js';
import { loadDashboard, mutateDashboard } from '../../../_lib/dashboard.js';

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503, noStore);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401, noStore);
  try {
    const data = await loadDashboard(env.DB, user);
    return json(data, 200, noStore);
  } catch (e) {
    console.error('portal dashboard GET:', e?.message);
    return json({ error: 'Could not load dashboard data' }, 500, noStore);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database is not configured' }, 503, noStore);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401, noStore);
  const body = await request.json().catch(() => ({}));
  try {
    const result = await mutateDashboard(env.DB, user, body);
    return json(result, 200, noStore);
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('portal dashboard POST:', e?.message);
    return json({ error: e?.message || 'Could not save change' }, status, noStore);
  }
}
