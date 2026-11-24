// GET /api/portal/download?productId=...&type=spec|info — Senior 专属：产品资料下载。
// 服务端强制校验角色（viewer 返回 403），前端隐藏按钮不是唯一防线。
// 生成 UTF-8 文本资料（含 BOM，Excel 可直接打开），无需额外依赖或二进制打包。
import { corsHeaders, json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, customerSessionsConfigured, readCustomerSession } from '../../_lib/customer-auth.js';
import { isSenior } from '../../_lib/portal.js';

export async function onRequestGet({ request, env }) {
  const cors = { ...corsHeaders(request), Vary: 'Cookie' };
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  if (!session.customer) return json({ error: 'Not signed in' }, 401, cors);
  if (!isSenior(session.customer)) return json({ error: 'This download requires Senior access' }, 403, cors);

  const params = new URL(request.url).searchParams;
  const productId = (params.get('productId') || '').trim();
  if (!productId || productId.length > 200) return json({ error: 'Invalid productId' }, 400, cors);

  try {
    const p = await env.DB.prepare('SELECT * FROM showcase_products WHERE id = ?1').bind(productId).first();
    if (!p) return json({ error: 'Product not found' }, 404, cors);
    const lines = [];
    lines.push('CYNDI GLOBAL — PRODUCT SPECIFICATION');
    lines.push('=====================================');
    lines.push(`Product : ${p.name || ''}`);
    lines.push(`SKU     : ${p.sku || productId}`);
    lines.push(`Category: ${p.category_id || ''}`);
    lines.push(`MOQ     : ${p.moq ?? ''}`);
    lines.push(`Lead time: ${p.lead_time ?? ''} working days`);
    lines.push(`Materials: ${p.materials || ''}`);
    if (p.description) lines.push('', 'DESCRIPTION', p.description);
    if (p.spec) lines.push('', 'SPECIFICATION', p.spec);
    if (p.size_chart) {
      lines.push('', 'SIZE CHART');
      try {
        const sc = typeof p.size_chart === 'string' ? JSON.parse(p.size_chart) : p.size_chart;
        if (Array.isArray(sc)) sc.forEach((row) => lines.push(typeof row === 'object' ? JSON.stringify(row) : String(row)));
        else lines.push(String(sc));
      } catch { lines.push(String(p.size_chart)); }
    }
    const parseArr = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
    const features = parseArr(p.features_json);
    if (features.length) lines.push('', 'FEATURES', ...features.map((f) => `- ${f}`));
    const colors = parseArr(p.colors_json).map((c) => (typeof c === 'object' ? c.name : c)).filter(Boolean);
    if (colors.length) lines.push('', 'COLOURS', colors.join(', '));
    const sizes = parseArr(p.sizes_json).map((s) => (typeof s === 'object' ? (s.name || s.label) : s)).filter(Boolean);
    if (sizes.length) lines.push('', 'SIZES', sizes.join(', '));
    if (p.image) lines.push('', 'MAIN IMAGE', p.image);
    const gallery = parseArr(p.gallery_json);
    if (gallery.length) lines.push('', 'IMAGE ASSETS', ...gallery.map((u, i) => `${i + 1}. ${u}`));
    lines.push('', `Generated: ${new Date().toISOString()}`, 'Confidential — for authorised recipients only.');

    const body = '\uFEFF' + lines.join('\r\n');
    const safe = (p.sku || p.id || 'product').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="CyndiGlobal_${safe}_spec.txt"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('portal download:', e?.message);
    return json({ error: 'Could not generate download' }, 500, cors);
  }
}
