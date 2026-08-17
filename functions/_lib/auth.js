const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function hashText(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function getAdminSecret(env) {
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first();
      if (row?.password_hash) return row.password_hash;
    } catch {}
  }
  return env.LOGISTICS_ADMIN_PASSWORD || '';
}

export async function checkAdminPassword(env, password) {
  if (!password) return false;
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first();
      if (row?.password_hash) return await hashText(password) === row.password_hash;
    } catch {}
  }
  return Boolean(env.LOGISTICS_ADMIN_PASSWORD && password === env.LOGISTICS_ADMIN_PASSWORD);
}

export async function createSession(secret) {
  const payload = `${Date.now() + 1000 * 60 * 60 * 8}`;
  return `${toBase64Url(encoder.encode(payload))}.${await sign(payload, secret)}`;
}

export async function isAuthenticated(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)logistics_admin=([^;]+)/);
  if (!match) return false;
  const [encoded, signature] = match[1].split('.');
  if (!encoded || !signature) return false;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(encoded));
    if (Number(payload) < Date.now()) return false;
    const expected = await sign(payload, secret);
    return expected === signature;
  } catch {
    return false;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } });
}

export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return origin === 'https://www.cyndiglobal.com' || origin === 'https://cyndiglobal.com' ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}
