import { getAdminSecret, json, readSession } from '../../_lib/auth.js';
import { EMAIL_RE, USERNAME_RE, hashPassword, passwordFormat } from '../../_lib/customer-auth.js';

/**
 * /api/admin/customers — admin management of customer accounts (shop + Showcase) and clients.
 *
 *  GET  /api/admin/customers?resource=clients                 -> all clients
 *  GET  /api/admin/customers?q=&clientId=&page=&pageSize=     -> paged customer list
 *  GET  /api/admin/customers?id=123                           -> one customer
 *  POST /api/admin/customers {action, ...}
 *       createClient   {code, name}
 *       updateClient   {id, name?, status?}
 *       createCustomer {email, username?, displayName?, clientId?, showcaseAccess?, password?}
 *       updateCustomer {id, email?, username?, displayName?, clientId?, showcaseAccess?, status?}
 *       resetPassword  {id, password?}
 *  createCustomer / resetPassword: when no password is given the server generates a temporary
 *  one and returns it once as `temporaryPassword` (it is never stored or shown again).
 *
 * Security: admin session (aud:'admin') on every method; same-origin only (no CORS);
 * no-store; parameterized SQL only; JSON body capped; password hashes are never returned.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_Q = 100;
const CLIENT_CODE_RE = /^[A-Za-z0-9_-]{2,20}$/;
const STATUSES = ['active', 'disabled'];

const reply = (data, status = 200) => json(data, status, NO_STORE);

async function requireAdmin(request, env) {
  return readSession(request, await getAdminSecret(env));
}

function toInt(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// 16 chars from an unambiguous alphabet (~92 bits)
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const CUSTOMER_SELECT = `SELECT c.id, c.email, c.username, c.display_name, c.status, c.client_id, c.showcase_access,
         c.created_at, c.password_hash, cl.code AS client_code, cl.name AS client_name, cl.status AS client_status,
         (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
  FROM customers c LEFT JOIN clients cl ON cl.id = c.client_id`;

function rowToCustomer(r) {
  return {
    id: r.id,
    email: r.email,
    username: r.username || null,
    displayName: r.display_name || null,
    status: r.status,
    clientId: r.client_id ?? null,
    clientCode: r.client_code || null,
    clientName: r.client_name || null,
    clientStatus: r.client_status || null,
    showcaseAccess: Number(r.showcase_access) === 1,
    createdAt: r.created_at,
    orderCount: Number(r.order_count || 0),
    // Only the format, never the hash: 'pbkdf2' | 'legacy' | 'none'
    passwordFormat: passwordFormat(r.password_hash),
  };
}

function rowToClient(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customerCount: Number(r.customer_count || 0),
  };
}

async function loadCustomer(db, id) {
  const r = await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ?1`).bind(id).first();
  return r ? rowToCustomer(r) : null;
}

async function loadClient(db, id) {
  const r = await db.prepare(
    `SELECT cl.*, (SELECT COUNT(*) FROM customers c WHERE c.client_id = cl.id) AS customer_count FROM clients cl WHERE cl.id = ?1`
  ).bind(id).first();
  return r ? rowToClient(r) : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await requireAdmin(request, env)) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(request.url).searchParams;
  try {
    if (params.get('resource') === 'clients') {
      const res = await env.DB.prepare(
        `SELECT cl.*, (SELECT COUNT(*) FROM customers c WHERE c.client_id = cl.id) AS customer_count
         FROM clients cl ORDER BY cl.code ASC`
      ).all();
      return reply({ clients: (res.results || []).map(rowToClient) });
    }

    if (params.get('id') !== null) {
      const id = toInt(params.get('id'), 0);
      if (id < 1) return reply({ error: 'Invalid id' }, 400);
      const customer = await loadCustomer(env.DB, id);
      if (!customer) return reply({ error: 'Customer not found' }, 404);
      return reply({ customer });
    }

    const q = (params.get('q') || '').trim();
    if (q.length > MAX_Q) return reply({ error: `Search is too long (max ${MAX_Q} characters)` }, 400);
    const clientFilter = (params.get('clientId') || '').trim();
    const page = Math.max(1, toInt(params.get('page'), 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(params.get('pageSize'), DEFAULT_PAGE_SIZE)));

    const where = [];
    const binds = [];
    const bind = (v) => { binds.push(v); return `?${binds.length}`; };
    if (q) {
      const p = bind(`%${escapeLike(q)}%`);
      where.push(`(c.email LIKE ${p} ESCAPE '\\' OR c.username LIKE ${p} ESCAPE '\\' OR c.display_name LIKE ${p} ESCAPE '\\')`);
    }
    if (clientFilter === 'none') where.push('c.client_id IS NULL');
    else if (clientFilter) {
      const cid = toInt(clientFilter, 0);
      if (cid < 1) return reply({ error: 'Invalid client filter' }, 400);
      where.push(`c.client_id = ${bind(cid)}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM customers c ${w}`).bind(...binds).first();
    const total = Number(totalRow?.n || 0);
    const limitP = bind(pageSize);
    const offsetP = bind((page - 1) * pageSize);
    const res = await env.DB.prepare(`${CUSTOMER_SELECT} ${w} ORDER BY c.id DESC LIMIT ${limitP} OFFSET ${offsetP}`)
      .bind(...binds).all();
    return reply({ customers: (res.results || []).map(rowToCustomer), total, page, pageSize });
  } catch (e) {
    console.error('admin customers: read', e?.message);
    return reply({ error: 'Could not load customers' }, 500);
  }
}

async function readJsonBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return { error: 'Content-Type must be application/json', status: 415 };
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid JSON body', status: 400 };
    return { body };
  } catch {
    return { error: 'Invalid JSON body', status: 400 };
  }
}

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function textField(raw, label, max) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new InputError(`${label} must be text`);
  const v = raw.trim();
  if (v.length > max) throw new InputError(`${label} is too long (max ${max} characters)`);
  return v || null;
}

async function normEmail(db, raw, exceptId = null) {
  if (typeof raw !== 'string') throw new InputError('Email is required');
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new InputError('A valid email is required');
  const dup = await db.prepare('SELECT id FROM customers WHERE lower(email) = ?1 AND id != ?2').bind(email, exceptId ?? 0).first();
  if (dup) throw new InputError('Another customer already uses this email', 409);
  return email;
}

async function normUsername(db, raw, exceptId = null) {
  if (raw === undefined) return undefined;
  if (raw === null || (typeof raw === 'string' && !raw.trim())) return null;
  if (typeof raw !== 'string') throw new InputError('Username must be text');
  const username = raw.trim();
  if (!USERNAME_RE.test(username)) throw new InputError('Username must be 2–40 characters: letters, digits, dot, dash or underscore (no @)');
  // Unique regardless of case so "HRT" and "hrt" cannot both exist
  const dup = await db.prepare('SELECT id FROM customers WHERE lower(username) = lower(?1) AND id != ?2').bind(username, exceptId ?? 0).first();
  if (dup) throw new InputError('Another customer already uses this username', 409);
  return username;
}

async function normClientId(db, raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new InputError('Invalid client');
  const row = await db.prepare('SELECT id FROM clients WHERE id = ?1').bind(id).first();
  if (!row) throw new InputError('Client not found');
  return id;
}

function normBool(raw, label) {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') throw new InputError(`${label} must be true or false`);
  return raw ? 1 : 0;
}

function normStatus(raw) {
  if (raw === undefined) return undefined;
  if (!STATUSES.includes(raw)) throw new InputError('status must be active or disabled');
  return raw;
}

function normPassword(raw) {
  if (raw === undefined || raw === null || raw === '') return { password: temporaryPassword(), generated: true };
  if (typeof raw !== 'string') throw new InputError('Password must be text');
  if (raw.length < 8) throw new InputError('Password must be at least 8 characters');
  if (raw.length > 128) throw new InputError('Password is too long (max 128 characters)');
  return { password: raw, generated: false };
}

function requireId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new InputError('Invalid id');
  return id;
}

const now = () => new Date().toISOString();

const actions = {
  async createClient(env, body) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CLIENT_CODE_RE.test(code)) throw new InputError('Client code must be 2–20 letters, digits, dash or underscore');
    const name = textField(body.name, 'Name', 120);
    if (!name) throw new InputError('Name is required');
    const dup = await env.DB.prepare('SELECT id FROM clients WHERE upper(code) = ?1').bind(code).first();
    if (dup) throw new InputError('A client with this code already exists', 409);
    const ts = now();
    const res = await env.DB.prepare(
      "INSERT INTO clients (code, name, status, created_at, updated_at) VALUES (?1, ?2, 'active', ?3, ?3)"
    ).bind(code, name, ts).run();
    return { client: await loadClient(env.DB, res.meta?.last_row_id) };
  },

  async updateClient(env, body) {
    const id = requireId(body.id);
    if (!await loadClient(env.DB, id)) throw new InputError('Client not found', 404);
    const sets = [];
    const binds = [id];
    const set = (col, v) => { binds.push(v); sets.push(`${col} = ?${binds.length}`); };
    if (body.name !== undefined) {
      const name = textField(body.name, 'Name', 120);
      if (!name) throw new InputError('Name is required');
      set('name', name);
    }
    const status = normStatus(body.status);
    if (status !== undefined) set('status', status);
    if (!sets.length) throw new InputError('Nothing to update');
    set('updated_at', now());
    await env.DB.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?1`).bind(...binds).run();
    return { client: await loadClient(env.DB, id) };
  },

  async createCustomer(env, body) {
    const email = await normEmail(env.DB, body.email);
    const username = (await normUsername(env.DB, body.username)) ?? null;
    const displayName = textField(body.displayName, 'Display name', 60) ?? null;
    const clientId = (await normClientId(env.DB, body.clientId)) ?? null;
    const showcaseAccess = normBool(body.showcaseAccess, 'showcaseAccess') ?? 0;
    const { password, generated } = normPassword(body.password);
    const rec = await hashPassword(password, env);
    const res = await env.DB.prepare(
      `INSERT INTO customers (email, password_hash, password_salt, display_name, status, created_at, client_id, showcase_access, username)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7, ?8)`
    ).bind(email, rec.hash, rec.salt, displayName, now(), clientId, showcaseAccess, username).run();
    const out = { customer: await loadCustomer(env.DB, res.meta?.last_row_id) };
    if (generated) out.temporaryPassword = password;
    return out;
  },

  async updateCustomer(env, body) {
    const id = requireId(body.id);
    if (!await loadCustomer(env.DB, id)) throw new InputError('Customer not found', 404);
    const sets = [];
    const binds = [id];
    const set = (col, v) => { binds.push(v); sets.push(`${col} = ?${binds.length}`); };
    if (body.email !== undefined) set('email', await normEmail(env.DB, body.email, id));
    const username = await normUsername(env.DB, body.username, id);
    if (username !== undefined) set('username', username);
    const displayName = textField(body.displayName, 'Display name', 60);
    if (displayName !== undefined) set('display_name', displayName);
    const clientId = await normClientId(env.DB, body.clientId);
    if (clientId !== undefined) set('client_id', clientId);
    const showcaseAccess = normBool(body.showcaseAccess, 'showcaseAccess');
    if (showcaseAccess !== undefined) set('showcase_access', showcaseAccess);
    const status = normStatus(body.status);
    if (status !== undefined) set('status', status);
    if (!sets.length) throw new InputError('Nothing to update');
    await env.DB.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?1`).bind(...binds).run();
    return { customer: await loadCustomer(env.DB, id) };
  },

  async resetPassword(env, body) {
    const id = requireId(body.id);
    if (!await loadCustomer(env.DB, id)) throw new InputError('Customer not found', 404);
    const { password, generated } = normPassword(body.password);
    const rec = await hashPassword(password, env);
    await env.DB.prepare('UPDATE customers SET password_hash = ?2, password_salt = ?3 WHERE id = ?1').bind(id, rec.hash, rec.salt).run();
    const out = { customer: await loadCustomer(env.DB, id) };
    if (generated) out.temporaryPassword = password;
    return out;
  },
};

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status);
  const { body } = parsed;
  const handler = typeof body.action === 'string' && Object.hasOwn(actions, body.action) ? actions[body.action] : null;
  if (!handler) return reply({ error: 'Unknown action' }, 400);

  try {
    const out = await handler(env, body);
    console.log(`admin customers: ${admin.username} ${body.action} ${body.id ?? ''}`.trim());
    return reply({ ok: true, ...out });
  } catch (e) {
    if (e instanceof InputError) return reply({ error: e.message }, e.status);
    // UNIQUE constraint races (email / username / client code)
    if (/UNIQUE/i.test(e?.message || '')) return reply({ error: 'That value is already in use' }, 409);
    console.error('admin customers: write', e?.message);
    return reply({ error: 'Could not save changes' }, 500);
  }
}
