import { json } from '../../_lib/auth.js';
import {
  SHOWCASE_DEFAULT_USER,
  SHOWCASE_USERS_SCHEMA,
  clearShowcaseSessionCookie,
  createShowcaseSession,
  getShowcaseSecret,
  hashPassword,
  isShowcaseAuthenticated,
  randomSalt,
  readShowcaseSession,
  showcaseSessionCookie,
  verifyShowcaseCredentials,
} from './auth-lib.js';

// 幂等初始化：建表 + 写入初始账号 HRT / Aa123456。
let ready = null;

async function ensureReady(env) {
  if (ready) return ready;
  ready = (async () => {
    if (!env.DB) return;
    for (const stmt of SHOWCASE_USERS_SCHEMA) {
      try { await env.DB.prepare(stmt).run(); }
      catch (e) { console.error('showcase_users schema:', e?.message); }
    }
    // 初始账号不存在时写入
    try {
      const row = await env.DB.prepare('SELECT username FROM showcase_users WHERE username = ?1')
        .bind(SHOWCASE_DEFAULT_USER.username).first();
      if (!row) {
        const salt = randomSalt();
        const hash = await hashPassword(SHOWCASE_DEFAULT_USER.password, salt);
        const ts = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO showcase_users (username, password_hash, password_salt, display_name, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)`
        ).bind(SHOWCASE_DEFAULT_USER.username, hash, salt, SHOWCASE_DEFAULT_USER.displayName, ts).run();
        console.log('showcase: initial account created');
      }
    } catch (e) {
      console.error('showcase seed user:', e?.message);
    }
  })();
  return ready;
}

// 统一入口：按请求方法分派。
// 不用 onRequestDelete 单独导出，避免部分打包器对特定方法名的处理差异。
export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'POST') return onRequestPost(context);
  if (method === 'DELETE') return handleDelete(context);
  return onRequestGet(context);
}

// POST /api/showcase/auth —— 登录 { username, password }
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
  await ensureReady(env);

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  const user = await verifyShowcaseCredentials(env, username, password);
  if (!user) return json({ error: '账号或密码不正确' }, 401);

  const secret = await getShowcaseSecret(env);
  const token = await createShowcaseSession(secret, user.username);
  const isHttps = new URL(request.url).protocol === 'https:';

  return json(
    { ok: true, user: { username: user.username, displayName: user.displayName } },
    200,
    { 'Set-Cookie': showcaseSessionCookie(token, isHttps) }
  );
}

// GET /api/showcase/auth —— 会话状态检查
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ authenticated: false }, 503);
  await ensureReady(env);

  const secret = await getShowcaseSecret(env);
  const session = await readShowcaseSession(request, secret);
  if (!session) return json({ authenticated: false });

  return json({ authenticated: true, user: { username: session.username } });
}

// DELETE /api/showcase/auth —— 退出登录
async function handleDelete({ request }) {
  const isHttps = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'Set-Cookie': clearShowcaseSessionCookie(isHttps) });
}
