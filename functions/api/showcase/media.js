import { json } from '../../_lib/auth.js';
import { isShowcaseAuthenticated } from './auth-lib.js';

// GET /api/showcase/media?id=xxx — read a product image stored in D1 (fallback when R2 is off)
// Requires a valid showcase session.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  if (!await isShowcaseAuthenticated(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const row = await env.DB.prepare(
    'SELECT content_type, image_data FROM showcase_media WHERE id = ?1'
  ).bind(id).first();

  if (!row?.image_data) return new Response('Not found', { status: 404 });

  const binary = atob(row.image_data);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': row.content_type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
