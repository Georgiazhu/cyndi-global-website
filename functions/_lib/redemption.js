// Redemption portals data layer — M3 Personal links and M4 Open portal.
// Implements the HRT 外部礼品兑换门户 spec: shared portal engine, per-recipient
// high-entropy tokens for personal links, public slug for the open portal,
// atomic stock reserve on submit, rollback on reject/cancel, and admin approval.
//
// Runtime self-migration (same pattern as dashboard.js / inventory.js): tables and
// order columns are created defensively on first use, so no manual D1 step is needed.

import {
  INV_ORDER_NO_ATTEMPTS,
  invClassifyError,
  invLoadForProducts,
  invResolveOrderLines,
  invReserveStatements,
  invTransitionStatements,
} from './inventory.js';
import {
  CHANNELS, ensureOrderChannelSchema, normalizeChannel, canReviewOrder,
} from './order-channels.js';

export const PORTAL_TYPES = ['BULK_SHIPMENT', 'REWARDS_STORE', 'PERSONAL_LINK', 'OPEN_PORTAL'];
export const PORTAL_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'];
export const ORDER_SOURCES = ['INTERNAL_TEAM', 'REWARDS_STORE', 'PERSONAL_LINK', 'OPEN_PORTAL'];
export const APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'];
export const FULFILMENT_STATUSES = ['READY_FOR_DISPATCH', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'REJECTED'];

const now = () => new Date().toISOString();
const day = (v) => String(v || '').slice(0, 10);
const int = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const parseJson = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch { return fallback; }
};
const arrayOf = (v) => (Array.isArray(v) ? v : []);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ISO 3166-1 alpha-2 whitelist used by the public address form. Kept as a flat
// list in code (no external dependency) — the public API exposes GET countries.
const COUNTRIES = [
  ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Belgium'], ['BR', 'Brazil'],
  ['CA', 'Canada'], ['CL', 'Chile'], ['CN', 'China'], ['CO', 'Colombia'],
  ['CZ', 'Czechia'], ['DK', 'Denmark'], ['EG', 'Egypt'], ['FI', 'Finland'],
  ['FR', 'France'], ['DE', 'Germany'], ['GR', 'Greece'], ['HK', 'Hong Kong, China'],
  ['HU', 'Hungary'], ['IN', 'India'], ['ID', 'Indonesia'], ['IE', 'Ireland'],
  ['IL', 'Israel'], ['IT', 'Italy'], ['JP', 'Japan'], ['KE', 'Kenya'],
  ['KR', 'South Korea'], ['MY', 'Malaysia'], ['MX', 'Mexico'], ['NL', 'Netherlands'],
  ['NZ', 'New Zealand'], ['NG', 'Nigeria'], ['NO', 'Norway'], ['PH', 'Philippines'],
  ['PL', 'Poland'], ['PT', 'Portugal'], ['QA', 'Qatar'], ['SA', 'Saudi Arabia'],
  ['SG', 'Singapore'], ['ZA', 'South Africa'], ['ES', 'Spain'], ['SE', 'Sweden'],
  ['CH', 'Switzerland'], ['TW', 'Taiwan, China'], ['TH', 'Thailand'], ['TR', 'Türkiye'],
  ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['VN', 'Vietnam'],
];
export function shippingCountries() {
  return COUNTRIES.map(([code, name]) => ({ code, name }));
}

// Per-binding cache so multiple DBs (tests, previews) each migrate themselves.
const schemaByDb = new WeakMap();
export async function ensureRedemptionSchema(db) {
  let schemaPromise = schemaByDb.get(db);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS redemption_portals (
        id             TEXT PRIMARY KEY,
        customer_id    TEXT NOT NULL,
        name           TEXT NOT NULL,
        type           TEXT NOT NULL,
        slug           TEXT,
        status         TEXT NOT NULL DEFAULT 'ACTIVE',
        custom_title   TEXT NOT NULL DEFAULT '',
        custom_description TEXT NOT NULL DEFAULT '',
        created_by     TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      )`).run();
      await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_portals_slug
        ON redemption_portals(slug) WHERE slug IS NOT NULL`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_redemption_portals_customer
        ON redemption_portals(customer_id, created_at DESC)`).run();

      await db.prepare(`CREATE TABLE IF NOT EXISTS redemption_portal_items (
        portal_id    TEXT NOT NULL,
        product_id   TEXT NOT NULL,
        max_qty_per_order INTEGER,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (portal_id, product_id)
      )`).run();

      await db.prepare(`CREATE TABLE IF NOT EXISTS redemption_invites (
        id             TEXT PRIMARY KEY,
        portal_id      TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        token          TEXT NOT NULL UNIQUE,
        email_status   TEXT NOT NULL DEFAULT 'PENDING',
        email_sent_at  TEXT,
        email_error    TEXT,
        is_redeemed    INTEGER NOT NULL DEFAULT 0,
        redeemed_at    TEXT,
        order_id       TEXT,
        created_at     TEXT NOT NULL
      )`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_redemption_invites_portal
        ON redemption_invites(portal_id, id DESC)`).run();

      // orders extensions. ALTER TABLE ADD COLUMN cannot use IF NOT EXISTS — swallow duplicates.
      const orderCols = [
        "ALTER TABLE orders ADD COLUMN source_type TEXT NOT NULL DEFAULT 'INTERNAL_TEAM'",
        'ALTER TABLE orders ADD COLUMN portal_id TEXT',
        'ALTER TABLE orders ADD COLUMN invite_id TEXT',
        "ALTER TABLE orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'",
        "ALTER TABLE orders ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'READY_FOR_DISPATCH'",
        'ALTER TABLE orders ADD COLUMN reviewed_by TEXT',
        'ALTER TABLE orders ADD COLUMN reviewed_at TEXT',
        'ALTER TABLE orders ADD COLUMN review_note TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_name TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_email TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_phone TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_country_code TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_state TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_city TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_postal_code TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_address_line1 TEXT',
        'ALTER TABLE orders ADD COLUMN shipping_address_line2 TEXT',
      ];
      for (const sql of orderCols) {
        try { await db.prepare(sql).run(); } catch (e) {
          if (!/duplicate column|already exists/i.test(e?.message || '')) {
            console.error('redemption schema (orders):', e?.message);
          }
        }
      }
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source_type, status)").run().catch(() => {});
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_portal ON orders(portal_id, created_at DESC)").run().catch(() => {});
      await ensureOrderChannelSchema(db);

      // In-memory rate limits reset on isolate restart; adequate for a shared link
      // where the goal is to stop accidental / casual double submission bursts.
    })().catch((e) => { schemaByDb.delete(db); throw e; });
    schemaByDb.set(db, schemaPromise);
  }
  return schemaPromise;
}

const rateBuckets = new Map();
function rateLimited(key, limit, windowMs) {
  const ts = Date.now();
  const list = (rateBuckets.get(key) || []).filter((t) => ts - t < windowMs);
  if (list.length >= limit) { rateBuckets.set(key, list); return true; }
  list.push(ts);
  rateBuckets.set(key, list);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (!v.length || ts - v[v.length - 1] > windowMs) rateBuckets.delete(k);
  }
  return false;
}

function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return prefix + hex.slice(0, 24);
}
// 32 bytes = 256 bits of entropy (spec: >= 128 bit).
function inviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function shapePortal(r, counts = {}) {
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name || '',
    type: r.type || 'PERSONAL_LINK',
    slug: r.slug || '',
    status: r.status || 'ACTIVE',
    customTitle: r.custom_title || '',
    customDescription: r.custom_description || '',
    createdBy: r.created_by || '',
    created: day(r.created_at),
    updated: day(r.updated_at),
    inviteCount: int(counts.invite_count, 0),
    redeemedCount: int(counts.redeemed_count, 0),
    pendingCount: int(counts.pending_count, 0),
  };
}

// ---------------- Customer-side portal management ----------------

export async function createPortal(db, customer, data, actor) {
  await ensureRedemptionSchema(db);
  const type = text(data?.type, 24).toUpperCase();
  if (!PORTAL_TYPES.includes(type)) throw Object.assign(new Error('Unknown portal type'), { status: 400 });
  const name = text(data?.name, 120) || `${type.replace(/_/g, ' ')} Portal`;
  const customerId = String(customer?.id ?? '');
  let slug = slugify(data?.slug || name) || `portal-${randomId('').slice(0, 8)}`;
  // Ensure uniqueness by suffixing when taken.
  for (let i = 0; i < 8; i++) {
    const existing = await db.prepare('SELECT id FROM redemption_portals WHERE slug = ?1').bind(slug).first();
    if (!existing) break;
    slug = `${slugify(name) || 'portal'}-${randomId('').slice(0, 4 + i)}`;
  }
  const id = randomId('PT-');
  const ts = now();
  await db.prepare(`INSERT INTO redemption_portals
    (id,customer_id,name,type,slug,status,custom_title,custom_description,created_by,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,'ACTIVE',?6,?7,?8,?9,?9)`).bind(
    id, customerId, name, type, slug,
    text(data?.customTitle, 200) || name,
    text(data?.customDescription, 1000),
    actor || customer?.email || 'client', ts
  ).run();

  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length) await setPortalItems(db, customer, id, items, actor);

  return { ok: true, portalId: id, slug, type };
}

export async function listPortals(db, customer) {
  await ensureRedemptionSchema(db);
  const customerId = String(customer?.id ?? '');
  const res = await db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM redemption_invites i WHERE i.portal_id = p.id) AS invite_count,
      (SELECT COUNT(*) FROM redemption_invites i WHERE i.portal_id = p.id AND i.is_redeemed = 1) AS redeemed_count,
      (SELECT COUNT(*) FROM orders o WHERE o.portal_id = p.id AND o.approval_status = 'PENDING') AS pending_count
    FROM redemption_portals p WHERE p.customer_id = ?1 ORDER BY p.created_at DESC`).bind(customerId).all();
  return (res.results || []).map((r) => shapePortal(r, r));
}

export async function getPortal(db, customer, portalId) {
  await ensureRedemptionSchema(db);
  const r = await db.prepare(
    'SELECT * FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!r) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const items = await db.prepare(
    'SELECT product_id, max_qty_per_order, sort_order FROM redemption_portal_items WHERE portal_id = ?1 ORDER BY sort_order ASC'
  ).bind(portalId).all();
  return { ...shapePortal(r), items: (items.results || []).map((it) => ({
    productId: it.product_id,
    maxQty: it.max_qty_per_order,
    sortOrder: int(it.sort_order, 0),
  })) };
}

export async function updatePortal(db, customer, portalId, data, actor) {
  await ensureRedemptionSchema(db);
  const current = await db.prepare(
    'SELECT * FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!current) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const sets = [], binds = [];
  for (const [key, col, max] of [
    ['name', 'name', 120], ['customTitle', 'custom_title', 200], ['customDescription', 'custom_description', 1000],
  ]) {
    if (data?.[key] !== undefined) {
      const v = text(data[key], max);
      if (v) { sets.push(`${col}=?`); binds.push(v); }
    }
  }
  if (data?.status !== undefined && PORTAL_STATUSES.includes(text(data.status, 20).toUpperCase())) {
    sets.push('status=?'); binds.push(text(data.status, 20).toUpperCase());
  }
  sets.push('updated_at=?'); binds.push(now());
  binds.push(portalId, String(customer?.id ?? ''));
  await db.prepare(`UPDATE redemption_portals SET ${sets.join(',')} WHERE id=? AND customer_id=?`).bind(...binds).run();
  if (Array.isArray(data?.items)) await setPortalItems(db, customer, portalId, data.items, actor);
  return { ok: true };
}

export async function setPortalItems(db, customer, portalId, items, actor) {
  await ensureRedemptionSchema(db);
  const portal = await db.prepare(
    'SELECT id FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!portal) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const allowed = new Set();
  const rows = await db.prepare('SELECT id FROM showcase_products').all();
  for (const r of rows.results || []) allowed.add(String(r.id));
  const list = items.slice(0, 200).map((it, i) => {
    const productId = String(it?.productId || it?.id || '').trim().slice(0, 80);
    if (!productId || !allowed.has(productId)) {
      throw Object.assign(new Error(`Product ${productId || '(empty)'} is not in the catalogue`), { status: 400 });
    }
    const rawMax = it?.maxQty;
    let maxQty = null;
    if (rawMax !== null && rawMax !== undefined && String(rawMax).trim() !== '') {
      maxQty = Math.max(1, Math.min(10000, int(rawMax, 1)));
    }
    return { productId, maxQty, sortOrder: i };
  });
  await db.prepare('DELETE FROM redemption_portal_items WHERE portal_id = ?1').bind(portalId).run();
  for (const it of list) {
    await db.prepare(`INSERT OR REPLACE INTO redemption_portal_items
      (portal_id,product_id,max_qty_per_order,sort_order) VALUES (?1,?2,?3,?4)`).bind(
      portalId, it.productId, it.maxQty, it.sortOrder
    ).run();
  }
  return { ok: true, count: list.length };
}

export async function importInvites(db, customer, portalId, invites, actor, dedupe = true) {
  await ensureRedemptionSchema(db);
  const portal = await db.prepare(
    'SELECT id,type FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!portal) throw Object.assign(new Error('Portal not found'), { status: 404 });
  if (portal.type !== 'PERSONAL_LINK') throw Object.assign(new Error('Invites are only for Personal links'), { status: 409 });
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const list = Array.isArray(invites) ? invites : [];
  if (!list.length) throw Object.assign(new Error('No recipients provided'), { status: 400 });
  if (list.length > 1000) throw Object.assign(new Error('Maximum 1000 recipients per import'), { status: 400 });
  let existingEmails = new Set();
  if (dedupe) {
    const rows = await db.prepare('SELECT recipient_email FROM redemption_invites WHERE portal_id = ?1').bind(portalId).all();
    existingEmails = new Set((rows.results || []).map((r) => String(r.recipient_email || '').toLowerCase()));
  }
  let added = 0, skipped = 0;
  for (const inv of list) {
    const email = text(inv?.email ?? inv?.recipientEmail, 254).toLowerCase();
    const name = text(inv?.name ?? inv?.recipientName, 120);
    if (!EMAIL_RE.test(email) || !name) { skipped++; continue; }
    if (dedupe && existingEmails.has(email)) { skipped++; continue; }
    existingEmails.add(email);
    await db.prepare(`INSERT INTO redemption_invites
      (id,portal_id,recipient_name,recipient_email,token,email_status,created_at)
      VALUES (?1,?2,?3,?4,?5,'PENDING',?6)`).bind(
      randomId('IN-'), portalId, name, email, inviteToken(), now()
    ).run();
    added++;
  }
  return { ok: true, added, skipped };
}

export async function listInvites(db, customer, portalId) {
  await ensureRedemptionSchema(db);
  const portal = await db.prepare(
    'SELECT id FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!portal) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const res = await db.prepare(`
    SELECT id,recipient_name,recipient_email,email_status,email_sent_at,email_error,
           is_redeemed,redeemed_at,order_id,created_at
    FROM redemption_invites WHERE portal_id = ?1 ORDER BY id DESC LIMIT 500`).bind(portalId).all();
  return (res.results || []).map((r) => ({
    id: r.id, name: r.recipient_name, email: r.recipient_email,
    emailStatus: r.email_status, emailSentAt: r.email_sent_at, emailError: r.email_error || '',
    redeemed: Number(r.is_redeemed) === 1, redeemedAt: r.redeemed_at, orderId: r.order_id || '',
    created: day(r.created_at),
  }));
}

export async function markInvitesSent(db, customer, portalId, ids, status = 'SENT', error = '') {
  await ensureRedemptionSchema(db);
  const portal = await db.prepare(
    'SELECT id FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!portal) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const list = Array.isArray(ids) ? ids.slice(0, 1000) : [];
  let updated = 0;
  for (const id of list) {
    const res = await db.prepare(`UPDATE redemption_invites
      SET email_status=?2, email_sent_at=?3, email_error=?4
      WHERE id=?1 AND portal_id=?5`).bind(
      String(id), status, status === 'SENT' ? now() : null, text(error, 300), portalId
    ).run();
    updated += int(res?.meta?.changes, 0);
  }
  return { ok: true, updated };
}

export async function getInviteTokens(db, customer, portalId) {
  await ensureRedemptionSchema(db);
  const portal = await db.prepare(
    'SELECT id FROM redemption_portals WHERE id = ?1 AND customer_id = ?2'
  ).bind(portalId, String(customer?.id ?? '')).first();
  if (!portal) throw Object.assign(new Error('Portal not found'), { status: 404 });
  const res = await db.prepare(
    'SELECT id,recipient_name,recipient_email,token,is_redeemed FROM redemption_invites WHERE portal_id = ?1 ORDER BY id DESC LIMIT 1000'
  ).bind(portalId).all();
  return (res.results || []).map((r) => ({
    id: r.id, name: r.recipient_name, email: r.recipient_email, token: r.token,
    redeemed: Number(r.is_redeemed) === 1,
  }));
}

// ---------------- Public redemption (no login) ----------------

async function portalItems(db, portalId) {
  const res = await db.prepare(`
    SELECT p.id, p.sku, p.name, p.image, p.colors_json, p.sizes_json, p.pricing_json,
           i.max_qty_per_order, i.sort_order
    FROM redemption_portal_items i JOIN showcase_products p ON p.id = i.product_id
    WHERE i.portal_id = ?1 ORDER BY i.sort_order ASC`).bind(portalId).all();
  return res.results || [];
}

function tierUnitPrice(pricing, quantity) {
  const tiers = (Array.isArray(pricing) ? pricing : [])
    .filter((t) => t && Number.isFinite(Number(t.quantity)) && Number.isFinite(Number(t.price)))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  if (!tiers.length) return 0;
  let price = Number(tiers[0].price);
  for (const t of tiers) if (quantity >= Number(t.quantity)) price = Number(t.price);
  return round2(price);
}

function publicProduct(r, stockRows) {
  const parse = (raw) => { try { return JSON.parse(raw || '[]'); } catch { return []; } };
  const colors = arrayOf(parse(r.colors_json));
  const sizes = arrayOf(parse(r.sizes_json)).filter((s) => typeof s === 'string');
  const byVariant = new Map();
  for (const s of stockRows) if (s.product_id === r.id) byVariant.set(JSON.stringify([s.color_id, s.size]), s);
  const variants = [];
  for (const c of colors.length ? colors : [null]) {
    const colorId = c && typeof c.id === 'string' ? c.id : '';
    for (const size of sizes.length ? sizes : ['']) {
      const row = byVariant.get(JSON.stringify([colorId, size]));
      variants.push({
        colorId, colorName: c?.name || '', colorHex: c?.hex || '',
        size: size || 'OS',
        available: row ? int(row.available, 0) : null, // null = untracked / unlimited
      });
    }
  }
  const tiers = arrayOf(parse(r.pricing_json));
  return {
    id: String(r.id), sku: r.sku || String(r.id), name: r.name || 'Product',
    image: r.image || '', colors, sizes, tiers, variants,
    maxQty: r.max_qty_per_order === null || r.max_qty_per_order === undefined ? null : int(r.max_qty_per_order, 1),
  };
}

async function loadPublicPortal(db, { token, slug }) {
  await ensureRedemptionSchema(db);
  let invite = null, portal;
  if (token) {
    invite = await db.prepare('SELECT * FROM redemption_invites WHERE token = ?1').bind(token).first();
    if (!invite) throw Object.assign(new Error('This link is invalid'), { status: 404 });
    portal = await db.prepare('SELECT * FROM redemption_portals WHERE id = ?1').bind(invite.portal_id).first();
  } else {
    portal = await db.prepare(
      "SELECT * FROM redemption_portals WHERE slug = ?1 AND type IN ('OPEN_PORTAL','BULK_SHIPMENT','REWARDS_STORE')"
    ).bind(slug).first();
  }
  if (!portal) throw Object.assign(new Error('This portal is not available'), { status: 404 });
  if (portal.status !== 'ACTIVE') throw Object.assign(new Error('This portal is currently paused'), { status: 410 });
  return { portal, invite };
}

export async function getPublicRedemption(db, { token, slug }) {
  const { portal, invite } = await loadPublicPortal(db, { token, slug });
  if (invite && Number(invite.is_redeemed) === 1) {
    // Privacy: redeemed links only return a redacted status, never the address.
    return {
      portal: { title: portal.custom_title || portal.name, description: portal.custom_description || '', type: portal.type },
      redeemed: true,
      orderId: invite.order_id || '',
      recipientName: invite.recipient_name || '',
    };
  }
  const items = await portalItems(db, portal.id);
  const ids = items.map((r) => String(r.id));
  let stockRows = [];
  try { stockRows = await invLoadForProducts(db, ids); } catch {}
  return {
    portal: {
      title: portal.custom_title || portal.name,
      description: portal.custom_description || '',
      type: portal.type,
      slug: portal.slug || '',
    },
    redeemed: false,
    recipient: invite ? { name: invite.recipient_name, email: invite.recipient_email } : null,
    products: items.map((r) => publicProduct(r, stockRows)),
  };
}

export async function getPortalBySlugForShowcase(db, slug) {
  const p = await db.prepare(
    "SELECT * FROM redemption_portals WHERE slug = ?1 AND status = 'ACTIVE'"
  ).bind(slug).first();
  return p ? shapePortal(p) : null;
}

function nextOrderNo(db) {
  return (async () => {
    const rows = await db.prepare("SELECT order_no FROM orders WHERE source_type IN ('PERSONAL_LINK','OPEN_PORTAL')").all();
    let max = 0;
    for (const r of rows.results || []) {
      const m = /^RDM-(?:PL-|OP-)?(\d+)$/.exec(String(r.order_no || ''));
      if (m) max = Math.max(max, int(m[1], 0));
    }
    return `RDM-${String(max + 1).padStart(5, '0')}`;
  })();
}

/**
 * Submit an external redemption. Returns {ok, orderNo, status, approvalStatus, message}.
 * Throws errors with .status for the API layer.
 */
export async function submitRedemption(db, env, { token, slug, contact, shipping, items, ip }) {
  await ensureRedemptionSchema(db);
  const { portal, invite } = await loadPublicPortal(db, { token, slug });
  const isPersonal = portal.type === 'PERSONAL_LINK' || !!invite;
  if (invite && Number(invite.is_redeemed) === 1) {
    throw Object.assign(new Error('This link has already been redeemed'), { status: 409 });
  }

  // IP-level rate limit for the shared open portal (spec §7).
  if (!isPersonal) {
    const key = `redeem:${portal.id}:${String(ip || '').slice(0, 64)}`;
    if (rateLimited(key, 5, 60_000)) {
      throw Object.assign(new Error('Too many submissions. Please try again in a minute.'), { status: 429 });
    }
  }

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const name = text(contact?.name, 120);
  const email = text(contact?.email, 254).toLowerCase();
  if (!name || !EMAIL_RE.test(email)) throw Object.assign(new Error('A valid name and email are required'), { status: 400 });
  const ship = {
    name: text(shipping?.name, 120) || name,
    email: text(shipping?.email, 254) || email,
    phone: text(shipping?.phone, 40),
    countryCode: text(shipping?.countryCode, 2).toUpperCase(),
    state: text(shipping?.state, 80),
    city: text(shipping?.city, 120),
    postalCode: text(shipping?.postalCode, 40),
    address1: text(shipping?.address1, 200),
    address2: text(shipping?.address2, 200),
  };
  if (!COUNTRIES.some(([c]) => c === ship.countryCode)) {
    throw Object.assign(new Error('Choose a valid delivery country'), { status: 400 });
  }
  if (!ship.city || !ship.address1 || !ship.phone) {
    throw Object.assign(new Error('Phone, city and street address are required'), { status: 400 });
  }

  const allowed = await portalItems(db, portal.id);
  const allowedById = new Map(allowed.map((r) => [String(r.id), r]));
  const lines = Array.isArray(items) ? items : [];
  if (!lines.length) throw Object.assign(new Error('Choose at least one product'), { status: 400 });
  if (lines.length > 50) throw Object.assign(new Error('Too many items'), { status: 400 });

  // SPU-level limit: sum all variants of the same product (spec §2.3).
  const byProduct = new Map();
  const parsedLines = [];
  for (const [i, l] of lines.entries()) {
    const productId = String(l?.productId || '').trim().slice(0, 80);
    const src = allowedById.get(productId);
    if (!src) throw Object.assign(new Error(`Line ${i + 1}: product is not available in this portal`), { status: 403 });
    const qty = Math.max(1, int(l?.qty, 0));
    if (!Number.isFinite(qty) || qty > 10000) throw Object.assign(new Error(`Line ${i + 1}: invalid quantity`), { status: 400 });
    const colors = arrayOf(parseJson(src.colors_json, []));
    const sizes = arrayOf(parseJson(src.sizes_json, [])).filter((s) => typeof s === 'string');
    const colorId = text(l?.colorId, 24);
    const color = colors.find((c) => String(c?.id || '') === colorId);
    if (colors.length && !color) throw Object.assign(new Error(`Line ${i + 1}: choose a colour`), { status: 400 });
    const size = text(l?.size, 20) || (sizes[0] || 'OS');
    if (sizes.length && !sizes.includes(size)) throw Object.assign(new Error(`Line ${i + 1}: invalid size`), { status: 400 });
    parsedLines.push({
      n: i + 1, productId, colorIndex: color ? colors.indexOf(color) : null,
      colorName: color?.name || '', colorHex: color?.hex || '', size, quantity: qty, src,
    });
    byProduct.set(productId, int(byProduct.get(productId), 0) + qty);
  }
  for (const [productId, qty] of byProduct) {
    const maxQty = allowedById.get(productId)?.max_qty_per_order;
    if (maxQty !== null && maxQty !== undefined && qty > int(maxQty, 1)) {
      throw Object.assign(new Error(`${allowedById.get(productId).name}: limit is ${maxQty} per order`), { status: 400 });
    }
  }

  const products = {};
  for (const r of allowed) products[String(r.id)] = r;
  let stockRows = [];
  try { stockRows = await invLoadForProducts(db, [...new Set(parsedLines.map((l) => l.productId))]); } catch {}
  const stock = invResolveOrderLines(products, parsedLines.map((l) => ({
    n: l.n, productId: l.productId, colorIndex: l.colorIndex, size: l.size, quantity: l.quantity,
  })), stockRows);
  if (stock.error) throw Object.assign(new Error(stock.error), { status: 400 });
  if (stock.shortages.length) {
    throw Object.assign(new Error('Some items are out of stock. Please reduce the quantity.'), {
      status: 409, code: 'INSUFFICIENT_STOCK', shortages: stock.shortages,
    });
  }

  const snapshot = [];
  let itemCount = 0, total = 0;
  parsedLines.forEach((l, i) => {
    const r = l.src;
    const unitPrice = tierUnitPrice(parseJson(r.pricing_json, []), l.quantity);
    const lineTotal = round2(unitPrice * l.quantity);
    snapshot.push({
      productId: l.productId, sku: r.sku || null, name: r.name,
      colorIndex: l.colorIndex, colorName: l.colorName, colorHex: l.colorHex,
      size: l.size, quantity: l.quantity, unitPrice, lineTotal,
      image: r.image || null, stockSku: stock.lineSkus[i] || null,
    });
    itemCount += l.quantity;
    total += lineTotal;
  });
  total = round2(total);

  // Channel is derived from the portal type server-side — never from the public request.
  const channel = normalizeChannel({
    REWARDS_STORE: 'M2', PERSONAL_LINK: 'M3', OPEN_PORTAL: 'M4',
  }[portal.type] || 'M4');
  const ch = CHANNELS[channel];
  const requiresApproval = ch.approval === 'PENDING';
  const approvalStatus = requiresApproval ? 'PENDING' : 'NOT_REQUIRED';
  const orderStatus = requiresApproval ? 'pending' : 'processing';
  const fulfilmentStatus = requiresApproval ? 'PENDING_APPROVAL' : 'READY_FOR_DISPATCH';
  const sourceType = ch.sourceType;
  const customerId = Number(portal.customer_id);
  const notes = `[redemption:${channel}:${portal.slug || portal.id}] ${invite ? invite.recipient_name : name}`;
  const actor = invite ? `invite:${invite.id}` : 'public';

  // Order no + INSERT + stock reserve in one batch (spec §2.2 atomic conditional deduct).
  let orderNo, createdAt;
  const needs = stock.needs;
  for (let attempt = 1; ; attempt++) {
    try {
      orderNo = await nextOrderNo(db);
      createdAt = now();
      const insert = db.prepare(`INSERT INTO orders
        (order_no,customer_id,customer_name,customer_email,customer_phone,company,notes,items_json,item_count,total,
         status,created_at,status_updated_at,source_type,portal_id,invite_id,approval_status,fulfilment_status,
         order_channel,origin_type,
         shipping_name,shipping_email,shipping_phone,shipping_country_code,shipping_state,shipping_city,
         shipping_postal_code,shipping_address_line1,shipping_address_line2)
        VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?9,?10,?11,?11,?12,?13,?14,?15,?16,?17,?18,
                ?19,?20,?21,?22,?23,?24,?25,?26,?27)`).bind(
        orderNo, Number.isFinite(customerId) ? customerId : null,
        name, email, ship.phone, notes, JSON.stringify(snapshot), itemCount, total,
        orderStatus, createdAt, sourceType, portal.id, invite?.id || null, approvalStatus, fulfilmentStatus,
        channel, ch.origin,
        ship.name, ship.email, ship.phone, ship.countryCode, ship.state, ship.city,
        ship.postalCode, ship.address1, ship.address2
      );

      const batch = [insert];
      if (needs.size) {
        batch.push(...invReserveStatements(db, { orderNo, now: createdAt, actor, needs }));
      }
      // Personal link: mark redeemed in the same transaction, with a conditional
      // guard that makes double submission impossible even with two open tabs.
      if (invite) {
        batch.push(db.prepare(`UPDATE redemption_invites
          SET is_redeemed=1, redeemed_at=?2, order_id=?3
          WHERE id=?1 AND is_redeemed=0`).bind(invite.id, createdAt, orderNo));
      }
      const results = await db.batch(batch);
      if (invite) {
        const claim = results[results.length - 1];
        if (!int(claim?.meta?.changes, 0)) {
          throw Object.assign(new Error('This link has already been redeemed'), { status: 409 });
        }
      }
      break;
    } catch (e) {
      const kind = invClassifyError(e);
      if (kind === 'order_no_taken' && attempt < INV_ORDER_NO_ATTEMPTS) continue;
      if (kind === 'insufficient') {
        throw Object.assign(new Error('Stock just changed. Please review your selection and try again.'), {
          status: 409, code: 'INSUFFICIENT_STOCK',
        });
      }
      if (e?.status) throw e;
      console.error('redemption submit:', e?.message);
      throw Object.assign(new Error('Could not submit your order'), { status: 500 });
    }
  }

  return {
    ok: true, orderNo, status: orderStatus, approvalStatus, fulfilmentStatus,
    message: requiresApproval
      ? 'Your request is submitted and waiting for admin approval.'
      : 'Your order is submitted and will be prepared for dispatch.',
  };
}

// ---------------- Approval queue (M3 / M4 individual orders) ----------------

function shapeApprovalRow(r) {
  return {
    orderNo: r.order_no,
    created: day(r.created_at),
    name: r.customer_name, email: r.customer_email, phone: r.customer_phone || '',
    portalId: r.portal_id, portalName: r.portal_name || r.portal_title || '',
    portalType: r.portal_type || '',
    channel: String(r.order_channel || (r.source_type === 'PERSONAL_LINK' ? 'M3' : 'M4')).toUpperCase(),
    sourceType: r.source_type || '',
    origin: r.origin_type || 'INDIVIDUAL',
    fulfilmentStatus: r.fulfilment_status || '',
    reviewedBy: r.reviewed_by || '', reviewedAt: r.reviewed_at ? day(r.reviewed_at) : '',
    reviewNote: r.review_note || '',
    shipping: {
      name: r.shipping_name || '', email: r.shipping_email || '', phone: r.shipping_phone || '',
      countryCode: r.shipping_country_code || '', state: r.shipping_state || '',
      city: r.shipping_city || '', postalCode: r.shipping_postal_code || '',
      address1: r.shipping_address_line1 || '', address2: r.shipping_address_line2 || '',
    },
    items: arrayOf(parseJson(r.items_json, [])).map((it) => ({
      name: it?.name || 'Product', sku: it?.sku || '', color: it?.colorName || '',
      size: it?.size || 'OS', qty: int(it?.quantity, 1), unitPrice: Number(it?.unitPrice) || 0,
      lineTotal: Number(it?.lineTotal) || 0,
    })),
    itemCount: int(r.item_count, 0), total: Number(r.total) || 0,
    status: r.status, approvalStatus: r.approval_status,
  };
}

const APPROVAL_SELECT = `
    SELECT o.*, p.name AS portal_name, p.customer_id AS portal_customer,
           p.custom_title AS portal_title, p.type AS portal_type
    FROM orders o JOIN redemption_portals p ON p.id = o.portal_id`;

export async function listPendingApprovals(db, customerId) {
  await ensureRedemptionSchema(db);
  const where = customerId ? 'AND p.customer_id = ?2' : '';
  const binds = customerId ? [customerId] : [];
  const res = await db.prepare(`${APPROVAL_SELECT}
    WHERE o.approval_status = 'PENDING' ${where}
    ORDER BY o.created_at ASC LIMIT 500`).bind(...binds).all();
  return (res.results || []).map(shapeApprovalRow);
}

// Full M3/M4 order list for the admin Orders screen: pending, approved and rejected.
export async function listRedemptionOrders(db, customerId) {
  await ensureRedemptionSchema(db);
  const where = customerId ? 'AND p.customer_id = ?2' : '';
  const binds = customerId ? [customerId] : [];
  const res = await db.prepare(`${APPROVAL_SELECT}
    WHERE o.source_type IN ('PERSONAL_LINK','OPEN_PORTAL') ${where}
    ORDER BY o.created_at DESC LIMIT 500`).bind(...binds).all();
  return (res.results || []).map(shapeApprovalRow);
}

// options: { customerId, role } — client callers must be scoped to their own portal.
export async function reviewRedemptionOrder(db, orderNo, decision, actor, note = '', options = {}) {
  await ensureRedemptionSchema(db);
  const role = String(options?.role || 'admin').toLowerCase();
  if (!['client', 'admin'].includes(role)) {
    throw Object.assign(new Error('This account cannot approve orders'), { status: 403 });
  }
  const order = await db.prepare(`
    SELECT o.*, p.customer_id AS portal_customer
    FROM orders o JOIN redemption_portals p ON p.id = o.portal_id
    WHERE o.order_no = ?1 AND o.approval_status = 'PENDING'
      AND o.source_type IN ('PERSONAL_LINK','OPEN_PORTAL')`
  ).bind(orderNo).first();
  if (!order) throw Object.assign(new Error('Pending redemption order not found'), { status: 404 });
  if (!canReviewOrder({ orderChannel: order.order_channel, approvalStatus: order.approval_status }, role)) {
    throw Object.assign(new Error('This account cannot approve this order'), { status: 403 });
  }
  if (options?.customerId != null && String(options.customerId) !== String(order.portal_customer)) {
    throw Object.assign(new Error('This order belongs to another customer'), { status: 404 });
  }
  const ts = now();
  if (decision === 'APPROVE') {
    // Spec §2.2: stock was already deducted on submit — approval must NOT deduct again.
    const res = await db.prepare(`UPDATE orders
      SET approval_status='APPROVED', fulfilment_status='READY_FOR_DISPATCH',
          status='processing', reviewed_by=?2, reviewed_at=?3, review_note=?4, status_updated_at=?3
      WHERE order_no=?1 AND approval_status='PENDING'`).bind(orderNo, actor, ts, text(note, 500)).run();
    if (!int(res?.meta?.changes, 0)) throw Object.assign(new Error('Order was already reviewed'), { status: 409 });
    return { ok: true, approvalStatus: 'APPROVED', fulfilmentStatus: 'READY_FOR_DISPATCH' };
  }
  if (decision === 'REJECT' || decision === 'CANCEL') {
    const rejected = decision === 'REJECT';
    const guardSql = "EXISTS (SELECT 1 FROM orders o WHERE o.order_no = ?1 AND o.approval_status = 'PENDING')";
    const update = db.prepare(`UPDATE orders
      SET approval_status=?2, fulfilment_status=?3, status='cancelled',
          reviewed_by=?4, reviewed_at=?5, review_note=?6, status_updated_at=?5
      WHERE order_no=?1 AND approval_status='PENDING'`).bind(
      orderNo, rejected ? 'REJECTED' : 'REJECTED', 'REJECTED', actor, ts, text(note, 500)
    );
    let result;
    try {
      const results = await db.batch([
        ...invTransitionStatements(db, { effect: 'release', orderNo, now: ts, actor, guardSql }),
        update,
      ]);
      result = results[results.length - 1];
    } catch (e) {
      if (invClassifyError(e) === 'missing_table') result = await update.run();
      else throw e;
    }
    if (!int(result?.meta?.changes, 0)) throw Object.assign(new Error('Order was already reviewed'), { status: 409 });
    return { ok: true, approvalStatus: 'REJECTED', fulfilmentStatus: 'REJECTED' };
  }
  throw Object.assign(new Error('Unknown decision'), { status: 400 });
}
