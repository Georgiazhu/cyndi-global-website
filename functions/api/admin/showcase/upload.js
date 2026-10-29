import { getAdminSecret, isAuthenticated, json } from '../../../_lib/auth.js';

// POST /api/admin/showcase/upload —— 上传选品图片
// multipart: file（可多张）, categoryId
// 优先存 R2（bucket cyndi-products）；未启用 R2 时回退 D1 表 showcase_media。
export async function onRequestPost({ request, env }) {
  if (!await isAuthenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);

  const formData = await request.formData();
  const files = formData.getAll('file').filter((f) => f instanceof File);
  const categoryId = String(formData.get('categoryId') || 'misc').trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'misc';

  if (!files.length) return json({ error: 'at least one file is required' }, 400);
  if (files.length > 20) return json({ error: 'Upload at most 20 images per batch' }, 400);
  if (files.some((f) => !f.type.startsWith('image/'))) return json({ error: 'Only image files are allowed' }, 400);
  if (files.some((f) => f.size > 10 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 10MB' }, 400);

  const urls = [];

  if (env.MEDIA) {
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const key = `showcase/${categoryId}/${crypto.randomUUID()}.${ext}`;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      const base = env.R2_PUBLIC_BASE || 'https://img.cyndiglobal.com';
      urls.push(`${String(base).replace(/\/$/, '')}/${key}`);
    }
    return json({ ok: true, storage: 'r2', urls, url: urls[0] });
  }

  // 回退：存 D1
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (files.some((f) => f.size > 1.5 * 1024 * 1024)) {
    return json({ error: 'Each image must be smaller than 1.5MB when R2 is not enabled' }, 400);
  }
  for (const file of files) {
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    await env.DB.prepare(
      'INSERT INTO showcase_media (id, category_id, file_name, content_type, image_data, created_at) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(id, categoryId, file.name || 'image', file.type, btoa(binary), new Date().toISOString()).run();
    urls.push(`/api/showcase/media?id=${encodeURIComponent(id)}`);
  }
  return json({ ok: true, storage: 'database', urls, url: urls[0] });
}
