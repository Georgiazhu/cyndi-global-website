import { getAdminSecret, json, readSession } from '../../_lib/auth.js';
import { readCustomerSession } from '../../_lib/customer-auth.js';
import { isShowcaseOrderNo } from '../../_lib/orders.js';
import { SHP_IMAGE_TYPES, shpId } from '../../_lib/shipments.js';

// GET /api/orders/shipment-photo?orderNo=<no>&id=<photoId> —— 物流照片字节代理
// Same ownership rule as GET /api/orders:
//  - admin session -> allowed
//  - SW- -> public to whoever knows the order number
//  - SHOWCASE- / legacy SC- -> only the owning customer (customer_session id == orders.customer_id)
// Every denial is a 404 indistinguishable from "not found". Requiring orderNo stops id enumeration.
export async function onRequestGet({ request, env }) {
  const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const notFound = () => json({ error: 'Not found' }, 404, noStore);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, noStore);
  if (!env.MEDIA) return notFound();

  const params = new URL(request.url).searchParams;
  const orderNo = (params.get('orderNo') || '').trim();
  const type = orderNo.startsWith('SW-') ? 'SW' : isShowcaseOrderNo(orderNo) ? 'SC' : null;
  if (!type) return notFound();
  const idRes = shpId(params.get('id') || '');
  if (idRes.error) return notFound();

  let row;
  try {
    row = await env.DB.prepare(
      `SELECT p.r2_key, p.content_type, o.order_no, o.customer_id
       FROM shipment_photos p
       JOIN shipments s ON s.id = p.shipment_id
       JOIN orders o ON o.order_no = s.order_no
       WHERE p.id = ?1 AND s.order_no = ?2`
    ).bind(idRes.value, orderNo).first();
  } catch (e) {
    console.error('shipment-photo: lookup', e?.message);
    return notFound();
  }
  if (!row) return notFound();

  const admin = await readSession(request, await getAdminSecret(env));
  if (!admin && type === 'SC') {
    const session = await readCustomerSession(request, env);
    if (!session.customer || row.customer_id == null || Number(row.customer_id) !== Number(session.customer.id)) return notFound();
  }

  if (!Object.hasOwn(SHP_IMAGE_TYPES, row.content_type)) return notFound();

  let obj;
  try {
    obj = await env.MEDIA.get(row.r2_key);
  } catch (e) {
    console.error('shipment-photo: r2 get', e?.message);
    return notFound();
  }
  if (!obj) return notFound();

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': 'private, max-age=3600',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    },
  });
}
