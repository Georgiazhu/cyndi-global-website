import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

async function authorized(request, env) {
  return isAuthenticated(request, await getAdminSecret(env));
}

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  const url = new URL(request.url);
  const productNo = url.searchParams.get('productNo')?.trim().toUpperCase();
  const version = Number(url.searchParams.get('version') || 0);
  if (!productNo) return json({ error: 'productNo is required' }, 400);
  const row = version > 0
    ? await env.DB.prepare('SELECT data_json FROM logistics_record_versions WHERE product_no = ?1 AND version_no = ?2').bind(productNo, version).first()
    : await env.DB.prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1').bind(productNo).first();
  if (!row) return json({ error: 'Logistics record not found' }, 404);
  const history = await env.DB.prepare('SELECT version_no, created_at FROM logistics_record_versions WHERE product_no = ?1 ORDER BY version_no DESC LIMIT 100').bind(productNo).all();
  const current = await env.DB.prepare('SELECT MAX(version_no) AS version_no FROM logistics_record_versions WHERE product_no = ?1').bind(productNo).first();
  try {
    return json({ record: JSON.parse(row.data_json), currentVersion: Number(current?.version_no || 0), history: (history.results || []).map((item) => ({ versionNo: Number(item.version_no), createdAt: item.created_at })) });
  } catch {
    return json({ error: 'Stored logistics data is invalid' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  const record = await request.json().catch(() => null);
  if (!record || !record.productNo || !record.productName) return json({ error: 'productNo and productName are required' }, 400);
  record.productNo = String(record.productNo).trim().toUpperCase();
  record.lastUpdated = record.lastUpdated || new Date().toISOString();
  const createdAt = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT data_json, updated_at FROM logistics_records WHERE product_no = ?1').bind(record.productNo).first();
  if (existing && record.customFields?.inputFormat === 'plain_text' && (!Array.isArray(record.warehouseImages) || !record.warehouseImages.length)) {
    try { record.warehouseImages = JSON.parse(existing.data_json).warehouseImages || []; } catch { record.warehouseImages = []; }
  }
  const recordJson = JSON.stringify(record);
  const size = new TextEncoder().encode(recordJson).byteLength;
  if (size > 1900000) return json({ error: 'This logistics record is too large; keep it below 1.9MB' }, 413);
  const current = await env.DB.prepare('SELECT MAX(version_no) AS version_no FROM logistics_record_versions WHERE product_no = ?1').bind(record.productNo).first();
  let versionNo = Number(current?.version_no || 0) + 1;
  const statements = [];
  if (existing && !Number(current?.version_no || 0)) {
    statements.push(env.DB.prepare('INSERT INTO logistics_record_versions (id, product_no, version_no, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), record.productNo, 1, existing.data_json, existing.updated_at || createdAt));
    versionNo = 2;
  }
  statements.push(env.DB.prepare('INSERT INTO logistics_record_versions (id, product_no, version_no, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), record.productNo, versionNo, recordJson, createdAt));
  statements.push(env.DB.prepare('INSERT INTO logistics_records (product_no, data_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(product_no) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at').bind(record.productNo, recordJson, record.lastUpdated));
  await env.DB.batch(statements);
  return json({ ok: true, productNo: record.productNo, versionNo, lastUpdated: record.lastUpdated });
}
