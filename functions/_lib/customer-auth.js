// 客户会话工具（独立于管理员会话，用 customer_session cookie）。
// 会话 token 用 HMAC-SHA256 签名，payload 含 customer_id 与过期时间。
const encoder = new TextEncoder();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;   // 30 天
const COOKIE_NAME = 'customer_session';

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

// 会话签名密钥：优先环境变量，退回管理员密码 hash 存在的表（保证有个稳定 secret）
function sessionSecret(env) {
  return env.CUSTOMER_SESSION_SECRET || env.LOGISTICS_ADMIN_PASSWORD || 'cyndi-customer-dev-secret';
}

// 密码哈希：SHA-256(password + salt)
export async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createCustomerSession(env, customerId) {
  const payload = JSON.stringify({ cid: customerId, exp: Date.now() + SESSION_TTL_MS });
  const encoded = toBase64Url(encoder.encode(payload));
  const sig = await hmac(encoded, sessionSecret(env));
  return `${encoded}.${sig}`;
}

// 从请求 cookie 解析并校验客户会话，返回 customerId 或 null
export async function getCustomerId(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const [encoded, sig] = m[1].split('.');
  if (!encoded || !sig) return null;
  try {
    const expected = await hmac(encoded, sessionSecret(env));
    if (expected !== sig) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (!payload.cid || Number(payload.exp) < Date.now()) return null;
    return payload.cid;
  } catch {
    return null;
  }
}

// Set-Cookie 头
export function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
