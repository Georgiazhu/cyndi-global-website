// POST /api/portal/register/complete { token, password, displayName? }
// Creates a viewer-level customer account for a verified email and signs them in.

import { corsHeaders } from '../../../_lib/auth.js';
import {
  EMAIL_RE,
  createCustomerSession,
  customerSessionsConfigured,
  hashPassword,
  jsonWithCookies,
  publicUser,
  sessionCookie,
} from '../../../_lib/customer-auth.js';
import { ensurePortalSchema, getProjectForCustomer } from '../../../_lib/portal.js';
import { readRegistrationToken } from '../../../_lib/portal-registration.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Origin' };
const PW_RE_UPPER = /[A-Z]/;
const PW_RE_NUM = /[0-9]/;

async function readBody(request) {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function displayNameFromEmail(email, raw) {
  if (typeof raw === 'string' && raw.trim()) {
    const v = raw.trim().slice(0, 60);
    if (/^[\p{L}\p{N} ._'-]+$/u.test(v)) return v;
  }
  const local = email.split('@')[0] || 'Customer';
  return local.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Customer';
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  const headers = { ...NO_STORE, ...cors };
  if (!env.DB) return jsonWithCookies({ error: 'Database binding is not configured' }, 503, headers);
  if (!customerSessionsConfigured(env)) {
    return jsonWithCookies({ error: 'Customer sessions are not configured' }, 503, headers);
  }

  const body = await readBody(request);
  if (!body) return jsonWithCookies({ error: 'Invalid JSON body' }, 400, headers);

  const claims = await readRegistrationToken(env, body.token);
  if (!claims) {
    return jsonWithCookies({ error: 'This verification link is invalid or has expired. Please request a new code.' }, 400, headers);
  }
  const email = String(claims.email || '').toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return jsonWithCookies({ error: 'Invalid email address' }, 400, headers);
  }

  const password = body.password;
  if (typeof password !== 'string') return jsonWithCookies({ error: 'password is required' }, 400, headers);
  if (password.length < 8 || password.length > 128) {
    return jsonWithCookies({ error: 'Password must be 8–128 characters' }, 400, headers);
  }
  if (!PW_RE_UPPER.test(password)) {
    return jsonWithCookies({ error: 'Password must include an uppercase letter' }, 400, headers);
  }
  if (!PW_RE_NUM.test(password)) {
    return jsonWithCookies({ error: 'Password must include a number' }, 400, headers);
  }

  await ensurePortalSchema(env.DB);
  const record = await env.DB.prepare('SELECT * FROM portal_registrations WHERE id = ?1')
    .bind(claims.recordId).first();
  if (!record || String(record.email).toLowerCase() !== email || !record.used_at || record.registered_at) {
    return jsonWithCookies({ error: 'This verification has already been used. Please request a new code.' }, 400, headers);
  }

  const duplicate = await env.DB.prepare('SELECT id FROM customers WHERE lower(email) = ?1').bind(email).first();
  if (duplicate) {
    return jsonWithCookies({ error: 'An account with this email already exists. Please sign in or reset your password.' }, 409, headers);
  }

  const rec = await hashPassword(password, env);
  const nowIso = new Date().toISOString();
  const displayName = displayNameFromEmail(email, body.displayName);
  const result = await env.DB.prepare(`
    INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at,
      portal_role, must_change_password, showcase_access, client_id)
    VALUES (?1, ?2, ?3, ?4, 'active', ?5, 'viewer', 0, 0, NULL)
  `).bind(email, rec.hash, rec.salt, displayName, nowIso).run();
  const customerId = result.meta?.last_row_id;

  await env.DB.prepare('UPDATE portal_registrations SET registered_at = ?2 WHERE id = ?1')
    .bind(claims.recordId, nowIso).run();

  // New members should land on a real Project screen immediately.
  try { await getProjectForCustomer(env.DB, customerId); } catch (e) {
    console.error('portal register: project seed failed', e?.message);
  }

  const row = await env.DB.prepare('SELECT * FROM customers WHERE id = ?1').bind(customerId).first();
  const token = await createCustomerSession(env, customerId);
  return jsonWithCookies({ ok: true, user: publicUser(row) }, 200, headers, [sessionCookie(token, request)]);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}
