export async function onRequestGet({ request, env }) {
  const query = new URL(request.url).searchParams;
  const id = query.get('id');
  if (id && env.DB && /^[a-f0-9-]{36}$/i.test(id)) {
    const row = await env.DB.prepare('SELECT content_type, image_data FROM logistics_media WHERE id = ?1').bind(id).first();
    if (!row) return new Response('Not found', { status: 404 });
    const binary = atob(row.image_data);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': row.content_type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (!env.MEDIA) return new Response('Media binding is not configured', { status: 503 });
  const key = query.get('key');
  if (!key || !/^warehouse\/[A-Z0-9_-]+\/[a-z0-9-]+\.[a-z0-9]+$/i.test(key)) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}
