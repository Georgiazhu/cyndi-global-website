// /api/admin/projects — Admin console for the customer-facing client_projects.
//  GET  -> { projects, customers, showcase:{categories,products} }
//  POST -> { action, ... } actions:
//     createProject    { customerId, title, brief }
//     publishShortlist { projectNo, products:[{name,sku,price,image}], confirm? }
//     publishMockups   { projectNo, mockups:[{label,image}], confirm? }
//     setStage         { projectNo, stage, status?, note? }
//     createOrder      { projectNo, items:[{size,qty}] }
//     deleteProject    { projectNo }
// Everything published here is written to the same rows the client portal reads.
import { getAdminSecret, isAuthenticated, json, readSession } from '../../_lib/auth.js';
import {
  listAdminProjects, adminCreateProject, adminPublishShortlist, adminPublishMockups,
  adminSetStage, adminCreateOrder, adminDeleteProject, adminUpdateProject,
} from '../../_lib/dashboard.js';

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const reply = (data, status = 200) => json(data, status, NO_STORE);

async function gate(request, env) {
  if (!env.DB) return { error: reply({ error: 'Database binding is not configured' }, 503) };
  const secret = await getAdminSecret(env);
  if (!await isAuthenticated(request, secret)) return { error: reply({ error: 'Unauthorized' }, 401) };
  return {};
}

async function customers(db) {
  const res = await db.prepare(
    `SELECT c.id, c.email, c.display_name, c.username, c.status, cl.name AS client_name
       FROM customers c LEFT JOIN clients cl ON c.client_id = cl.id
      ORDER BY c.id DESC LIMIT 500`
  ).all();
  return (res.results || []).map((c) => ({
    id: c.id, email: c.email, name: c.display_name || c.username || c.email,
    status: c.status, client: c.client_name || '',
  }));
}

async function showcase(db) {
  let categories = [], products = [];
  try {
    const c = await db.prepare('SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC').all();
    categories = (c.results || []).map((x) => ({ id: x.id, name: x.name }));
  } catch {}
  try {
    const p = await db.prepare(`SELECT id, category_id, sku, name, image, pricing_json, sort
      FROM showcase_products ORDER BY sort ASC, name ASC`).all();
    products = (p.results || []).map((x) => {
      let price = 0;
      try {
        const arr = JSON.parse(x.pricing_json || '[]');
        if (Array.isArray(arr) && arr.length) price = Number(arr[0].price) || 0;
      } catch {}
      return { id: x.id, categoryId: x.category_id, sku: x.sku || x.id, name: x.name, image: x.image || '', price };
    });
  } catch {}
  return { categories, products };
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env);
  if (g.error) return g.error;
  try {
    const [projects, cust, sc] = await Promise.all([
      listAdminProjects(env.DB), customers(env.DB), showcase(env.DB),
    ]);
    return reply({ projects, customers: cust, showcase: sc });
  } catch (e) {
    console.error('admin projects GET:', e?.message);
    return reply({ error: 'Could not load projects' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env);
  if (g.error) return g.error;
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON body' }, 400); }
  const action = String(body?.action || '');
  try {
    const who = (await readSession(request, await getAdminSecret(env)))?.username || 'admin';
    let out;
    switch (action) {
      case 'createProject': {
        const cust = await env.DB.prepare('SELECT id, email FROM customers WHERE id = ?1').bind(Number(body.customerId) || 0).first();
        if (!cust) return reply({ error: 'Customer not found' }, 404);
        out = await adminCreateProject(env.DB, cust, body, who);
        break;
      }
      case 'publishShortlist': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminPublishShortlist(env.DB, body.projectNo, body.products, who, !!body.confirm);
        break;
      }
      case 'publishMockups': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminPublishMockups(env.DB, body.projectNo, body.mockups, who, !!body.confirm);
        break;
      }
      case 'setStage': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminSetStage(env.DB, body.projectNo, body.stage, body.status, who, body.note);
        break;
      }
      case 'updateProject': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminUpdateProject(env.DB, body.projectNo, body, who);
        break;
      }
      case 'createOrder': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminCreateOrder(env.DB, body.projectNo, body.items, who);
        break;
      }
      case 'deleteProject': {
        if (!body.projectNo) return reply({ error: 'projectNo is required' }, 400);
        out = await adminDeleteProject(env.DB, body.projectNo, who);
        break;
      }
      default:
        return reply({ error: 'Unknown action' }, 400);
    }
    console.log(`admin projects: ${action} by ${who}`);
    return reply({ ok: true, ...out });
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('admin projects POST:', e?.message);
    return reply({ error: e?.message || 'Could not save change' }, status);
  }
}
