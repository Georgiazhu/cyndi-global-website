// 客户会话与密码工具（商城 + Showcase 共用同一套客户账户，cookie: customer_session）。
//
// 会话：无状态 token = base64url(JSON{aud:'customer', cid, exp}) + '.' + HMAC-SHA256。
//   - 签名密钥只取 env.CUSTOMER_SESSION_SECRET；没配置就 fail closed（调用方返回 503）。
//   - 校验时要求 aud === 'customer'，所以管理员 token（aud:'admin'）或旧 token 一律无效。
//   - 每次读会话都回查 customers.status，禁用账号的已签发会话立即失效。
//
// 密码：新哈希一律 PBKDF2-SHA256，格式 `pbkdf2$<iterations>$<saltHex>$<hashHex>`（存在 password_hash；
//   password_salt 同步存 saltHex，仅为满足 NOT NULL）。兼容旧格式 SHA-256(password + salt) hex，
//   旧格式登录成功后自动升级。password_hash = '!' 表示"没有可用密码"（只能由管理员重置）。
import { SHOWCASE_ORDERS_WHERE } from './orders.js';

const encoder = new TextEncoder();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;   // 30 天
const COOKIE_NAME = 'customer_session';
// 旧 Showcase 登录门 cookie：不再签发，登出时顺手清掉
const LEGACY_SHOWCASE_COOKIE = 'showcase_gate_session';

// Cloudflare Workers 的 PBKDF2 上限就是 100000 次（更高会抛 NotSupportedError）。
// 可用 CUSTOMER_PBKDF2_ITERATIONS 调低（例如 Workers Free 计划 CPU 紧张时）；校验时按存储值，不受影响。
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_MIN_ITERATIONS = 10000;
export const UNUSABLE_PASSWORD = '!';

export const NOT_CONFIGURED_ERROR = 'Customer sessions are not configured';

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// 常量时间字符串比较（长度不同直接 false）
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

// 会话签名密钥：只认专用环境变量，没有任何兜底。
function sessionSecret(env) {
  const s = env && env.CUSTOMER_SESSION_SECRET;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

export function customerSessionsConfigured(env) {
  return !!sessionSecret(env);
}

// ---------------- 密码 ----------------

function pbkdf2Iterations(env) {
  const n = Number.parseInt(env?.CUSTOMER_PBKDF2_ITERATIONS, 10);
  if (!Number.isFinite(n)) return PBKDF2_MAX_ITERATIONS;
  return Math.min(PBKDF2_MAX_ITERATIONS, Math.max(PBKDF2_MIN_ITERATIONS, n));
}

async function pbkdf2Hex(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

// 旧格式：SHA-256(password + salt) hex（与原 customers / showcase_users 完全一致）
async function legacyHash(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
  return toHex(new Uint8Array(digest));
}

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

// 生成新密码记录 { hash, salt }，写入 customers.password_hash / password_salt
export async function hashPassword(password, env) {
  const iterations = pbkdf2Iterations(env);
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(saltBytes);
  const hashHex = await pbkdf2Hex(password, saltBytes, iterations);
  return { hash: `pbkdf2$${iterations}$${saltHex}$${hashHex}`, salt: saltHex };
}

export function passwordFormat(storedHash) {
  if (typeof storedHash !== 'string' || !storedHash || storedHash === UNUSABLE_PASSWORD) return 'none';
  if (storedHash.startsWith('pbkdf2$')) return 'pbkdf2';
  if (/^[0-9a-f]{64}$/i.test(storedHash)) return 'legacy';
  return 'none';
}

// 校验密码。返回 { ok, needsUpgrade }。
export async function verifyPassword(password, storedHash, storedSalt) {
  if (typeof password !== 'string' || !password) return { ok: false, needsUpgrade: false };
  const format = passwordFormat(storedHash);
  if (format === 'pbkdf2') {
    const [, itRaw, saltHex, hashHex] = storedHash.split('$');
    const iterations = Number.parseInt(itRaw, 10);
    const saltBytes = fromHex(saltHex || '');
    if (!saltBytes || !Number.isFinite(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS || !hashHex) {
      return { ok: false, needsUpgrade: false };
    }
    const actual = await pbkdf2Hex(password, saltBytes, iterations);
    return { ok: safeEqual(actual, hashHex.toLowerCase()), needsUpgrade: false };
  }
  if (format === 'legacy') {
    const actual = await legacyHash(password, storedSalt || '');
    return { ok: safeEqual(actual, storedHash.toLowerCase()), needsUpgrade: true };
  }
  return { ok: false, needsUpgrade: false };
}

// 账号不存在时也做一次同等成本的哈希，避免用响应时间探测账号
let dummyRecord = null;
async function burnPasswordCheck(password, env) {
  if (!dummyRecord) dummyRecord = await hashPassword('dummy-password-for-timing', env);
  await verifyPassword(password || 'x', dummyRecord.hash, dummyRecord.salt);
}

// ---------------- 账户查询 ----------------

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// 用户名不能含 @，这样 "邮箱或用户名" 不会歧义
export const USERNAME_RE = /^[A-Za-z0-9._-]{2,40}$/;

const CUSTOMER_COLUMNS = `c.id, c.email, c.username, c.display_name, c.status, c.client_id, c.showcase_access,
  c.password_hash, c.password_salt, cl.code AS client_code, cl.name AS client_name, cl.status AS client_status`;
const CUSTOMER_FROM = 'FROM customers c LEFT JOIN clients cl ON cl.id = c.client_id';

export async function loadCustomerById(db, id) {
  return db.prepare(`SELECT ${CUSTOMER_COLUMNS} ${CUSTOMER_FROM} WHERE c.id = ?1`).bind(id).first();
}

async function loadCustomerByIdentifier(db, identifier) {
  // 邮箱大小写不敏感（库里统一存小写），用户名精确匹配
  return db.prepare(`SELECT ${CUSTOMER_COLUMNS} ${CUSTOMER_FROM} WHERE lower(c.email) = ?1 OR c.username = ?2 LIMIT 1`)
    .bind(identifier.toLowerCase(), identifier).first();
}

// 公开给前端的用户信息（永不含密码字段）
export function publicUser(row) {
  return {
    email: row.email,
    username: row.username || null,
    displayName: row.display_name || row.username || String(row.email || '').split('@')[0],
  };
}

// 该客户当前是否可以访问 Showcase
export function hasShowcaseAccess(row) {
  if (!row || row.status !== 'active' || Number(row.showcase_access) !== 1) return false;
  if (row.client_id != null && row.client_status !== 'active') return false;
  return true;
}

async function upgradeHash(env, row, password) {
  try {
    const rec = await hashPassword(password, env);
    await env.DB.prepare('UPDATE customers SET password_hash = ?2, password_salt = ?3 WHERE id = ?1 AND password_hash = ?4')
      .bind(row.id, rec.hash, rec.salt, row.password_hash).run();
  } catch (e) {
    console.error('customer auth: hash upgrade failed', e?.message);
  }
}

// 懒迁移：旧 showcase_users 账号第一次登录时转成客户账户，之后该行标记为 migrated，不再使用。
async function migrateShowcaseUser(env, identifier, password, existing) {
  if (!USERNAME_RE.test(identifier)) return null;
  let su;
  try {
    su = await env.DB.prepare(
      'SELECT username, password_hash, password_salt, display_name, status FROM showcase_users WHERE username = ?1'
    ).bind(identifier).first();
  } catch {
    return null; // 表不存在
  }
  if (!su || su.status !== 'active') return null;
  const check = await verifyPassword(password, su.password_hash, su.password_salt);
  if (!check.ok) return null;

  const rec = await hashPassword(password, env);
  const now = new Date().toISOString();
  let customerId;
  if (existing) {
    // 已有同用户名的客户但没有可用密码：补上密码并开通 Showcase
    await env.DB.prepare('UPDATE customers SET password_hash = ?2, password_salt = ?3, showcase_access = 1 WHERE id = ?1')
      .bind(existing.id, rec.hash, rec.salt).run();
    customerId = existing.id;
  } else {
    let clientId = null;
    if (su.username === 'HRT') {
      const cl = await env.DB.prepare("SELECT id FROM clients WHERE code = 'HRT'").first();
      clientId = cl?.id ?? null;
    }
    const email = su.username === 'HRT'
      ? 'hrt@clients.cyndiglobal.invalid'
      : `${su.username.toLowerCase()}@showcase.cyndiglobal.invalid`;
    const taken = await env.DB.prepare('SELECT id FROM customers WHERE lower(email) = ?1').bind(email).first();
    if (taken) {
      console.error(`customer auth: cannot migrate showcase user ${su.username}: placeholder email in use`);
      return null;
    }
    const res = await env.DB.prepare(
      `INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at, client_id, showcase_access, username)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, 1, ?7)`
    ).bind(email, rec.hash, rec.salt, su.display_name || su.username, now, clientId, su.username).run();
    customerId = res.meta?.last_row_id;
  }
  // 历史 Showcase 订单（SHOWCASE-/旧 SC-，notes 以 [showcase:<username>] 开头、尚未关联客户）归到这个账户
  const tag = `[showcase:${su.username}]`;
  await env.DB.prepare(
    `UPDATE orders SET customer_id = ?1
     WHERE ${SHOWCASE_ORDERS_WHERE} AND customer_id IS NULL AND substr(notes, 1, length(?2)) = ?2`
  ).bind(customerId, tag).run();
  await env.DB.prepare("UPDATE showcase_users SET status = 'migrated', updated_at = ?2 WHERE username = ?1")
    .bind(su.username, now).run();
  console.log(`customer auth: migrated showcase user ${su.username} -> customer ${customerId}`);
  return loadCustomerById(env.DB, customerId);
}

/**
 * 用 "邮箱或用户名" + 密码认证。
 * 返回 { status: 'ok', customer } | { status: 'invalid' } | { status: 'disabled' }。
 * 'disabled' 只在密码正确时返回，错误密码一律 'invalid'（不暴露账号是否存在）。
 */
export async function authenticateCustomer(env, rawIdentifier, password) {
  const identifier = String(rawIdentifier || '').trim();
  if (!identifier || typeof password !== 'string' || !password || identifier.length > 254 || password.length > 256) {
    return { status: 'invalid' };
  }
  let row = await loadCustomerByIdentifier(env.DB, identifier);

  if (row && passwordFormat(row.password_hash) !== 'none') {
    const check = await verifyPassword(password, row.password_hash, row.password_salt);
    if (!check.ok) return { status: 'invalid' };
    if (row.status !== 'active') return { status: 'disabled' };
    if (check.needsUpgrade) await upgradeHash(env, row, password);
    return { status: 'ok', customer: row };
  }

  // 没有可用的客户密码：试一次旧 showcase_users（仅按用户名）
  const migrated = await migrateShowcaseUser(env, identifier, password, row && row.username === identifier ? row : null);
  if (migrated) {
    if (migrated.status !== 'active') return { status: 'disabled' };
    return { status: 'ok', customer: migrated };
  }
  if (!row) await burnPasswordCheck(password, env);
  return { status: 'invalid' };
}

// ---------------- 会话 ----------------

export async function createCustomerSession(env, customerId) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error(NOT_CONFIGURED_ERROR);
  const payload = JSON.stringify({ aud: 'customer', cid: customerId, exp: Date.now() + SESSION_TTL_MS });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export function hasCustomerCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  return new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=[^;]+`).test(cookie);
}

// 只校验签名/aud/过期，返回 customerId 或 null（不查库；需要状态请用 readCustomerSession）
export async function getCustomerId(request, env) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const [encoded, sig] = m[1].split('.');
  if (!encoded || !sig) return null;
  try {
    const expected = await hmac(encoded, secret);
    if (!safeEqual(expected, sig)) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (!payload || payload.aud !== 'customer' || !payload.cid || !(Number(payload.exp) >= Date.now())) return null;
    return payload.cid;
  } catch {
    return null;
  }
}

/**
 * 读当前客户会话，并确认账户仍是 active。
 * 返回 { configured: false } | { configured: true, customer: row|null }。
 */
export async function readCustomerSession(request, env) {
  if (!sessionSecret(env)) return { configured: false, customer: null };
  const cid = await getCustomerId(request, env);
  if (!cid) return { configured: true, customer: null };
  const row = await loadCustomerById(env.DB, cid);
  if (!row || row.status !== 'active') return { configured: true, customer: null };
  return { configured: true, customer: row };
}

const isHttps = (request) => new URL(request.url).protocol === 'https:';

// Set-Cookie 头（https 下加 Secure）
export function sessionCookie(token, request) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${request && isHttps(request) ? '; Secure' : ''}`;
}

export function clearCookie(request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${request && isHttps(request) ? '; Secure' : ''}`;
}

export function clearLegacyShowcaseCookie(request) {
  return `${LEGACY_SHOWCASE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${request && isHttps(request) ? '; Secure' : ''}`;
}

// JSON 响应，可带多个 Set-Cookie
export function jsonWithCookies(data, status, headers, cookies = []) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...headers });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), { status, headers: h });
}
