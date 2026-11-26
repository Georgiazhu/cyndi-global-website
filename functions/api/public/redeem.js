// /api/public/redeem — no-login redemption endpoints for M3 Personal links and
// M4 Open portal (HRT spec §5.2). Anonymous by design; fails closed on errors.
//  GET  ?token=<invite token> | ?slug=<portal slug>
//  POST { token?, slug?, contact:{name,email}, shipping:{...}, items:[{productId,colorId,size,qty}] }
import { json } from '../../_lib/auth.js';
import {
  ensureRedemptionSchema, getPublicRedemption, submitRedemption,
  shippingCountries,
} from '../../_lib/redemption.js';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  ReferrerPolicy: 'no-referrer',
};
const reply = (data, status = 200) => json(data, status, HEADERS);

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Service unavailable' }, 503);
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const slug = url.searchParams.get('slug') || '';
  if (!token && !slug) return reply({ error: 'A link token or portal slug is required' }, 400);
  try {
    await ensureRedemptionSchema(env.DB);
    const data = await getPublicRedemption(env.DB, { token, slug });
    return reply({ ...data, countries: shippingCountries() });
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('public redeem GET:', e?.message);
    return reply({ error: e?.message || 'This portal is not available' }, status);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Service unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON body' }, 400); }
  const token = String(body?.token || '').slice(0, 128);
  const slug = String(body?.slug || '').slice(0, 128);
  if (!token && !slug) return reply({ error: 'A link token or portal slug is required' }, 400);
  try {
    const result = await submitRedemption(env.DB, env, {
      token, slug,
      contact: body?.contact,
      shipping: body?.shipping,
      items: body?.items,
      ip: clientIp(request),
    });
    return reply(result, 201);
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('public redeem POST:', e?.message);
    return reply({
      error: e?.message || 'Could not submit your order',
      code: e?.code || undefined,
      shortages: e?.shortages || undefined,
    }, status);
  }
}
