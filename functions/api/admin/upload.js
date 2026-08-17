import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!await isAuthenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
  const formData = await request.formData();
  const productNo = String(formData.get('productNo') || '').trim().toUpperCase();
  const files = formData.getAll('file').filter((file) => file instanceof File);
  if (!productNo || !files.length) return json({ error: 'productNo and at least one file are required' }, 400);
  if (files.length > 20) return json({ error: 'Upload at most 20 images per batch' }, 400);
  if (files.some((file) => !file.type.startsWith('image/'))) return json({ error: 'Only image files are allowed' }, 400);
  if (files.some((file) => file.size > 10 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 10MB' }, 400);
  if (!env.MEDIA) {
    if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
    if (files.some((file) => file.size > 1.5 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 1.5MB when R2 is not enabled' }, 400);
    const urls = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      await env.DB.prepare('INSERT INTO logistics_media (id, product_no, file_name, content_type, image_data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, productNo, file.name || 'warehouse-image', file.type, btoa(binary), new Date().toISOString()).run();
      urls.push(`/api/media?id=${encodeURIComponent(id)}`);
    }
    return json({ ok: true, storage: 'database', urls, url: urls[0] });
  }
  const urls = [];
  for (const file of files) {
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const key = `warehouse/${productNo}/${crypto.randomUUID()}.${extension}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    urls.push(`/api/media?key=${encodeURIComponent(key)}`);
  }
  return json({ ok: true, storage: 'r2', urls, url: urls[0] });
}
