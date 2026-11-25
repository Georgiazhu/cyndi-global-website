// POST /api/admin/mockup-pdf — store a source PDF sheet for a project's mockups.
// This stores the file only. Automatic AI slicing still requires a vision/PDF
// processing service; until then admins add the cropped product images manually.
import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!await isAuthenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
  const form = await request.formData();
  const projectNo = String(form.get('projectNo') || '').trim().toUpperCase();
  const file = form.get('file');
  if (!projectNo || !(file instanceof File)) return json({ error: 'projectNo and one PDF file are required' }, 400);
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
    return json({ error: 'Only PDF files are allowed' }, 400);
  }
  if (file.size > 20 * 1024 * 1024) return json({ error: 'PDF must be smaller than 20MB' }, 400);

  const safe = projectNo.replace(/[^A-Z0-9_-]/g, '');
  if (!env.MEDIA) {
    if (file.size > 1.5 * 1024 * 1024) {
      return json({ error: 'PDF must be smaller than 1.5MB when media storage is not enabled' }, 400);
    }
    if (!env.DB) return json({ error: 'Storage is not configured' }, 503);
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    await env.DB.prepare(
      'INSERT INTO logistics_media (id, product_no, file_name, content_type, image_data, created_at) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(id, safe, file.name || 'mockups.pdf', 'application/pdf', btoa(binary), new Date().toISOString()).run();
    return json({ ok: true, storage: 'database', url: `/api/media?id=${encodeURIComponent(id)}` });
  }

  const key = `warehouse/${safe}/${crypto.randomUUID()}.pdf`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: 'application/pdf' } });
  return json({ ok: true, storage: 'r2', url: `/api/media?key=${encodeURIComponent(key)}` });
}
