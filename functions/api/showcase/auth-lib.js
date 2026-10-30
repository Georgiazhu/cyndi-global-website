const encoder = new TextEncoder();

/**
 * Standalone showcase account system.
 *
 * Kept separate from the admin console accounts (admin_users):
 *  - showcase_users holds read-only accounts that can view the showcase
 *  - admin_users holds admin accounts that can edit the content
 *
 * The initial HRT / Aa123456 account is written when the table is first created (see functions/api/showcase/auth.js).
 */

const toBase64Url = (bytes) => {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

// Session cookie name.
// Not showcase_session — the shop customer system (product-showcase/functions/_lib/auth.js)
// already owns that name, and the two token formats and signatures differ, so sharing it
const SESSION_COOKIE = 'showcase_gate_session';

export async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Session signing secret. Kept apart from the admin session so they cannot affect each other.
export async function getShowcaseSecret(env) {
  if (env.SHOWCASE_SESSION_SECRET) return env.SHOWCASE_SESSION_SECRET;
  if (env.LOGISTICS_SESSION_SECRET) return env.LOGISTICS_SESSION_SECRET;
  if (env.LOGISTICS_ADMIN_PASSWORD) return env.LOGISTICS_ADMIN_PASSWORD;
  return 'cyndi-showcase-session-secret';
}

// Verify a showcase account. Returns { username, displayName } on success, null on failure.
export async function verifyShowcaseCredentials(env, username, password) {
  const uname = (username || '').trim();
  if (!uname || !password) return null;
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      'SELECT username, password_hash, password_salt, display_name, status FROM showcase_users WHERE username = ?1'
    ).bind(uname).first();
    if (!row) return null;
    if (row.status && row.status !== 'active') return null;
    const expected = await hashPassword(password, row.password_salt);
    if (expected !== row.password_hash) return null;
    return { username: row.username, displayName: row.display_name || row.username };
  } catch {
    return null;
  }
}

// Create a session token: the payload carries the username and expiry, HMAC-signed. Valid for 7 days.
export async function createShowcaseSession(secret, username = '') {
  const payload = JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

// Validate a session, returning { username } or null.
export async function readShowcaseSession(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]+)'));
  if (!match) return null;
  const [encoded, signature] = match[1].split('.');
  if (!encoded || !signature) return null;
  try {
    const expected = await sign(encoded, secret);
    if (expected !== signature) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (!payload || Number(payload.exp) < Date.now()) return null;
    return { username: payload.u || '' };
  } catch {
    return null;
  }
}

// Whether the request is signed in
export async function isShowcaseAuthenticated(request, env) {
  const secret = await getShowcaseSecret(env);
  return !!(await readShowcaseSession(request, secret));
}

export function showcaseSessionCookie(token, secure = true) {
  const maxAge = 60 * 60 * 24 * 7;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearShowcaseSessionCookie(secure = true) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// Table schema (idempotent). Created on first call along with the initial account.
export const SHOWCASE_USERS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS showcase_users (
     username TEXT PRIMARY KEY,
     password_hash TEXT NOT NULL,
     password_salt TEXT NOT NULL,
     display_name TEXT,
     status TEXT NOT NULL DEFAULT 'active',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL)`,
];

// Initial account HRT / Aa123456
export const SHOWCASE_DEFAULT_USER = {
  username: 'HRT',
  password: 'Aa123456',
  displayName: 'HRT',
};
