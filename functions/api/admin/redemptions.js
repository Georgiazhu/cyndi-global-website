// /api/admin/redemptions — Cyndi admin oversight of all redemption portals.
//  GET  -> { portals, pending, countries }
//  POST -> { action, ... }
//     approveOrder  { orderNo, note? }
//     rejectOrder   { orderNo, note? }
//     setStatus     { portalId, status }
import { getAdminSecret, isAuthenticated, json, readSession } from '../../_lib/auth.js';
import {
  ensureRedemptionSchema, listPendingApprovals, listRedemptionOrders, reviewRedemptionOrder,
} from '../../_lib/redemption.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const reply = (data, status = 200) => json(data, status, NO_STORE);

async function gate(request, env) {
  if (!env.DB) return { error: reply({ error: 'Database binding is not configured' }, 503) };
  const secret = await getAdminSecret(env);
  if (!await isAuthenticated(request, secret)) return { error: reply({ error: 'Unauthorized' }, 401) };
  return {};
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env);
  if (g.error) return g.error;
  try {
    await ensureRedemptionSchema(env.DB);
    const portalsRes = await env.DB.prepare(`
      SELECT p.*, c.email AS customer_email, c.display_name AS customer_name,
        (SELECT COUNT(*) FROM redemption_invites i WHERE i.portal_id=p.id) AS invite_count,
        (SELECT COUNT(*) FROM redemption_invites i WHERE i.portal_id=p.id AND i.is_redeemed=1) AS redeemed_count,
        (SELECT COUNT(*) FROM orders o WHERE o.portal_id=p.id AND o.approval_status='PENDING') AS pending_count
      FROM redemption_portals p LEFT JOIN customers c ON CAST(c.id AS TEXT)=p.customer_id
      ORDER BY p.created_at DESC LIMIT 500`).all();
    const portals = (portalsRes.results || []).map((r) => ({
      id: r.id, name: r.name, type: r.type, slug: r.slug, status: r.status,
      customerEmail: r.customer_email || '', customerName: r.customer_name || '',
      customTitle: r.custom_title || '', customDescription: r.custom_description || '',
      created: String(r.created_at || '').slice(0, 10),
      inviteCount: Number(r.invite_count) || 0, redeemedCount: Number(r.redeemed_count) || 0,
      pendingCount: Number(r.pending_count) || 0,
    }));
    const [pending, orders] = await Promise.all([
      listPendingApprovals(env.DB),
      listRedemptionOrders(env.DB),
    ]);
    return reply({ portals, pending, orders });
  } catch (e) {
    console.error('admin redemptions GET:', e?.message);
    return reply({ error: 'Could not load redemption portals' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env);
  if (g.error) return g.error;
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON body' }, 400); }
  const secret = await getAdminSecret(env);
  const actor = (await readSession(request, secret))?.username || 'admin';
  try {
    let result;
    switch (String(body?.action || '')) {
      case 'approveOrder':
        result = await reviewRedemptionOrder(env.DB, body.orderNo, 'APPROVE', actor, body.note || '', { role: 'admin' });
        break;
      case 'rejectOrder':
        result = await reviewRedemptionOrder(env.DB, body.orderNo, 'REJECT', actor, body.note || '', { role: 'admin' });
        break;
      case 'setStatus': {
        const status = String(body.status || '').toUpperCase();
        if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
          return reply({ error: 'Invalid status' }, 400);
        }
        await ensureRedemptionSchema(env.DB);
        const res = await env.DB.prepare('UPDATE redemption_portals SET status=?2, updated_at=?3 WHERE id=?1')
          .bind(body.portalId, status, new Date().toISOString()).run();
        if (!res?.meta?.changes && !res?.success) return reply({ error: 'Portal not found' }, 404);
        result = { ok: true, status };
        break;
      }
      default:
        return reply({ error: 'Unknown action' }, 400);
    }
    return reply(result);
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('admin redemptions POST:', e?.message);
    return reply({ error: e?.message || 'Could not save change' }, status);
  }
}
