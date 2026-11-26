// /api/portal/portals — client-side management of redemption portals.
//  GET  -> { portals, catalog, invites? }
//  POST -> { action, ... }
//     createPortal      { type, name, slug?, customTitle?, customDescription?, items? }
//     updatePortal      { portalId, name?, customTitle?, customDescription?, status?, items? }
//     deletePortal      { portalId }
//     setItems          { portalId, items:[{productId,maxQty}] }
//     importInvites     { portalId, invites:[{name,email}], dedupe? }
//     listInvites       { portalId }
//     getInviteTokens   { portalId }
//     markSent          { portalId, ids, status?, error? }
//     approveOrder      { orderNo, note? }
//     rejectOrder       { orderNo, note? }
//     pendingApprovals
// Uses the same customer session as /api/portal/dashboard/.
import { corsHeaders, json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession } from '../../_lib/customer-auth.js';
import {
  createPortal, listPortals, getPortal, updatePortal, setPortalItems,
  importInvites, listInvites, getInviteTokens, markInvitesSent,
  listPendingApprovals, reviewRedemptionOrder, shippingCountries,
} from '../../_lib/redemption.js';
import { ensureClientShowcaseSchema, getCustomerPool, filterByPool } from '../../_lib/client-showcase.js';
import { sendRedemptionInviteEmail } from '../../_lib/mailer.js';

const session = async (request, env) => {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!env.DB) return { error: json({ error: 'Database binding is not configured' }, 503, cors) };
  const s = await readCustomerSession(request, env);
  if (!s.configured) return { error: json({ error: NOT_CONFIGURED_ERROR }, 503, cors) };
  if (!s.customer) return { error: json({ error: 'Not signed in' }, 401, cors) };
  return { customer: s.customer, cors };
};

async function catalog(db, customerId) {
  try {
    await ensureClientShowcaseSchema(db);
    const c = await db.prepare('SELECT id,name FROM showcase_categories ORDER BY sort ASC,name ASC').all();
    const p = await db.prepare(`SELECT id,sku,name,image,pricing_json FROM showcase_products ORDER BY sort ASC,name ASC`).all();
    const names = new Map((c.results || []).map((x) => [x.id, x.name]));
    const list = (p.results || []).map((x) => {
      let price = 0;
      try { const a = JSON.parse(x.pricing_json || '[]'); if (a.length) price = Number(a[0].price) || 0; } catch {}
      return { id: String(x.id), sku: x.sku || String(x.id), name: x.name, image: x.image || '', price, category: names.get(x.category_id) || '' };
    });
    return filterByPool(list, await getCustomerPool(db, customerId));
  } catch (e) {
    console.error('portal portals catalog:', e?.message);
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (s.error) return s.error;
  try {
    const url = new URL(request.url);
    const portalId = url.searchParams.get('portalId') || '';
    const [portals, products, invites, pending, one] = await Promise.all([
      listPortals(env.DB, s.customer),
      catalog(env.DB, s.customer.id),
      portalId ? listInvites(env.DB, s.customer, portalId).catch(() => []) : Promise.resolve(null),
      listPendingApprovals(env.DB, String(s.customer.id)),
      portalId ? getPortal(env.DB, s.customer, portalId).catch(() => null) : Promise.resolve(null),
    ]);
    return json({
      portals, products, invites, portal: one, pending,
      countries: shippingCountries(),
    }, 200, s.cors);
  } catch (e) {
    console.error('portal portals GET:', e?.message);
    return json({ error: 'Could not load portals' }, 500, s.cors);
  }
}

export async function onRequestPost({ request, env }) {
  const s = await session(request, env);
  if (s.error) return s.error;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, s.cors); }
  const action = String(body?.action || '');
  const actor = s.customer.displayName || s.customer.email || 'client';
  try {
    let result;
    switch (action) {
      case 'createPortal':
        result = await createPortal(env.DB, s.customer, body, actor);
        break;
      case 'updatePortal':
        result = await updatePortal(env.DB, s.customer, body.portalId, body, actor);
        break;
      case 'deletePortal':
        result = await updatePortal(env.DB, s.customer, body.portalId, { status: 'ARCHIVED' }, actor);
        break;
      case 'setItems':
        result = await setPortalItems(env.DB, s.customer, body.portalId, body.items || [], actor);
        break;
      case 'importInvites':
        result = await importInvites(env.DB, s.customer, body.portalId, body.invites || [], actor, body.dedupe !== false);
        break;
      case 'listInvites':
        result = { invites: await listInvites(env.DB, s.customer, body.portalId) };
        break;
      case 'getInviteTokens':
        result = { invites: await getInviteTokens(env.DB, s.customer, body.portalId) };
        break;
      case 'markSent':
        result = await markInvitesSent(env.DB, s.customer, body.portalId, body.ids || [], body.status || 'SENT', body.error || '');
        break;
      case 'sendInvites': {
        const tokens = await getInviteTokens(env.DB, s.customer, body.portalId);
        const ids = Array.isArray(body.ids) && body.ids.length ? new Set(body.ids.map(String)) : null;
        const portal = await getPortal(env.DB, s.customer, body.portalId);
        const origin = new URL(request.url).origin;
        const linkFor = (token) => `${origin}/redeem/?token=${encodeURIComponent(token)}`;
        let sent = 0, failed = 0;
        for (const inv of tokens) {
          if (ids && !ids.has(inv.id)) continue;
          if (inv.redeemed) continue;
          const res = await sendRedemptionInviteEmail(env, inv.email, inv.name, linkFor(inv.token), portal.customTitle || portal.name);
          if (res.sent) {
            await markInvitesSent(env.DB, s.customer, body.portalId, [inv.id], 'SENT');
            sent++;
          } else {
            await markInvitesSent(env.DB, s.customer, body.portalId, [inv.id], 'FAILED', res.reason || '');
            failed++;
          }
        }
        result = { ok: true, sent, failed, reason: failed && !sent ? 'not_configured' : undefined };
        break;
      }
      case 'approveOrder':
        result = await reviewRedemptionOrder(env.DB, body.orderNo, 'APPROVE', actor, body.note || '');
        break;
      case 'rejectOrder':
        result = await reviewRedemptionOrder(env.DB, body.orderNo, 'REJECT', actor, body.note || '');
        break;
      case 'pendingApprovals':
        result = { pending: await listPendingApprovals(env.DB, String(s.customer.id)) };
        break;
      default:
        return json({ error: 'Unknown action' }, 400, s.cors);
    }
    return json(result, 200, s.cors);
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('portal portals POST:', action, e?.message);
    return json({ error: e?.message || 'Could not save change' }, status, s.cors);
  }
}
