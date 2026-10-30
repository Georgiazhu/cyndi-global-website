const encoder = new TextEncoder();

/**
 * Showcase 独立账号体系。
 *
 * 与后台管理账号（admin_users）分开：
 *  - showcase_users 用于「访问展示站」的只读账号
 *  - admin_users  用于「编辑内容」的管理员账号
 *
 * 初始账号 HRT / Aa123456 在表首次创建时自动写入（见 functions/api/showcase/auth.js）。
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

// 会话 cookie 名。
// 不能用 showcase_session —— 商城客户体系（product-showcase/functions/_lib/auth.js）
// 已经占用了这个名字，且两套的 token 格式与签名方式不同，共用会互相覆盖。
const SESSION_COOKIE = 'showcase_gate_session';

export async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// 会话签名密钥。与管理员会话分开，避免互相影响。
export async function getShowcaseSecret(env) {
  if (env.SHOWCASE_SESSION_SECRET) return env.SHOWCASE_SESSION_SECRET;
  if (env.LOGISTICS_SESSION_SECRET) return env.LOGISTICS_SESSION_SECRET;
  if (env.LOGISTICS_ADMIN_PASSWORD) return env.LOGISTICS_ADMIN_PASSWORD;
  return 'cyndi-showcase-session-secret';
}

// 校验 showcase 账号。成功返回 { username, displayName }，失败返回 null。
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

// 创建会话 token：payload 含 username 与过期时间，HMAC 签名。有效期 7 天。
export async function createShowcaseSession(secret, username = '') {
  const payload = JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

// 校验会话，返回 { username } 或 null。
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

// 是否已登录
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

// 表结构（幂等）。首次调用时自动建表并写入初始账号。
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

// 初始账号 HRT / Aa123456
export const SHOWCASE_DEFAULT_USER = {
  username: 'HRT',
  password: 'Aa123456',
  displayName: 'HRT',
};
