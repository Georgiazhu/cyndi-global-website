// Delivery-channel rules shared by the portal dashboard, admin orders and redemption API.
//
// M1 / M2 are COMPANY orders: the client (or Cyndi) creates them from a project,
// so they skip recipient approval and go straight to production/dispatch.
// M3 / M4 are INDIVIDUAL orders: a recipient submits them through a personal link
// or an open portal, so they wait for the client organisation's approval before
// Cyndi is allowed to dispatch. Permissions and execution actions differ by group.
//
// The database columns are added defensively at runtime (same pattern as the
// other D1 libs) so existing installs migrate on first request.

export const CHANNELS = {
  M1: {
    code: 'M1', label: 'Bulk shipment', sourceType: 'INTERNAL_TEAM',
    origin: 'COMPANY', approval: 'NOT_REQUIRED',
  },
  M2: {
    code: 'M2', label: 'Employee rewards store', sourceType: 'REWARDS_STORE',
    origin: 'COMPANY', approval: 'NOT_REQUIRED',
  },
  M3: {
    code: 'M3', label: 'Personal link', sourceType: 'PERSONAL_LINK',
    // Named recipient links are issued by the client, so submission is pre-approved.
    origin: 'INDIVIDUAL', approval: 'NOT_REQUIRED',
  },
  M4: {
    code: 'M4', label: 'Open portal', sourceType: 'OPEN_PORTAL',
    origin: 'INDIVIDUAL', approval: 'PENDING',
  },
};

export const COMPANY_CHANNELS = ['M1', 'M2'];
export const PERSONAL_CHANNELS = ['M3', 'M4'];

export function normalizeChannel(value, fallback = 'M1') {
  const code = String(value || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(CHANNELS, code) ? code : fallback;
}

export function channelForSource(sourceType) {
  const s = String(sourceType || '').toUpperCase();
  const found = Object.values(CHANNELS).find((c) => c.sourceType === s);
  return found?.code || 'M1';
}

export function isPersonalChannel(channel) {
  return PERSONAL_CHANNELS.includes(normalizeChannel(channel));
}

export function channelLabel(channel) {
  const c = CHANNELS[normalizeChannel(channel)];
  return c ? `${c.code} · ${c.label}` : channel;
}

/**
 * Purchase orders replenish stock; requisitions draw it down.
 * Any order created through a redemption portal carries portal_id / source_type,
 * so it is a requisition even when its channel is M2 (company rewards store).
 * Legacy project orders have neither field and stay purchase orders.
 */
export function orderKind(order) {
  const portalId = order?.portalId ?? order?.portal_id;
  if (portalId) return 'REQUISITION';
  const source = String(order?.sourceType ?? order?.source_type ?? '').toUpperCase();
  if (['REWARDS_STORE', 'PERSONAL_LINK', 'OPEN_PORTAL'].includes(source)) return 'REQUISITION';
  return 'PURCHASE_ORDER';
}

// Who may approve a pending order. Company orders never reach this queue;
// individual orders may be approved by the client organisation's portal admin
// or by Cyndi admin. The recipient themselves never gets an approval button.
export function canReviewOrder(order, role) {
  if (!isPersonalChannel(order?.orderChannel || order?.channel)) return false;
  if (String(order?.approvalStatus || order?.approval_status || '').toUpperCase() !== 'PENDING') return false;
  return role === 'client' || role === 'admin';
}

// Admin status transitions. Personal orders cannot be touched before approval,
// and once approved they only move forward (dispatch → delivery) or cancel.
export function allowedNextStatuses(order) {
  const s = String(order?.status || '');
  if (!isPersonalChannel(order?.orderChannel || order?.channel)) return null; // use legacy enum
  const approval = String(order?.approvalStatus || order?.approval_status || '').toUpperCase();
  if (approval === 'PENDING') return ['cancelled'];
  if (approval === 'REJECTED') return [];
  // Named personal links (M3) are pre-approved; open portal (M4) needs explicit approval.
  if (!['APPROVED', 'NOT_REQUIRED'].includes(approval)) return [];
  if (s === 'processing') return ['shipped', 'cancelled'];
  if (s === 'shipped') return ['in_transit', 'delivered', 'cancelled'];
  if (s === 'in_transit') return ['delivered', 'cancelled'];
  return [];
}

const schemaByDb = new WeakMap();

export async function ensureOrderChannelSchema(db) {
  let promise = schemaByDb.get(db);
  if (!promise) {
    promise = (async () => {
      const columns = [
        "ALTER TABLE orders ADD COLUMN source_type TEXT NOT NULL DEFAULT 'INTERNAL_TEAM'",
        "ALTER TABLE orders ADD COLUMN order_channel TEXT NOT NULL DEFAULT 'M1'",
        "ALTER TABLE orders ADD COLUMN origin_type TEXT NOT NULL DEFAULT 'COMPANY'",
        "ALTER TABLE orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'",
        "ALTER TABLE orders ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'READY_FOR_DISPATCH'",
      ];
      for (const sql of columns) {
        try { await db.prepare(sql).run(); } catch (e) {
          if (!/duplicate column|already exists/i.test(e?.message || '')) {
            console.error('order channels schema:', e?.message);
          }
        }
      }
      // Backfill legacy rows by their source. New rows set both columns explicitly.
      for (const c of Object.values(CHANNELS)) {
        try {
          await db.prepare(`UPDATE orders SET order_channel=?1, origin_type=?2
            WHERE source_type=?3 AND order_channel='M1'`).bind(c.code, c.origin, c.sourceType).run();
        } catch { /* orders.source_type may not exist yet on very old installs */ }
      }
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(order_channel, status)').run();
      } catch {}
    })().catch((e) => { schemaByDb.delete(db); throw e; });
    schemaByDb.set(db, promise);
  }
  return promise;
}
