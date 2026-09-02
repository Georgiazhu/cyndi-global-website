import { getAdminSecret, isAuthenticated, json } from '../../_lib/auth.js';

// POST /api/admin/product-upload —— 商品图上传到 R2，返回公开 URL。
// 表单字段：spu（必填，用于组织 key）、file（可多个图片）。
// R2 key: images/products/<spu>/<uuid>.<ext>
// 公开 URL: {R2_PUBLIC_BASE}/images/products/<spu>/<uuid>.<ext>
//   R2_PUBLIC_BASE 环境变量（生产设 https://img.cyndiglobal.com）；未设时用相对 /images/products（本地）。
export async function onRequestPost({ request, env }) {
  if (!await isAuthenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);

  const form = await request.formData();
  const spu = String(form.get('spu') || '').trim();
  const files = form.getAll('file').filter((f) => f instanceof File);
  if (!spu) return json({ error: 'spu is required' }, 400);
  if (!files.length) return json({ error: 'At least one file is required' }, 400);
  if (files.length > 20) return json({ error: 'Upload at most 20 images per batch' }, 400);
  if (files.some((f) => !f.type.startsWith('image/'))) return json({ error: 'Only image files are allowed' }, 400);
  if (files.some((f) => f.size > 10 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 10MB' }, 400);

  if (!env.MEDIA) {
    return json({ error: 'R2 (MEDIA binding) is not configured. Image upload needs R2 in production.' }, 503);
  }

  const publicBase = (env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  const urls = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const key = `images/products/${spu}/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    // 公开 URL：有 R2_PUBLIC_BASE 用绝对 URL，否则相对路径
    urls.push(publicBase ? `${publicBase}/${key}` : `/${key}`);
  }
  return json({ ok: true, urls, url: urls[0] });
}
