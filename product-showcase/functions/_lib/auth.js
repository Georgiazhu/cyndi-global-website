// Shared auth helpers for product-showcase user authentication.
// Uses Web Crypto (available in Cloudflare Workers/Pages Functions runtime).

const encoder = new TextEncoder();
const SESSION_COOKIE = 'showcase_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function base64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hashPassword(password) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(left, right) {
  const leftBytes = encoder.encode(String(left));
  const rightBytes = encoder.encode(String(right));
  return leftBytes.byteLength === rightBytes.byteLength && crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

// Create a signed session token embedding userId and expiry.
export async function createSession(userId, secret) {
  const payload = base64Url(encoder.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })));
  const signature = await sign(payload, secret);
  return payload + '.' + signature;
}

// Verify a session token, returning the userId or null.
export async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    if (await sign(payload, secret) !== signature) return null;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (!data.uid || Number(data.exp) < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function getSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]+)'));
  return match ? match[1] : null;
}

export function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

// Resolve the currently authenticated user from the request, or null.
export async function getAuthenticatedUser(request, env) {
  if (!env.DB) return null;
  const token = getSessionToken(request);
  const userId = await verifySession(token, env.SESSION_SECRET);
  if (!userId) return null;
  const row = await env.DB.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?1').bind(userId).first();
  return row || null;
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
