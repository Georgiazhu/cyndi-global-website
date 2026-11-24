// GET /api/portal/project — 当前登录客户读取自己的项目三阶段进度（只读）。
import { corsHeaders, json } from '../../_lib/auth.js';
import { NOT_CONFIGURED_ERROR, readCustomerSession, customerSessionsConfigured } from '../../_lib/customer-auth.js';
import { getProjectForCustomer } from '../../_lib/portal.js';

export async function onRequestGet({ request, env }) {
  const cors = { ...corsHeaders(request), 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503, cors);
  if (!customerSessionsConfigured(env)) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  const session = await readCustomerSession(request, env);
  if (!session.configured) return json({ error: NOT_CONFIGURED_ERROR }, 503, cors);
  if (!session.customer) return json({ error: 'Not signed in' }, 401, cors);
  try {
    const project = await getProjectForCustomer(env.DB, session.customer.id);
    return json({ project }, 200, cors);
  } catch (e) {
    console.error('portal project:', e?.message);
    return json({ error: 'Could not load project' }, 500, cors);
  }
}
