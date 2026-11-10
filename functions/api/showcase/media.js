import { json } from '../../_lib/auth.js';
import { requireShowcaseCustomer } from './auth-lib.js';

// GET /api/showcase/media?id=xxx — read a product image stored in D1 (fallback when R2 is off)
// Requires a customer session with Showcase access.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  const gate = await requireShowcaseCustomer(request, env);
  if (gate.response) return gate.response;

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
      // Access-controlled content: never store it in shared caches.
      'Cache-Control': 'private, max-age=86400',
      Vary: 'Cookie',
    },
  });
}
