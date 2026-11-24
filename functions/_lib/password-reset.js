// Customer Portal forgot-password support.
// Codes are stored as salted SHA-256 hashes only. The signed reset token is
// short-lived and single-use (bound to the verification record id).

import { ensurePortalSchema } from './portal.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CODE_TTL_MS = 15 * 60 * 1000;
export const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function randomHex(bytes = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

export async function findCustomerByEmail(db, email) {
  await ensurePortalSchema(db);
  return db.prepare(
    'SELECT id, email, display_name, status FROM customers WHERE lower(email) = ?1 LIMIT 1'
  ).bind(String(email || '').trim().toLowerCase()).first();
}

export async function createResetRecord(db, customer, code) {
  await ensurePortalSchema(db);
  const salt = randomHex(16);
  const codeHash = await sha256Hex(`${salt}:${code}`);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();

  // Keep only recent codes for this customer.
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    await db.prepare('DELETE FROM portal_password_resets WHERE customer_id = ?1 AND created_at < ?2')
      .bind(customer.id, cutoff).run();
  } catch {}

  const res = await db.prepare(`
    INSERT INTO portal_password_resets (customer_id, email, code_hash, salt, attempts, expires_at, created_at)
    VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)
  `).bind(customer.id, String(customer.email || '').toLowerCase(), codeHash, salt, expiresAt, createdAt).run();
  return res.meta?.last_row_id;
}

/**
 * Verify the submitted code and consume it.
 * Returns { ok: true, customerId, recordId } or { ok: false, reason, message }.
 */
export async function consumeResetCode(db, email, code) {
  await ensurePortalSchema(db);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const value = String(code || '').trim();
  if (!normalizedEmail || !/^\d{6}$/.test(value)) return { ok: false, reason: 'invalid', message: 'Enter the 6-digit code we sent.' };

  const row = await db.prepare(`
    SELECT r.* FROM portal_password_resets r
    WHERE lower(r.email) = ?1 AND r.used_at IS NULL AND r.reset_at IS NULL
    ORDER BY r.id DESC LIMIT 1
  `).bind(normalizedEmail).first();

  if (!row) return { ok: false, reason: 'invalid', message: 'This code is invalid or has already been used.' };

  const nowIso = new Date().toISOString();
  if (row.expires_at && row.expires_at <= nowIso) {
    return { ok: false, reason: 'expired', message: 'This code has expired. Please request a new one.' };
  }
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many', message: 'Too many attempts. Please request a new code.' };
  }

  await db.prepare('UPDATE portal_password_resets SET attempts = attempts + 1 WHERE id = ?1')
    .bind(row.id).run();

  const expected = await sha256Hex(`${row.salt}:${value}`);
  if (!safeEqual(expected, row.code_hash)) {
    return { ok: false, reason: 'invalid', message: 'That code is not correct. Please try again.' };
  }

  await db.prepare('UPDATE portal_password_resets SET used_at = ?2 WHERE id = ?1')
    .bind(row.id, nowIso).run();
  return { ok: true, customerId: row.customer_id, recordId: row.id };
}

export async function createResetToken(env, { recordId, customerId }) {
  const secret = env?.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error('Customer sessions are not configured');
  const payload = JSON.stringify({
    aud: 'password-reset',
    rid: recordId,
    cid: customerId,
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function readResetToken(env, token) {
  const secret = env?.CUSTOMER_SESSION_SECRET;
  if (!secret) return null;
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  try {
    const expected = await sign(encoded, secret);
    if (!safeEqual(expected, sig)) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(encoded)));
    if (!payload || payload.aud !== 'password-reset' || !payload.rid || !payload.cid) return null;
    if (!(Number(payload.exp) >= Date.now())) return null;
    return { recordId: payload.rid, customerId: payload.cid };
  } catch {
    return null;
  }
}
