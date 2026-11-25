// POST /api/portal/mockup-upload — client uploads their own design for a project.
// Uses the same customer session as the dashboard and stores only image files.
import { corsHeaders, json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession } from '../../_lib/customer-auth.js';

const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

async function session(request, env) {
  const cors = { ...corsHeaders(request), ...NO_STORE };
  if (!env.DB) return { error: json({ error: 'Database binding is not configured' }, 503, cors) };
  const s = await readCustomerSession(request, env);
  if (!s.configured) return { error: json({ error: NOT_CONFIGURED_ERROR }, 503, cors) };
  if (!s.customer) return { error: json({ error: 'Not signed in' }, 401, cors) };
  return { customer: s.customer, cors };
}

export async function onRequestPost({ request, env }) {
  const s = await session(request, env);
  if (s.error) return s.error;

  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid upload' }, 400, s.cors); }
  const projectNo = String(form.get('projectNo') || '').trim().toUpperCase();
  const file = form.get('file');
  if (!projectNo || !(file instanceof File)) {
    return json({ error: 'projectNo and one image file are required' }, 400, s.cors);
  }
  if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, 400, s.cors);
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Image must be smaller than 10MB' }, 400, s.cors);

  const owned = await env.DB.prepare(
    'SELECT project_no FROM client_projects WHERE project_no = ?1 AND user_id = ?2'
  ).bind(projectNo, String(s.customer.id)).first();
  if (!owned) return json({ error: 'Project not found' }, 404, s.cors);

  const name = file.name || 'client-design';
  const extension = (name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const safe = projectNo.replace(/[^A-Z0-9_-]/g, '');

  if (!env.MEDIA) {
    if (file.size > 1.5 * 1024 * 1024) {
      return json({ error: 'Image must be smaller than 1.5MB when media storage is not enabled' }, 400, s.cors);
    }
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    await env.DB.prepare(
      'INSERT INTO logistics_media (id, product_no, file_name, content_type, image_data, created_at) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(id, safe, name, file.type, btoa(binary), new Date().toISOString()).run();
    return json({ ok: true, storage: 'database', url: `/api/media?id=${encodeURIComponent(id)}` }, 200, s.cors);
  }

  const key = `warehouse/${safe}/${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ ok: true, storage: 'r2', url: `/api/media?key=${encodeURIComponent(key)}` }, 200, s.cors);
}
