// Public customer Portal self-registration.
// Any valid email can request a code, verify it, create a viewer account and
// choose a password. No admin pre-creation, domain allowlist or approval gate.

import { ensurePortalSchema } from './portal.js';
import {
  CODE_TTL_MS,
  fromBase64Url,
  randomHex,
  safeEqual,
  sha256Hex,
  sign,
  toBase64Url,
} from './password-reset.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function createRegistrationCode(db, email, code) {
  await ensurePortalSchema(db);
  const normalized = String(email || '').trim().toLowerCase();
  const salt = randomHex(16);
  const codeHash = await sha256Hex(`${salt}:${code}`);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  try {
    await db.prepare('DELETE FROM portal_registrations WHERE email = ?1 AND created_at < ?2')
      .bind(normalized, cutoff).run();
  } catch {}

  const res = await db.prepare(`
    INSERT INTO portal_registrations (email, code_hash, salt, attempts, expires_at, created_at)
    VALUES (?1, ?2, ?3, 0, ?4, ?5)
  `).bind(normalized, codeHash, salt, expiresAt, createdAt).run();
  return res.meta?.last_row_id;
}

export async function consumeRegistrationCode(db, email, code) {
  await ensurePortalSchema(db);
  const normalized = String(email || '').trim().toLowerCase();
  const value = String(code || '').trim();
  if (!normalized || !/^\d{6}$/.test(value)) {
    return { ok: false, reason: 'invalid', message: 'Enter the 6-digit code we sent.' };
  }

  const row = await db.prepare(`
    SELECT * FROM portal_registrations
    WHERE lower(email) = ?1 AND used_at IS NULL AND registered_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).bind(normalized).first();

  if (!row) return { ok: false, reason: 'invalid', message: 'This code is invalid or has already been used.' };
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    return { ok: false, reason: 'expired', message: 'This code has expired. Please request a new one.' };
  }
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many', message: 'Too many attempts. Please request a new code.' };
  }

  await db.prepare('UPDATE portal_registrations SET attempts = attempts + 1 WHERE id = ?1')
    .bind(row.id).run();

  const expected = await sha256Hex(`${row.salt}:${value}`);
  if (!safeEqual(expected, row.code_hash)) {
    return { ok: false, reason: 'invalid', message: 'That code is not correct. Please try again.' };
  }

  await db.prepare('UPDATE portal_registrations SET used_at = ?2 WHERE id = ?1')
    .bind(row.id, new Date().toISOString()).run();
  return { ok: true, email: normalized, recordId: row.id };
}

export async function createRegistrationToken(env, { recordId, email }) {
  const secret = env?.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error('Customer sessions are not configured');
  const payload = JSON.stringify({
    aud: 'portal-register',
    rid: recordId,
    email,
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function readRegistrationToken(env, token) {
  const secret = env?.CUSTOMER_SESSION_SECRET;
  if (!secret) return null;
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  try {
    const expected = await sign(encoded, secret);
    if (!safeEqual(expected, sig)) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(encoded)));
    if (!payload || payload.aud !== 'portal-register' || !payload.rid || !payload.email) return null;
    if (!(Number(payload.exp) >= Date.now())) return null;
    return { recordId: payload.rid, email: String(payload.email).toLowerCase() };
  } catch {
    return null;
  }
}
