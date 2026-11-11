import { getAdminSecret, json, readSession } from '../../_lib/auth.js';
import { SHOWCASE_ORDER_NO_RE } from '../../_lib/orders.js';
import { statusLabel } from '../../_lib/order-status.js';
import { shipmentStatusOptions } from '../../_lib/shipment-status.js';
import {
  SHP_LIMITS, shpId, shpLoadForOrder, shpParseEventFields, shpParseShipmentFields,
} from '../../_lib/shipments.js';

/**
 * /api/admin/shipments — admin management of order-attached shipments (migration 0012).
 *
 *  GET  /api/admin/shipments?orderNo=...   -> { orderNo, orderStatus, statuses, limits, uploadEnabled, shipments }
 *  POST /api/admin/shipments {op, orderNo, ...}
 *       op: create | update | delete | addEvent | updateEvent | deleteEvent | deletePhoto
 *       every success returns { ok, orderNo, shipments } (the full fresh admin list)
 *
 * Security: admin session required; same-origin only (no CORS); no-store; parameterized queries.
 * Every child statement is scoped by the full chain (order -> shipment -> event/photo) because ids
 * are sequential. Nothing here writes the `orders` table (read-only status lookup only).
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const SW_ORDER_NO_RE = /^SW-\d{8}-[A-Z0-9]{1,12}$/;
const isValidOrderNo = (no) => SW_ORDER_NO_RE.test(no) || SHOWCASE_ORDER_NO_RE.test(no);
const MAX_BODY_BYTES = 16 * 1024;

const reply = (data, status = 200) => json(data, status, NO_STORE);

// Returns { username } for a valid admin session, else null.
async function requireAdmin(request, env) {
  return readSession(request, await getAdminSecret(env));
}

async function readJsonBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return { error: 'Content-Type must be application/json', status: 415 };
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid JSON body', status: 400 };
    return { body };
  } catch {
    return { error: 'Invalid JSON body', status: 400 };
  }
}

const isCancelled = (status) => String(status).toLowerCase() === 'cancelled';

// Best-effort R2 cleanup AFTER the D1 delete succeeded. Logs photo ids, never keys.
async function deleteR2(media, photos) {
  for (const p of photos) {
    try {
      await media?.delete(p.r2_key);
    } catch (e) {
      console.warn('shipments: r2 delete failed', 'photo', p.id, e?.message);
    }
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await requireAdmin(request, env)) return reply({ error: 'Unauthorized' }, 401);

  const no = (new URL(request.url).searchParams.get('orderNo') || '').trim();
  if (!isValidOrderNo(no)) return reply({ error: 'Invalid order number' }, 400);
  try {
    const order = await env.DB.prepare('SELECT status FROM orders WHERE order_no = ?1').bind(no).first();
    if (!order) return reply({ error: 'Order not found' }, 404);
    const shipments = await shpLoadForOrder(env.DB, no, { admin: true });
    return reply({
      orderNo: no,
      orderStatus: order.status,
      orderStatusLabel: statusLabel(order.status),
      statuses: shipmentStatusOptions(),
      limits: SHP_LIMITS,
      uploadEnabled: !!env.MEDIA,
      shipments,
    });
  } catch (e) {
    console.error('admin shipments: list', e?.message);
    return reply({ error: 'Could not load shipments' }, 500);
  }
}

const OPS = new Set(['create', 'update', 'delete', 'addEvent', 'updateEvent', 'deleteEvent', 'deletePhoto']);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status);
  const body = parsed.body;
  const op = typeof body.op === 'string' ? body.op.trim() : '';
  if (!OPS.has(op)) return reply({ error: 'Unknown op' }, 400);
  const no = typeof body.orderNo === 'string' ? body.orderNo.trim() : '';
  if (!isValidOrderNo(no)) return reply({ error: 'Invalid order number' }, 400);

  // Validate everything that needs no SQL before touching the DB.
  let shipmentId = null;
  let childId = null;
  let fields = null;
  if (op !== 'create') {
    const r = shpId(body.shipmentId);
    if (r.error) return reply({ error: r.error }, 400);
    shipmentId = r.value;
  }
  if (op === 'updateEvent' || op === 'deleteEvent') {
    const r = shpId(body.eventId);
    if (r.error) return reply({ error: r.error }, 400);
    childId = r.value;
  }
  if (op === 'deletePhoto') {
    const r = shpId(body.photoId);
    if (r.error) return reply({ error: r.error }, 400);
    childId = r.value;
  }
  let expectedUpdatedAt = null;
  if (op === 'update') {
    const v = body.expectedUpdatedAt;
    if (typeof v !== 'string' || v.length < 1 || v.length > 40) return reply({ error: 'expectedUpdatedAt is required' }, 400);
    expectedUpdatedAt = v;
  }
  if (op === 'create' || op === 'update') {
    const r = shpParseShipmentFields(body);
    if (r.error) return reply({ error: r.error }, 400);
    fields = r.values;
  }
  if (op === 'addEvent' || op === 'updateEvent') {
    const r = shpParseEventFields(body);
    if (r.error) return reply({ error: r.error }, 400);
    fields = r.values;
  }

  const db = env.DB;
  const ok = async () => reply({ ok: true, orderNo: no, shipments: await shpLoadForOrder(db, no, { admin: true }) });
  const audit = (id) => console.log(`admin shipments: ${admin.username} ${op} ${no} #${id}`);
  const now = new Date().toISOString();

  try {
    const order = await db.prepare('SELECT status FROM orders WHERE order_no = ?1').bind(no).first();
    if (!order) return reply({ error: 'Order not found' }, 404);

    if (op === 'create') {
      if (isCancelled(order.status)) return reply({ error: 'Cannot add a shipment to a cancelled order' }, 400);
      const cnt = await db.prepare('SELECT COUNT(*) AS n FROM shipments WHERE order_no = ?1').bind(no).first();
      if (Number(cnt?.n || 0) >= SHP_LIMITS.shipmentsPerOrder) {
        return reply({ error: `An order can have at most ${SHP_LIMITS.shipmentsPerOrder} shipments` }, 400);
      }
      const f = fields;
      const res = await db.prepare(
        `INSERT INTO shipments (order_no, carrier, tracking_no, tracking_url, status, origin, destination, packages,
                                shipped_at, eta, delivered_at, note, internal_note, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)`
      ).bind(no, f.carrier, f.trackingNo, f.trackingUrl, f.status, f.origin, f.destination, f.packages,
        f.shippedAt, f.eta, f.deliveredAt, f.note, f.internalNote, admin.username || null, now).run();
      audit(res?.meta?.last_row_id ?? '?');
      return ok();
    }

    if (op === 'update') {
      const f = fields;
      const res = await db.prepare(
        `UPDATE shipments SET carrier = ?4, tracking_no = ?5, tracking_url = ?6, status = ?7, origin = ?8,
                destination = ?9, packages = ?10, shipped_at = ?11, eta = ?12, delivered_at = ?13, note = ?14,
                internal_note = ?15, updated_at = ?16
         WHERE id = ?1 AND order_no = ?2 AND updated_at = ?3`
      ).bind(shipmentId, no, expectedUpdatedAt, f.carrier, f.trackingNo, f.trackingUrl, f.status, f.origin,
        f.destination, f.packages, f.shippedAt, f.eta, f.deliveredAt, f.note, f.internalNote, now).run();
      if (!res?.meta?.changes) {
        const exists = await db.prepare('SELECT id FROM shipments WHERE id = ?1 AND order_no = ?2').bind(shipmentId, no).first();
        if (!exists) return reply({ error: 'Shipment not found' }, 404);
        return reply({
          error: 'This shipment was changed by someone else. Reloaded.',
          shipments: await shpLoadForOrder(db, no, { admin: true }),
        }, 409);
      }
      audit(shipmentId);
      return ok();
    }

    if (op === 'delete') {
      const keys = await db.prepare(
        `SELECT p.id, p.r2_key FROM shipment_photos p JOIN shipments s ON s.id = p.shipment_id
         WHERE s.id = ?1 AND s.order_no = ?2`
      ).bind(shipmentId, no).all();
      const res = await db.prepare('DELETE FROM shipments WHERE id = ?1 AND order_no = ?2').bind(shipmentId, no).run();
      if (!res?.meta?.changes) return reply({ error: 'Shipment not found' }, 404);
      await deleteR2(env.MEDIA, keys?.results || []);
      audit(shipmentId);
      return ok();
    }

    if (op === 'addEvent') {
      const parent = await db.prepare('SELECT id FROM shipments WHERE id = ?1 AND order_no = ?2').bind(shipmentId, no).first();
      if (!parent) return reply({ error: 'Shipment not found' }, 404);
      const cnt = await db.prepare('SELECT COUNT(*) AS n FROM shipment_events WHERE shipment_id = ?1').bind(shipmentId).first();
      if (Number(cnt?.n || 0) >= SHP_LIMITS.eventsPerShipment) {
        return reply({ error: `A shipment can have at most ${SHP_LIMITS.eventsPerShipment} events` }, 400);
      }
      const f = fields;
      const res = await db.prepare(
        `INSERT INTO shipment_events (shipment_id, event_time, status, title, description, location, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
      ).bind(shipmentId, f.eventTime, f.status, f.title, f.description, f.location, admin.username || null, now).run();
      audit(res?.meta?.last_row_id ?? '?');
      return ok();
    }

    if (op === 'updateEvent') {
      const f = fields;
      const res = await db.prepare(
        `UPDATE shipment_events SET event_time = ?4, status = ?5, title = ?6, description = ?7, location = ?8, updated_at = ?9
         WHERE id = ?1 AND shipment_id = ?2 AND shipment_id IN (SELECT id FROM shipments WHERE order_no = ?3)`
      ).bind(childId, shipmentId, no, f.eventTime, f.status, f.title, f.description, f.location, now).run();
      if (!res?.meta?.changes) return reply({ error: 'Event not found' }, 404);
      audit(childId);
      return ok();
    }

    if (op === 'deleteEvent') {
      const res = await db.prepare(
        `DELETE FROM shipment_events
         WHERE id = ?1 AND shipment_id = ?2 AND shipment_id IN (SELECT id FROM shipments WHERE order_no = ?3)`
      ).bind(childId, shipmentId, no).run();
      if (!res?.meta?.changes) return reply({ error: 'Event not found' }, 404);
      audit(childId);
      return ok();
    }

    // deletePhoto
    const photo = await db.prepare(
      `SELECT id, r2_key FROM shipment_photos
       WHERE id = ?1 AND shipment_id = ?2 AND shipment_id IN (SELECT id FROM shipments WHERE order_no = ?3)`
    ).bind(childId, shipmentId, no).first();
    if (!photo) return reply({ error: 'Photo not found' }, 404);
    const res = await db.prepare(
      `DELETE FROM shipment_photos
       WHERE id = ?1 AND shipment_id = ?2 AND shipment_id IN (SELECT id FROM shipments WHERE order_no = ?3)`
    ).bind(childId, shipmentId, no).run();
    if (!res?.meta?.changes) return reply({ error: 'Photo not found' }, 404);
    await deleteR2(env.MEDIA, [photo]);
    audit(childId);
    return ok();
  } catch (e) {
    console.error(`admin shipments: ${op}`, e?.message);
    return reply({ error: `Could not ${op}` }, 500);
  }
}
