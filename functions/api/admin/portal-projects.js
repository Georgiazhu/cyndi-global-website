// /api/admin/portal-projects — 管理员为客户项目设置 Showcase/Mockup/Order 三阶段进度。
//  GET  -> 所有客户项目（LEFT JOIN，未建的也可设置）
//  POST { action:'save', customerId, title?, stages:{showcase:{pct,note},mockup,order}, status? }
import { getAdminSecret, json, readSession } from '../../_lib/auth.js';
import { listProjects, saveProject } from '../../_lib/portal.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const reply = (data, status = 200) => json(data, status, NO_STORE);

async function requireAdmin(request, env) {
  return readSession(request, await getAdminSecret(env));
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);
  try {
    const projects = await listProjects(env.DB);
    return reply({ projects });
  } catch (e) {
    console.error('admin portal-projects: list', e?.message);
    return reply({ error: 'Could not load projects' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON body' }, 400); }
  if (body?.action !== 'save') return reply({ error: 'Unknown action' }, 400);
  try {
    const project = await saveProject(env.DB, body, `admin:${admin.username}`);
    console.log(`admin portal-projects: save customer ${body.customerId} by ${admin.username}`);
    return reply({ ok: true, project });
  } catch (e) {
    if (/Invalid|not found/i.test(e?.message || '')) return reply({ error: e.message }, 400);
    console.error('admin portal-projects: save', e?.message);
    return reply({ error: 'Could not save project' }, 500);
  }
}
