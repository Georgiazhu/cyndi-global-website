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

// 加盐密码哈希：SHA-256(password + salt)
export async function hashAdminPassword(password, salt) {
  return hashText(password + salt);
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 会话签名密钥：稳定即可（与具体管理员无关）。
// 优先专用 secret，其次沿用管理员密码环境变量，最后 dev 默认。
export async function getAdminSecret(env) {
  if (env.LOGISTICS_SESSION_SECRET) return env.LOGISTICS_SESSION_SECRET;
  if (env.LOGISTICS_ADMIN_PASSWORD) return env.LOGISTICS_ADMIN_PASSWORD;
  // 退回原单密码表的 hash（历史行为），保证有个稳定 secret
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first();
      if (row?.password_hash) return row.password_hash;
    } catch {}
  }
  return 'cyndi-admin-dev-secret';
}

// 校验管理员账号（username + password）。
// 1) 先查 admin_users 表（多账号、加盐哈希）
// 2) 兜底：环境变量 LOGISTICS_ADMIN_PASSWORD（无 username 概念，任何 username 都可配合它登录）
// 3) 兜底：原 logistics_admin_settings 单密码表（裸 SHA-256）
// 成功返回 { username, displayName }，失败返回 null。
export async function verifyAdminCredentials(env, username, password) {
  const uname = (username || '').trim();
  if (!password) return null;

  let hasAdminUsers = false;
  if (env.DB) {
    try {
      if (uname) {
        const row = await env.DB.prepare(
          'SELECT username, password_hash, password_salt, display_name, status FROM admin_users WHERE username = ?1'
        ).bind(uname).first();
        if (row) {
          if (row.status && row.status !== 'active') return null;
          const expected = await hashAdminPassword(password, row.password_salt);
          return expected === row.password_hash
            ? { username: row.username, displayName: row.display_name || row.username }
            : null;
        }
      }
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users WHERE status = ?1').bind('active').first();
      hasAdminUsers = Number(cnt?.n || 0) > 0;
    } catch { hasAdminUsers = false; }
  }

  // 存在 admin_users 账号时，用户名权威：未匹配即失败，不落旧单密码
  if (hasAdminUsers) return null;

  // 兜底一：环境变量单密码
  if (env.LOGISTICS_ADMIN_PASSWORD && password === env.LOGISTICS_ADMIN_PASSWORD) {
    return { username: uname || 'admin', displayName: uname || 'Administrator' };
  }

  // 兜底二：原单密码表（裸 SHA-256）
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first();
      if (row?.password_hash && (await hashText(password)) === row.password_hash) {
        return { username: uname || 'admin', displayName: uname || 'Administrator' };
      }
    } catch {}
  }

  return null;
}

// 会话 token：payload 含 username 与过期时间，HMAC 签名。
export async function createSession(secret, username = '') {
  const payload = JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 8 });
  const encoded = toBase64Url(encoder.encode(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

// 校验会话，返回 { username } 或 null。
export async function readSession(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)logistics_admin=([^;]+)/);
  if (!match) return null;
  const [encoded, signature] = match[1].split('.');
  if (!encoded || !signature) return null;
  try {
    const expected = await sign(encoded, secret);
    if (expected !== signature) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    // 兼容旧格式：旧 token 的 payload 是纯数字过期时间戳
    if (typeof payload === 'number') {
      return Number(payload) < Date.now() ? null : { username: 'admin' };
    }
    if (!payload || Number(payload.exp) < Date.now()) return null;
    return { username: payload.u || 'admin' };
  } catch {
    // 兼容旧格式：payload 曾是 base64(纯数字时间戳)，签名对的也是旧 token
    return null;
  }
}

// 向后兼容：record.js / upload.js 仍调用 isAuthenticated(request, secret)
export async function isAuthenticated(request, secret) {
  if (!secret) return false;
  const session = await readSession(request, secret);
  if (session) return true;
  // 兼容旧 token 格式：payload = base64(纯数字过期时间戳)
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)logistics_admin=([^;]+)/);
  if (!match) return false;
  const [encoded, signature] = match[1].split('.');
  if (!encoded || !signature) return false;
  try {
    const expected = await sign(encoded, secret);
    if (expected !== signature) return false;
    const raw = new TextDecoder().decode(fromBase64Url(encoded));
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && String(asNum) === raw) {
      return asNum >= Date.now();
    }
    return false;
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
