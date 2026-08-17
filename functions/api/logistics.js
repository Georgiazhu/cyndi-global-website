import { corsHeaders, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const productNo = new URL(request.url).searchParams.get('productNo')?.trim().toUpperCase();
  if (!productNo) return json({ error: 'productNo is required' }, 400, corsHeaders(request));
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, corsHeaders(request));
  const row = await env.DB.prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1').bind(productNo).first();
  if (!row) return json({ error: 'Logistics record not found' }, 404, corsHeaders(request));
  try {
    return json(JSON.parse(row.data_json), 200, corsHeaders(request));
  } catch {
    return json({ error: 'Stored logistics data is invalid' }, 500, corsHeaders(request));
  }
}
