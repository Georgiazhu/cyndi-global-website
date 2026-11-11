import { getAdminSecret, json, readSession } from '../../../_lib/auth.js';
import { SHOWCASE_ORDER_NO_RE } from '../../../_lib/orders.js';
import { SHP_IMAGE_TYPES, SHP_LIMITS, shpId, shpLoadForOrder, shpText } from '../../../_lib/shipments.js';

/**
 * POST /api/admin/shipments/upload — admin photo upload for one shipment.
 * multipart/form-data: orderNo, shipmentId, file x N, caption (optional, applied to every file).
 *
 * Storage: R2 (env.MEDIA) only. No D1 fallback and no public R2 URL is ever returned; clients only
 * get the ownership-checked proxy URL (/api/orders/shipment-photo). Keys are server-generated
 * (UUID + extension from the type allowlist) and are never logged or serialized.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const SW_ORDER_NO_RE = /^SW-\d{8}-[A-Z0-9]{1,12}$/;
const isValidOrderNo = (no) => SW_ORDER_NO_RE.test(no) || SHOWCASE_ORDER_NO_RE.test(no);
const reply = (data, status = 200) => json(data, status, NO_STORE);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await readSession(request, await getAdminSecret(env));
  if (!admin) return reply({ error: 'Unauthorized' }, 401);
  if (!env.MEDIA) return reply({ error: 'Photo storage (R2) is not configured' }, 503);

  // CSRF defence in depth (the admin cookie is already SameSite=Strict). Same origin passes;
  // loopback-to-loopback passes only when the server itself is on loopback (Vite dev proxy).
  const origin = request.headers.get('Origin');
  if (origin) {
    let o; try { o = new URL(origin); } catch { return reply({ error: 'Forbidden' }, 403); }
    const self = new URL(request.url);
    const loop = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    const ok = o.origin === self.origin || (loop(o.hostname) && loop(self.hostname));
    if (!ok) { console.warn('admin shipments upload: cross-origin', origin); return reply({ error: 'Forbidden' }, 403); }
  }

  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return reply({ error: 'Content-Type must be multipart/form-data' }, 415);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > SHP_LIMITS.maxBatchBytes) return reply({ error: 'Upload batch too large (max 50 MB per request)' }, 413);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return reply({ error: 'Invalid multipart body' }, 400);
  }

  const no = String(formData.get('orderNo') || '').trim();
  if (!isValidOrderNo(no)) return reply({ error: 'Invalid order number' }, 400);
  const idRes = shpId(String(formData.get('shipmentId') || ''));
  if (idRes.error) return reply({ error: idRes.error }, 400);
  const shipmentId = idRes.value;
  const capRaw = formData.get('caption');
  const capRes = shpText(typeof capRaw === 'string' ? capRaw : null, 'Caption', 200);
  if (capRes.error) return reply({ error: capRes.error }, 400);

  const db = env.DB;
  let existing;
  try {
    const parent = await db.prepare('SELECT id FROM shipments WHERE id = ?1 AND order_no = ?2').bind(shipmentId, no).first();
    if (!parent) return reply({ error: 'Shipment not found' }, 404);
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM shipment_photos WHERE shipment_id = ?1').bind(shipmentId).first();
    existing = Number(cnt?.n || 0);
  } catch (e) {
    console.error('admin shipments upload: lookup', e?.message);
    return reply({ error: 'Could not upload photos' }, 500);
  }

  const files = formData.getAll('file').filter((f) => f instanceof File);
  if (!files.length) return reply({ error: 'At least one file is required' }, 400);
  if (files.length > SHP_LIMITS.filesPerBatch) return reply({ error: `Upload at most ${SHP_LIMITS.filesPerBatch} photos per batch` }, 400);
  if (files.some((f) => !Object.hasOwn(SHP_IMAGE_TYPES, f.type))) {
    return reply({ error: 'Only JPEG, PNG, WebP or GIF images are allowed' }, 400);
  }
  if (files.some((f) => f.size < 1 || f.size > SHP_LIMITS.maxFileBytes)) {
    return reply({ error: 'Each photo must be between 1 byte and 10 MB' }, 400);
  }
  if (existing + files.length > SHP_LIMITS.photosPerShipment) {
    return reply({ error: `A shipment can have at most ${SHP_LIMITS.photosPerShipment} photos` }, 400);
  }

  let uploaded = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const key = `shipments/${shipmentId}/${crypto.randomUUID()}.${SHP_IMAGE_TYPES[file.type]}`;
    try {
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    } catch (e) {
      console.error('admin shipments upload: put failed', 'shipment', shipmentId, 'file', i, e?.message);
      return reply({ error: 'Upload failed', uploaded }, 500);
    }
    try {
      await db.prepare(
        `INSERT INTO shipment_photos (shipment_id, r2_key, content_type, file_name, size_bytes, caption, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(shipmentId, key, file.type, String(file.name || '').slice(0, 200) || null, file.size, capRes.value,
        admin.username || null, new Date().toISOString()).run();
    } catch (e) {
      console.error('admin shipments upload: insert failed', 'shipment', shipmentId, 'file', i, e?.message);
      try { await env.MEDIA.delete(key); } catch {}
      return reply({ error: 'Upload failed', uploaded }, 500);
    }
    uploaded += 1;
  }

  console.log(`admin shipments: ${admin.username} upload ${no} #${shipmentId} (${uploaded} photo(s))`);
  try {
    return reply({ ok: true, uploaded, orderNo: no, shipments: await shpLoadForOrder(db, no, { admin: true }) });
  } catch (e) {
    console.error('admin shipments upload: reload', e?.message);
    return reply({ ok: true, uploaded, orderNo: no });
  }
}
