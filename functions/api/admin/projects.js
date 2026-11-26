// /api/admin/projects — Admin console for the customer-facing client_projects.
//  GET  -> { projects, customers, showcase:{categories,products} }
//  POST -> { action, ... } actions:
//     createProject         { customerId, title, brief }
//     saveCustomerShowcase  { customerId, productIds:[id,...] }
//     publishShortlist      { projectNo, products:[{name,sku,price,image}], confirm? }
//     publishMockups        { projectNo, mockups:[{label,image}], confirm? }
//     setStage              { projectNo, stage, status?, note? }
//     createOrder           { projectNo, items:[{productIndex,color,size,qty,setupFee,printFee,decoration}] }
//     updateOrderPricing    { orderNo, lines:[{index,setupFee,printFee,decoration}] }
//     deleteProject         { projectNo }
// Everything published here is written to the same rows the client portal reads.
import { getAdminSecret, isAuthenticated, json, readSession } from '../../_lib/auth.js';
import {
  listAdminProjects, adminCreateProject, adminPublishShortlist, adminPublishMockups,
  adminSetStage, adminCreateOrder, adminDeleteProject, adminUpdateProject, adminUpdateOrderPricing,
} from '../../_lib/dashboard.js';
import {
  getCustomerPool, setCustomerPool, filterByPool, ensureClientShowcaseSchema,
} from '../../_lib/client-showcase.js';

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

/** The catalogue, narrowed to the products assigned to one customer's showcase. */
async function showcase(db, customerId) {
  let categories = [], products = [];
  try {
    const c = await db.prepare('SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC').all();
    categories = (c.results || []).map((x) => ({ id: x.id, name: x.name }));
  } catch {}
  try {
    const p = await db.prepare(`SELECT id, category_id, sku, name, image, colors_json, sizes_json, pricing_json, sort
      FROM showcase_products ORDER BY sort ASC, name ASC`).all();
    products = (p.results || []).map((x) => {
      let price = 0;
      let pricing = [];
      try {
        const arr = JSON.parse(x.pricing_json || '[]');
        if (Array.isArray(arr)) {
          pricing = arr;
          if (arr.length) price = Number(arr[0].price) || 0;
        }
      } catch {}
      let colors = [], sizes = [];
      try { colors = JSON.parse(x.colors_json || '[]'); } catch {}
      try { sizes = JSON.parse(x.sizes_json || '[]'); } catch {}
      return {
        id: x.id, categoryId: x.category_id, sku: x.sku || x.id, name: x.name,
        image: x.image || '', price, pricing,
        colors: Array.isArray(colors) ? colors : [],
        sizes: Array.isArray(sizes) ? sizes : [],
      };
    });
    const pool = customerId ? await getCustomerPool(db, customerId) : null;
    products = filterByPool(products, pool);
  } catch {}
  return { categories, products };
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env);
  if (g.error) return g.error;
  try {
    const customerId = new URL(request.url).searchParams.get('customerId') || '';
    const [projects, cust, sc, catalog, pool] = await Promise.all([
      listAdminProjects(env.DB), customers(env.DB), showcase(env.DB, customerId),
      showcase(env.DB), customerId ? getCustomerPool(env.DB, customerId) : Promise.resolve(null),
    ]);
    return reply({ projects, customers: cust, showcase: sc, catalog, pool, poolCustomerId: customerId });
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
    const sessionUser = (await readSession(request, await getAdminSecret(env)))?.username || 'admin';
    // Customer-visible activity should identify the company, never an internal login.
    const who = 'Cyndi Global';
    let out;
    switch (action) {
      case 'createProject': {
        const cust = await env.DB.prepare('SELECT id, email FROM customers WHERE id = ?1').bind(Number(body.customerId) || 0).first();
        if (!cust) return reply({ error: 'Customer not found' }, 404);
        out = await adminCreateProject(env.DB, cust, body, who);
        break;
      }
      case 'saveCustomerShowcase': {
        const customerId = Number(body.customerId) || 0;
        if (!customerId) return reply({ error: 'customerId is required' }, 400);
        const cust = await env.DB.prepare('SELECT id, email FROM customers WHERE id = ?1').bind(customerId).first();
        if (!cust) return reply({ error: 'Customer not found' }, 404);
        out = await setCustomerPool(env.DB, cust.id, body.productIds);
        break;
      }
      case 'resetCustomerShowcase': {
        const customerId = Number(body.customerId) || 0;
        if (!customerId) return reply({ error: 'customerId is required' }, 400);
        await ensureClientShowcaseSchema(env.DB);
        await env.DB.prepare('DELETE FROM client_showcase_pools WHERE customer_id = ?1').bind(String(customerId)).run();
        out = { ok: true, customerId: String(customerId) };
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
        out = await adminCreateOrder(env.DB, body.projectNo, body.items, who, body.channel);
        break;
      }
      case 'updateOrderPricing': {
        if (!body.orderNo) return reply({ error: 'orderNo is required' }, 400);
        out = await adminUpdateOrderPricing(env.DB, body.orderNo, body.lines, who);
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
    console.log(`admin projects: ${action} by ${sessionUser}`);
    return reply({ ok: true, ...out });
  } catch (e) {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error('admin projects POST:', e?.message);
    return reply({ error: e?.message || 'Could not save change' }, status);
  }
}
