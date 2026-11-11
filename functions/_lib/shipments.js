// Shared shipment helpers (Requirement 5: order-attached shipment tracking, migration 0012).
// Used by the admin API (functions/api/admin/shipments.js, .../shipments/upload.js), the photo
// proxy (functions/api/orders/shipment-photo.js) and the customer order reads.
// Pages bundles _lib modules into one namespace, so every top-level name uses an shp/SHP_ prefix.
// Nothing here writes the `orders` table.
import { SHIPMENT_STATUSES, isShipmentStatus, shipmentStatusLabel } from './shipment-status.js';

export const SHP_LIMITS = {
  shipmentsPerOrder: 20,
  eventsPerShipment: 100,
  photosPerShipment: 50,
  filesPerBatch: 20,
  maxFileBytes: 10 * 1024 * 1024,
  maxBatchBytes: 50 * 1024 * 1024,
};

// Upload allowlist. The R2 key extension comes from this map, never from the file name. No SVG.
export const SHP_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// The only photo URL ever handed to a client: the ownership-checked, same-origin proxy.
export function shpPhotoUrl(orderNo, photoId) {
  return `/api/orders/shipment-photo?orderNo=${encodeURIComponent(orderNo)}&id=${photoId}`;
}

// ---- Serializer (customer view is an explicit allowlist; admin view adds admin-only fields) ----
// r2_key and content_type are never serialized in either view.

function shpEventOut(e, admin) {
  const out = {
    id: e.id,
    time: e.event_time,
    status: e.status || null,
    statusLabel: e.status ? shipmentStatusLabel(e.status) : null,
    title: e.title,
    description: e.description || null,
    location: e.location || null,
  };
  if (admin) {
    out.createdBy = e.created_by || null;
    out.createdAt = e.created_at;
    out.updatedAt = e.updated_at;
  }
  return out;
}

function shpPhotoOut(p, orderNo, admin) {
  const out = { id: p.id, url: shpPhotoUrl(orderNo, p.id), caption: p.caption || null };
  if (admin) {
    out.fileName = p.file_name || null;
    out.sizeBytes = p.size_bytes ?? null;
    out.createdAt = p.created_at;
  }
  return out;
}

function shpShipmentOut(s, index, events, photos, admin) {
  const out = {
    id: s.id,
    index,
    carrier: s.carrier || null,
    trackingNo: s.tracking_no || null,
    trackingUrl: s.tracking_url || null,
    status: s.status,
    statusLabel: shipmentStatusLabel(s.status),
    origin: s.origin || null,
    destination: s.destination || null,
    packages: s.packages ?? null,
    shippedAt: s.shipped_at || null,
    eta: s.eta || null,
    deliveredAt: s.delivered_at || null,
    note: s.note || null,
    updatedAt: s.updated_at,
    events: events.map((e) => shpEventOut(e, admin)),
    photos: photos.map((p) => shpPhotoOut(p, s.order_no, admin)),
  };
  if (admin) {
    out.internalNote = s.internal_note || null;
    out.createdBy = s.created_by || null;
    out.createdAt = s.created_at;
  }
  return out;
}

// All shipments of one order with events (newest first) and photos. One D1 round trip.
// Throws on DB error (admin callers map it to 500).
export async function shpLoadForOrder(db, orderNo, { admin = false } = {}) {
  const [shipRes, eventRes, photoRes] = await db.batch([
    db.prepare(
      `SELECT id, order_no, carrier, tracking_no, tracking_url, status, origin, destination, packages,
              shipped_at, eta, delivered_at, note, internal_note, created_by, created_at, updated_at
       FROM shipments WHERE order_no = ?1 ORDER BY id`
    ).bind(orderNo),
    db.prepare(
      `SELECT e.* FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id
       WHERE s.order_no = ?1 ORDER BY e.event_time DESC, e.id DESC`
    ).bind(orderNo),
    db.prepare(
      `SELECT p.id, p.shipment_id, p.caption, p.file_name, p.size_bytes, p.created_at
       FROM shipment_photos p JOIN shipments s ON s.id = p.shipment_id
       WHERE s.order_no = ?1 ORDER BY p.id`
    ).bind(orderNo),
  ]);
  const eventsBy = new Map();
  for (const e of eventRes?.results || []) {
    if (!eventsBy.has(e.shipment_id)) eventsBy.set(e.shipment_id, []);
    eventsBy.get(e.shipment_id).push(e);
  }
  const photosBy = new Map();
  for (const p of photoRes?.results || []) {
    if (!photosBy.has(p.shipment_id)) photosBy.set(p.shipment_id, []);
    photosBy.get(p.shipment_id).push(p);
  }
  return (shipRes?.results || []).map((s, i) =>
    shpShipmentOut(s, i + 1, eventsBy.get(s.id) || [], photosBy.get(s.id) || [], admin));
}

// Customer view. Only call AFTER the caller's ownership check has passed.
// Fail-soft on extra data: a missing/broken shipments table must not break order tracking.
export async function shpLoadForOrderSafe(db, orderNo) {
  try {
    return await shpLoadForOrder(db, orderNo, { admin: false });
  } catch (e) {
    console.error('shipments: load', orderNo, e?.message);
    return [];
  }
}

// Map(orderNo -> shipment count) for one customer's orders. Fail-soft (empty Map).
export async function shpCountForCustomer(db, customerId) {
  const counts = new Map();
  try {
    const res = await db.prepare(
      `SELECT order_no, COUNT(*) AS n FROM shipments
       WHERE order_no IN (SELECT order_no FROM orders WHERE customer_id = ?1)
       GROUP BY order_no`
    ).bind(customerId).all();
    for (const r of res?.results || []) counts.set(r.order_no, Number(r.n) || 0);
  } catch (e) {
    console.error('shipments: count', e?.message);
  }
  return counts;
}

// ---- Validators: return { value } or { error }. Empty/absent -> { value: null } (never undefined). ----

const shpIsEmpty = (raw) => raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');

export function shpText(raw, label, max, required = false) {
  if (shpIsEmpty(raw)) return required ? { error: `${label} is required` } : { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be text` };
  const value = raw.trim();
  if (value.length > max) return { error: `${label} is too long (max ${max} characters)` };
  return { value };
}

export function shpHttpUrl(raw, label) {
  if (shpIsEmpty(raw)) return { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be text` };
  const value = raw.trim();
  if (value.length > 500) return { error: `${label} is too long (max 500 characters)` };
  let u;
  try { u = new URL(value); } catch { return { error: `${label} must be an absolute http(s) URL` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `${label} must be an absolute http(s) URL` };
  return { value };
}

export function shpIso(raw, label, required = false) {
  if (shpIsEmpty(raw)) return required ? { error: `${label} is required` } : { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be a date/time string` };
  const value = raw.trim();
  if (value.length > 40) return { error: `${label} is not a valid date/time` };
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return { error: `${label} is not a valid date/time` };
  return { value: new Date(t).toISOString() };
}

export function shpDate(raw, label) {
  if (shpIsEmpty(raw)) return { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be a date (YYYY-MM-DD)` };
  const value = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return { error: `${label} must be a date (YYYY-MM-DD)` };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { error: `${label} is not a valid date` };
  }
  return { value };
}

export function shpInt(raw, label, min, max) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\d{1,9}$/.test(raw.trim())) n = Number(raw.trim());
  else return { error: `${label} must be a whole number` };
  if (!Number.isSafeInteger(n)) return { error: `${label} must be a whole number` };
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}` };
  return { value: n };
}

// Ids are always required: absent, zero, negative or non-numeric -> { error: 'Invalid id' }.
export function shpId(raw) {
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\d{1,15}$/.test(raw.trim())) n = Number(raw.trim());
  else return { error: 'Invalid id' };
  if (!Number.isSafeInteger(n) || n <= 0) return { error: 'Invalid id' };
  return { value: n };
}

// Run a list of [key, result] pairs; first error wins.
function shpCollect(pairs) {
  const values = {};
  for (const [key, r] of pairs) {
    if (r.error) return { error: r.error };
    values[key] = r.value;
  }
  return { values };
}

// Editable shipment fields (admin create/update; full replace on update).
export function shpParseShipmentFields(body) {
  const b = body || {};
  const status = typeof b.status === 'string' ? b.status.trim() : '';
  if (!isShipmentStatus(status)) return { error: `status must be one of: ${SHIPMENT_STATUSES.join(', ')}` };
  const parsed = shpCollect([
    ['carrier', shpText(b.carrier, 'Carrier', 80)],
    ['trackingNo', shpText(b.trackingNo, 'Tracking number', 80)],
    ['trackingUrl', shpHttpUrl(b.trackingUrl, 'Tracking URL')],
    ['origin', shpText(b.origin, 'Origin', 120)],
    ['destination', shpText(b.destination, 'Destination', 120)],
    ['packages', shpInt(b.packages, 'Packages', 0, 100000)],
    ['shippedAt', shpIso(b.shippedAt, 'Shipped at')],
    ['eta', shpDate(b.eta, 'ETA')],
    ['deliveredAt', shpIso(b.deliveredAt, 'Delivered at')],
    ['note', shpText(b.note, 'Note', 1000)],
    ['internalNote', shpText(b.internalNote, 'Internal note', 1000)],
  ]);
  if (parsed.error) return parsed;
  parsed.values.status = status;
  if (status === 'delivered' && !parsed.values.deliveredAt) parsed.values.deliveredAt = new Date().toISOString();
  return parsed;
}

// Event fields (admin addEvent/updateEvent). Event status is a label only.
export function shpParseEventFields(body) {
  const b = body || {};
  let status = { value: null };
  if (!shpIsEmpty(b.status)) {
    const s = typeof b.status === 'string' ? b.status.trim() : '';
    status = isShipmentStatus(s) ? { value: s } : { error: `Event status must be empty or one of: ${SHIPMENT_STATUSES.join(', ')}` };
  }
  return shpCollect([
    ['eventTime', shpIso(b.eventTime, 'Event time', true)],
    ['title', shpText(b.title, 'Title', 160, true)],
    ['description', shpText(b.description, 'Description', 1000)],
    ['location', shpText(b.location, 'Location', 120)],
    ['status', status],
  ]);
}
