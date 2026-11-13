import { getAdminSecret, json, readSession } from '../../_lib/auth.js';
import { ensureSchema } from '../showcase.js';
import {
  INV_SKU_RE,
  invAdjustStatements,
  invAssignColourIds,
  invClassifyError,
  invProductMatrix,
  invSetStatements,
  invSkuCode,
  invSkuProductPart,
  invThresholdStatements,
  invTrackStatements,
  invVariantKey,
  invCellKey,
  invOpenOrderLines,
} from '../../_lib/inventory.js';
import { SHOWCASE_ORDERS_WHERE } from '../../_lib/orders.js';

/**
 * /api/admin/inventory — Guangzhou warehouse stock for Showcase variants (Phase 1).
 *
 *  GET  /api/admin/inventory?q=            -> { products: product totals, skus: flat per-colour stock rows }
 *  GET  /api/admin/inventory?productId=    -> one product: colour × size matrix, unlinked rows, movements
 *  POST {op:'track', productId, variants?, reason?}             -> start tracking variants
 *  POST {op:'set', sku, available, expected, reason}            -> set available (optimistic lock)
 *  POST {op:'adjust', sku, delta, reason}                       -> add/remove available
 *  POST {op:'threshold', sku, threshold|null, reason?}          -> low-stock threshold
 *  POST {op:'resetFromOrder', orderNo, confirm:'RESET-INVENTORY'} -> one-off maintenance:
 *        wipe all stock rows/movements/reservations, then seed opening stock from one
 *        showcase order (one tracked variant per order line, available = line quantity).
 *        Requires admin session + explicit confirmation; orders are never touched.
 *
 * Admins never write reserved (orders do) and incoming/damaged are read-only in Phase 1.
 * Security: admin session (HMAC cookie) verified before any DB access; same-origin only
 * (no CORS); POST must be application/json ≤ 4 KB; responses are no-store; parameterized SQL.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
const MAX_BODY_BYTES = 4 * 1024;
const MAX_Q = 100;
const MAX_QTY = 1000000;
const MAX_REASON = 500;
const MAX_TRACK = 400;
const MIGRATION_MESSAGE = 'Run migration 0013_inventory.sql first';
const OPEN_ORDER_STATUSES = ['pending', 'processing'];
const MAX_OPEN_ORDERS_LISTED = 50;

const reply = (data, status = 200) => json(data, status, NO_STORE);

// Returns { username } for a valid admin session, else null.
async function requireAdmin(request, env) {
  return readSession(request, await getAdminSecret(env));
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const isQty = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_QTY;

function rowOut(r) {
  if (!r) return null;
  const threshold = r.low_stock_threshold ?? null;
  return {
    sku: r.sku,
    productId: r.product_id,
    colorId: r.color_id,
    size: r.size,
    available: r.available,
    reserved: r.reserved,
    incoming: r.incoming,
    damaged: r.damaged,
    threshold,
    low: threshold !== null && r.available <= threshold,
    out: r.available === 0,
    updatedAt: r.updated_at,
  };
}

function movementOut(m) {
  return {
    id: m.id,
    sku: m.sku,
    type: m.type,
    dAvailable: m.d_available,
    dReserved: m.d_reserved,
    dIncoming: m.d_incoming,
    dDamaged: m.d_damaged,
    availableAfter: m.available_after,
    reservedAfter: m.reserved_after,
    incomingAfter: m.incoming_after,
    damagedAfter: m.damaged_after,
    reason: m.reason,
    refOrderNo: m.ref_order_no,
    actor: m.actor,
    createdAt: m.created_at,
  };
}

// Trimmed reason. required: 1..500; optional: ≤ 500 (empty -> fallback).
function readReason(raw, required, fallback = null) {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return { error: 'Reason must be text' };
  const value = (raw || '').trim();
  if (value.length > MAX_REASON) return { error: `Reason is too long (max ${MAX_REASON})` };
  if (!value) return required ? { error: 'A reason is required' } : { value: fallback };
  return { value };
}

function readProductId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id && id.length <= 100 ? id : null;
}

function readSku(raw) {
  return typeof raw === 'string' && INV_SKU_RE.test(raw) ? raw : null;
}

const loadProduct = (db, id) => db.prepare(
  'SELECT id, sku, name, colors_json, sizes_json FROM showcase_products WHERE id = ?1'
).bind(id).first();

const loadRow = (db, sku) => db.prepare('SELECT * FROM inventory WHERE sku = ?1').bind(sku).first();

// ---- GET ------------------------------------------------------------------------------

async function listProducts(db, q) {
  const where = q
    ? `WHERE p.name LIKE ?1 ESCAPE '\\' OR p.sku LIKE ?1 ESCAPE '\\' OR p.id LIKE ?1 ESCAPE '\\'
         OR p.id IN (SELECT product_id FROM inventory WHERE sku LIKE ?1 ESCAPE '\\')`
    : '';
  const stmt = db.prepare(
    `SELECT p.id, p.sku, p.name, p.category_id, p.colors_json, p.sizes_json
     FROM showcase_products p ${where}
     ORDER BY p.sort, p.name LIMIT 500`
  );
  const prodRes = await (q ? stmt.bind(`%${escapeLike(q)}%`) : stmt).all();
  const aggRes = await db.prepare(
    `SELECT product_id, COUNT(*) AS n, SUM(available) AS a, SUM(reserved) AS r,
            SUM(incoming) AS inc, SUM(damaged) AS dmg,
            SUM(CASE WHEN low_stock_threshold IS NOT NULL AND available <= low_stock_threshold THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN available = 0 THEN 1 ELSE 0 END) AS outn,
            MAX(updated_at) AS upd
     FROM inventory GROUP BY product_id`
  ).all();
  const agg = new Map((aggRes.results || []).map((r) => [r.product_id, r]));
  const products = (prodRes.results || []).map((p) => {
    const a = agg.get(p.id);
    const lowCount = Number(a?.low) || 0;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      categoryId: p.category_id,
      variantCount: invProductMatrix(p).length,
      trackedCount: Number(a?.n) || 0,
      available: Number(a?.a) || 0,
      reserved: Number(a?.r) || 0,
      incoming: Number(a?.inc) || 0,
      damaged: Number(a?.dmg) || 0,
      lowCount,
      outCount: Number(a?.outn) || 0,
      low: lowCount > 0,
      updatedAt: a?.upd || null,
    };
  });
  // Stock rows of products deleted from the Showcase stay in inventory (deleting a product
  // never deletes stock). List them too, so every tracked unit stays visible.
  const deletedRes = await db.prepare(
    `SELECT DISTINCT product_id FROM inventory
     WHERE product_id NOT IN (SELECT id FROM showcase_products)
       ${q ? `AND (product_id LIKE ?1 ESCAPE '\\' OR sku LIKE ?1 ESCAPE '\\')` : ''}
     ORDER BY product_id LIMIT 500`
  );
  const deleted = await (q ? deletedRes.bind(`%${escapeLike(q)}%`) : deletedRes).all();
  for (const { product_id: pid } of deleted.results || []) {
    const a = agg.get(pid);
    const lowCount = Number(a?.low) || 0;
    products.push({
      id: pid,
      sku: null,
      name: deletedProductName(pid),
      categoryId: null,
      deleted: true,
      variantCount: 0,
      trackedCount: Number(a?.n) || 0,
      available: Number(a?.a) || 0,
      reserved: Number(a?.r) || 0,
      incoming: Number(a?.inc) || 0,
      damaged: Number(a?.dmg) || 0,
      lowCount,
      outCount: Number(a?.outn) || 0,
      low: lowCount > 0,
      updatedAt: a?.upd || null,
    });
  }
  return reply({ products, skus: await ivwListStockSkus(db, q) });
}

const deletedProductName = (id) => `Deleted product (${id})`;

// Flat list for the SKU view: one row = one inventory stock code = one product
// colour (+ size). Products with no stock row are absent by construction, so the
// list only shows items that were actually ordered / stocked. Colour names come
// from the live showcase_products.colors_json, matched by the stable colour id.
async function ivwListStockSkus(db, q) {
  const res = await db.prepare(
    `SELECT i.sku, i.product_id, i.color_id, i.size, i.available, i.reserved,
            i.incoming, i.damaged, i.low_stock_threshold, i.updated_at,
            p.sku AS p_sku, p.name AS p_name, p.colors_json, p.sizes_json, p.sort AS p_sort
     FROM inventory i
     LEFT JOIN showcase_products p ON p.id = i.product_id`
  ).all();
  const needle = q ? q.toLowerCase() : '';
  const out = [];
  for (const r of res.results || []) {
    const live = !!(r.p_sku || r.p_name);
    const matrix = live
      ? invProductMatrix({ id: r.product_id, sku: r.p_sku, colors_json: r.colors_json, sizes_json: r.sizes_json })
      : [];
    const cell = matrix.find((c) => c.colorId === r.color_id && c.size === r.size)
      || matrix.find((c) => c.colorId === r.color_id) || null;
    const colorName = cell ? cell.colorName : '';
    const colorHex = cell ? cell.colorHex : '';
    const colorIndex = cell && cell.colorIndex != null ? cell.colorIndex : 9999;
    const threshold = r.low_stock_threshold ?? null;
    const available = Number(r.available) || 0;
    const productName = r.p_name || deletedProductName(r.product_id);
    const row = {
      sku: r.sku,
      productId: r.product_id,
      productSku: r.p_sku || null,
      productName,
      deleted: !r.p_name,
      colorId: r.color_id,
      colorName,
      colorHex,
      size: r.size,
      available,
      reserved: Number(r.reserved) || 0,
      incoming: Number(r.incoming) || 0,
      damaged: Number(r.damaged) || 0,
      threshold,
      low: threshold !== null && available <= threshold,
      out: available === 0,
      tracked: true,
      updatedAt: r.updated_at || null,
    };
    if (needle && ![row.sku, row.productSku, row.productName, row.colorName, row.size]
      .some((v) => String(v || '').toLowerCase().includes(needle))) continue;
    out.push({ row, key: [Number(r.p_sort) || 0, productName.toLowerCase(), colorIndex,
      String(r.size || ''), row.sku] });
  }
  out.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] < b.key[i]) return -1;
      if (a.key[i] > b.key[i]) return 1;
    }
    return 0;
  });
  return out.map((x) => x.row);
}

async function productDetail(db, productId) {
  const live = await loadProduct(db, productId);
  const rowsRes = await db.prepare('SELECT * FROM inventory WHERE product_id = ?1').bind(productId).all();
  // A deleted product with stock rows left: show them (all unlinked) instead of a 404.
  if (!live && !(rowsRes.results || []).length) return reply({ error: 'Unknown product' }, 404);
  const product = live || { id: productId, sku: null, name: deletedProductName(productId), colors_json: '[]', sizes_json: '[]' };
  const movRes = await db.prepare(
    `SELECT id, sku, type, d_available, d_reserved, d_incoming, d_damaged, available_after, reserved_after,
            reason, ref_order_no, actor, created_at
     FROM inventory_movements WHERE sku IN (SELECT sku FROM inventory WHERE product_id = ?1)
     ORDER BY id DESC LIMIT 50`
  ).bind(productId).all();
  // Derived, read-only: cumulative quantity shipped out per sku (ship rows store d_reserved < 0).
  const shippedRes = await db.prepare(
    `SELECT sku, COALESCE(SUM(-d_reserved), 0) AS shipped
     FROM inventory_movements
     WHERE type = 'ship' AND sku IN (SELECT sku FROM inventory WHERE product_id = ?1)
     GROUP BY sku`
  ).bind(productId).all();
  const shippedBySku = new Map((shippedRes.results || []).map((r) => [r.sku, Number(r.shipped) || 0]));

  const open = live
    ? invOpenOrderLines(product, await loadOpenOrders(db, productId))
    : { count: 0, quantity: 0, orders: [], cells: new Map() };

  const rows = rowsRes.results || [];
  const byKey = new Map(rows.map((r) => [invVariantKey(r.product_id, r.color_id, r.size), r]));
  const matched = new Set();
  const matrix = live ? invProductMatrix(product) : [];
  const variants = matrix.map((c) => {
    const row = c.colorId === null ? null : byKey.get(invVariantKey(productId, c.colorId, c.size));
    const base = { colorId: c.colorId, colorName: c.colorName, colorHex: c.colorHex, size: c.size, tracked: !!row,
      openOrderQty: open.cells.get(invCellKey(c.colorIndex ?? '', c.size)) || 0 };
    if (!row) return base;
    matched.add(row.sku);
    const o = rowOut(row);
    return { ...base, sku: o.sku, available: o.available, reserved: o.reserved,
      shipped: shippedBySku.get(o.sku) || 0, incoming: o.incoming, damaged: o.damaged,
      threshold: o.threshold, low: o.low, out: o.out, updatedAt: o.updatedAt };
  });
  const unlinked = rows.filter((r) => !matched.has(r.sku)).map((r) => {
    const o = rowOut(r);
    return { sku: o.sku, colorId: o.colorId, size: o.size, available: o.available, reserved: o.reserved,
      incoming: o.incoming, damaged: o.damaged, threshold: o.threshold, updatedAt: o.updatedAt };
  });
  return reply({
    product: { id: product.id, sku: product.sku, name: product.name, deleted: !live, colorsMissingIds: matrix.some((c) => c.colorId === null) },
    variants,
    unlinked,
    // Pending/processing orders placed before tracking: they reserved nothing, so shipping
    // or cancelling them will not change stock. The admin subtracts them from opening stock.
    openOrders: { count: open.count, quantity: open.quantity, orders: open.orders.slice(0, MAX_OPEN_ORDERS_LISTED) },
    movements: (movRes.results || []).map(movementOut),
  });
}

// Open (pending/processing) Showcase orders whose items mention the product. The text
// prefilter keeps the query cheap and tolerant of malformed items_json; the caller parses.
async function loadOpenOrders(db, productId) {
  const ph = OPEN_ORDER_STATUSES.map((_, i) => `?${i + 2}`).join(', ');
  const res = await db.prepare(
    `SELECT order_no, status, items_json FROM orders
     WHERE ${SHOWCASE_ORDERS_WHERE} AND status IN (${ph}) AND instr(items_json, ?1) > 0
     ORDER BY created_at LIMIT 500`
  ).bind(JSON.stringify(productId), ...OPEN_ORDER_STATUSES).all();
  return res.results || [];
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  if (!await requireAdmin(request, env)) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(request.url).searchParams;
  const rawProductId = params.get('productId');
  let productId = null;
  if (rawProductId !== null) {
    productId = readProductId(rawProductId);
    if (!productId) return reply({ error: 'productId is required' }, 400);
  }
  const q = (params.get('q') || '').trim();
  if (q.length > MAX_Q) return reply({ error: `Search is too long (max ${MAX_Q} characters)` }, 400);

  await ensureSchema(env);
  try {
    return productId ? await productDetail(env.DB, productId) : await listProducts(env.DB, q);
  } catch (e) {
    if (invClassifyError(e) === 'missing_table') {
      return reply(productId ? { migrationRequired: true }
        : { migrationRequired: true, products: [], skus: [] });
    }
    console.error('admin inventory: read', e?.message);
    return reply({ error: 'Could not load inventory' }, 500);
  }
}

// ---- POST -----------------------------------------------------------------------------

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

// Shape-check `variants` (matching against the product happens after the colour backfill).
function readVariants(raw) {
  if (raw === undefined) return { variants: null };
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_TRACK) return { error: 'Invalid variants' };
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Invalid variants' };
    if (typeof v.colorId !== 'string' || v.colorId.length > 24) return { error: 'Invalid variants' };
    if (typeof v.size !== 'string' || v.size.length > 100) return { error: 'Invalid variants' };
    const available = v.available === undefined ? 0 : v.available;
    if (!isQty(available)) return { error: `available must be a whole number from 0 to ${MAX_QTY}` };
    const threshold = v.threshold === undefined ? null : v.threshold;
    if (threshold !== null && !isQty(threshold)) return { error: `threshold must be empty or a whole number from 0 to ${MAX_QTY}` };
    const k = JSON.stringify([v.colorId, v.size]);
    if (seen.has(k)) return { error: 'Duplicate variant' };
    seen.add(k);
    out.push({ colorId: v.colorId, size: v.size, available, threshold });
  }
  return { variants: out };
}

async function opTrack(db, body, admin) {
  const productId = readProductId(body.productId);
  if (!productId) return reply({ error: 'productId is required' }, 400);
  const parsedVariants = readVariants(body.variants);
  if (parsedVariants.error) return reply({ error: parsedVariants.error }, 400);
  const { variants } = parsedVariants;
  const opening = !!variants && variants.some((v) => v.available > 0);
  const reason = readReason(body.reason, opening, 'Start tracking');
  if (reason.error) return reply({ error: reason.error }, 400);

  const product = await loadProduct(db, productId);
  if (!product) return reply({ error: 'Unknown product' }, 404);

  // 1–2. Backfill missing colour ids, as a separate locked UPDATE (a 0-row lock inside a
  // batch would not roll back the inserts). updated_at is left alone: no reprice.
  const rawColours = typeof product.colors_json === 'string' ? product.colors_json : '';
  let colours = [];
  if (rawColours.trim()) {
    try { colours = JSON.parse(rawColours); } catch { colours = null; }
    if (!Array.isArray(colours)) return reply({ error: 'Product colours are malformed' }, 400);
  }
  const colours2 = invAssignColourIds(colours, colours);
  const changed = colours2.some((c, i) => c && typeof c === 'object' && c.id !== colours[i]?.id);
  if (changed) {
    const res = await db.prepare(
      'UPDATE showcase_products SET colors_json = ?2 WHERE id = ?1 AND colors_json = ?3'
    ).bind(productId, JSON.stringify(colours2), rawColours).run();
    if (res?.meta?.changes !== 1) return reply({ error: 'The product was just edited. Reload and try again.' }, 409);
  }

  // 3. Matrix with the backfilled ids; no null colour id may survive.
  const matrix = invProductMatrix({ ...product, colors_json: colours2 });
  if (matrix.some((c) => c.colorId === null)) {
    console.error('admin inventory: track left a colour without id', productId);
    return reply({ error: 'Could not start tracking' }, 500);
  }
  const cellKey = (colorId, size) => JSON.stringify([colorId, size]);
  const cells = new Map(matrix.map((c) => [cellKey(c.colorId, c.size), c]));

  // 4. Target cells.
  let targets;
  if (variants) {
    targets = [];
    for (const v of variants) {
      const cell = cells.get(cellKey(v.colorId, v.size));
      if (!cell) return reply({ error: `Unknown variant: ${v.colorId || '(no colour)'} / ${v.size || '(no size)'}` }, 400);
      targets.push({ cell, available: v.available, threshold: v.threshold });
    }
  } else {
    targets = matrix.map((cell) => ({ cell, available: 0, threshold: null }));
  }

  // 5. Skip cells that already have a row; collect taken sku codes.
  const existing = await db.prepare('SELECT sku, color_id, size FROM inventory WHERE product_id = ?1').bind(productId).all();
  const have = new Set((existing.results || []).map((r) => cellKey(r.color_id, r.size)));
  const takenRes = await db.prepare("SELECT sku FROM inventory WHERE sku LIKE ?1 ESCAPE '\\'")
    .bind(`${escapeLike(invSkuProductPart(product))}%`).all();
  const taken = new Set((takenRes.results || []).map((r) => r.sku));
  const todo = targets.filter((t) => !have.has(cellKey(t.cell.colorId, t.cell.size)));
  if (!todo.length) return reply({ ok: true, created: 0 });
  if (todo.length > MAX_TRACK) return reply({ error: 'Too many variants to track at once' }, 400);

  // 6. One 2-statement batch.
  const hasColours = colours2.length > 0;
  const rows = todo.map((t) => {
    const colour = hasColours ? { name: t.cell.colorName, id: t.cell.colorId } : null;
    const sku = invSkuCode(product, colour, t.cell.size, taken);
    taken.add(sku);
    return { sku, colorId: t.cell.colorId, size: t.cell.size, available: t.available, threshold: t.threshold };
  });
  const now = new Date().toISOString();
  // Version check inside the batch: rows are inserted only while colours/sizes are still
  // exactly what this matrix was built from, so a concurrent product save cannot swap the
  // colour ids underneath freshly tracked rows.
  const expect = { colorsJson: changed ? JSON.stringify(colours2) : (product.colors_json ?? null), sizesJson: product.sizes_json ?? null };
  let results;
  try {
    results = await db.batch(invTrackStatements(db, { productId, cells: rows, reason: reason.value, actor: `admin:${admin.username}`, now, expect }));
  } catch (e) {
    const kind = invClassifyError(e);
    if (kind === 'duplicate') return reply({ error: 'Tracking changed, reload and try again' }, 409);
    throw e;
  }
  if (Number(results?.[0]?.meta?.changes) !== rows.length) {
    console.warn('admin inventory: track skipped, product changed concurrently', productId);
    return reply({ error: 'The product was just edited. Reload and try again.' }, 409);
  }
  console.log(`admin inventory: ${admin.username} tracked ${rows.length} variant(s) of ${productId}`);
  return reply({ ok: true, created: rows.length });
}

async function opSet(db, body, admin) {
  const sku = readSku(body.sku);
  if (!sku) return reply({ error: 'Invalid sku' }, 400);
  const qtyMsg = `available must be a whole number from 0 to ${MAX_QTY}`;
  if (!isQty(body.available)) return reply({ error: qtyMsg }, 400);
  if (!isQty(body.expected)) return reply({ error: `expected must be a whole number from 0 to ${MAX_QTY}` }, 400);
  const reason = readReason(body.reason, true);
  if (reason.error) return reply({ error: reason.error }, 400);

  const row = await loadRow(db, sku);
  if (!row) return reply({ error: 'Unknown sku' }, 404);
  const conflict = (r) => reply({ error: `Stock changed since you loaded it (now ${r.available} available). Reload and try again.`, row: rowOut(r) }, 409);
  if (row.available !== body.expected) return conflict(row);
  if (body.available === body.expected) return reply({ ok: true, row: rowOut(row) });

  const results = await db.batch(invSetStatements(db, {
    sku, available: body.available, expected: body.expected, reason: reason.value, actor: `admin:${admin.username}`, now: new Date().toISOString(),
  }));
  const fresh = await loadRow(db, sku);
  if (!results?.[0]?.meta?.changes) return fresh ? conflict(fresh) : reply({ error: 'Unknown sku' }, 404);
  console.log(`admin inventory: ${admin.username} set ${sku} available ${body.expected} -> ${body.available}`);
  return reply({ ok: true, row: rowOut(fresh) });
}

async function opAdjust(db, body, admin) {
  const sku = readSku(body.sku);
  if (!sku) return reply({ error: 'Invalid sku' }, 400);
  const { delta } = body;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_QTY) {
    return reply({ error: `delta must be a non-zero whole number from -${MAX_QTY} to ${MAX_QTY}` }, 400);
  }
  const reason = readReason(body.reason, true);
  if (reason.error) return reply({ error: reason.error }, 400);

  const row = await loadRow(db, sku);
  if (!row) return reply({ error: 'Unknown sku' }, 404);
  try {
    await db.batch(invAdjustStatements(db, { sku, delta, reason: reason.value, actor: `admin:${admin.username}`, now: new Date().toISOString() }));
  } catch (e) {
    if (invClassifyError(e) === 'insufficient') {
      const fresh = await loadRow(db, sku);
      return reply({ error: `Only ${fresh ? fresh.available : row.available} available; cannot remove ${-delta}.`, row: rowOut(fresh || row) }, 400);
    }
    throw e;
  }
  const fresh = await loadRow(db, sku);
  console.log(`admin inventory: ${admin.username} adjusted ${sku} available by ${delta}`);
  return reply({ ok: true, row: rowOut(fresh) });
}

async function opThreshold(db, body, admin) {
  const sku = readSku(body.sku);
  if (!sku) return reply({ error: 'Invalid sku' }, 400);
  const threshold = body.threshold === undefined ? undefined : body.threshold;
  if (threshold === undefined || (threshold !== null && !isQty(threshold))) {
    return reply({ error: `threshold must be empty or a whole number from 0 to ${MAX_QTY}` }, 400);
  }
  const reason = readReason(body.reason, false, threshold === null ? 'Low-stock threshold cleared' : `Low-stock threshold ${threshold}`);
  if (reason.error) return reply({ error: reason.error }, 400);

  const row = await loadRow(db, sku);
  if (!row) return reply({ error: 'Unknown sku' }, 404);
  try {
    await db.batch(invThresholdStatements(db, { sku, threshold, reason: reason.value, actor: `admin:${admin.username}`, now: new Date().toISOString() }));
  } catch (e) {
    if (invClassifyError(e) === 'missing_table') throw e;
    console.error('admin inventory: threshold', sku, e?.message);
    return reply({ error: 'Could not update threshold' }, 500);
  }
  const fresh = await loadRow(db, sku);
  return reply({ ok: true, row: rowOut(fresh) });
}

// ---- One-off maintenance: rebuild stock from one showcase order -----------------------
// Everything is computed before the batch, so a mapping failure leaves the data untouched.
// All writes (colour id backfill, wipe, seed) run in one D1 batch = one transaction.
const IVR_CONFIRM = 'RESET-INVENTORY';
const IVR_ORDER_RE = /^SHOWCASE-\d{8}-\d{3,}$/;
const IVR_MOVEMENT_COLS = `(sku, type, d_available, d_reserved, d_incoming, d_damaged,
  available_after, reserved_after, incoming_after, damaged_after, reason, ref_order_no, actor, created_at)`;

async function ivrResetFromOrder(db, body, admin) {
  if (body.confirm !== IVR_CONFIRM) return reply({ error: 'Confirmation required' }, 400);
  const orderNo = typeof body.orderNo === 'string' ? body.orderNo.trim() : '';
  if (!IVR_ORDER_RE.test(orderNo)) return reply({ error: 'Invalid showcase order number' }, 400);

  const order = await db.prepare(
    'SELECT order_no, status, items_json, item_count, total FROM orders WHERE order_no = ?1'
  ).bind(orderNo).first();
  if (!order) return reply({ error: 'Unknown order' }, 404);
  if (String(order.status).toLowerCase() === 'cancelled') {
    return reply({ error: 'A cancelled order cannot seed stock' }, 400);
  }
  let items;
  try { items = JSON.parse(order.items_json || '[]'); } catch { return reply({ error: 'Order items are malformed' }, 400); }
  if (!Array.isArray(items) || !items.length || items.length > MAX_TRACK) {
    return reply({ error: 'Invalid order items' }, 400);
  }

  const byProduct = new Map();
  for (const it of items) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return reply({ error: 'Invalid order item' }, 400);
    const productId = typeof it.productId === 'string' ? it.productId.trim() : '';
    const qty = Number(it.quantity);
    if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
      return reply({ error: 'Invalid order item quantity' }, 400);
    }
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(it);
  }

  const taken = new Set();
  const cells = [];
  const colourUpdates = [];
  const now = new Date().toISOString();
  const actor = `admin:${admin.username}`;
  const reason = `Opening stock from ${orderNo}`;

  for (const [productId, lines] of byProduct) {
    const product = await loadProduct(db, productId);
    if (!product) return reply({ error: `Unknown product ${productId}` }, 404);
    const rawColours = typeof product.colors_json === 'string' ? product.colors_json : '';
    let colours = [];
    if (rawColours.trim()) {
      try { colours = JSON.parse(rawColours); } catch { return reply({ error: `Malformed colours: ${productId}` }, 400); }
      if (!Array.isArray(colours)) return reply({ error: `Malformed colours: ${productId}` }, 400);
    }
    // Same id backfill as opTrack: only adds ids, never changes names/order/hex.
    const colours2 = invAssignColourIds(colours, colours);
    const changed = colours2.some((c, i) => c && typeof c === 'object' && c.id !== colours[i]?.id);
    if (changed) colourUpdates.push({ productId, rawColours, next: JSON.stringify(colours2) });
    const matrix = invProductMatrix({ ...product, colors_json: colours2 });
    if (matrix.some((c) => c.colorId === null)) {
      return reply({ error: `Could not assign colour ids: ${productId}` }, 500);
    }
    const hasColours = colours2.length > 0;
    for (const it of lines) {
      const name = String(it.colorName ?? '').trim();
      const candidates = matrix.filter((c) => String(c.colorName ?? '').trim() === name);
      if (candidates.length !== 1) {
        return reply({ error: `Ambiguous colour for ${productId}: ${name || '(unnamed)'}` }, 400);
      }
      const cell = candidates[0];
      // Guard against a colour reorder since the order was placed.
      if (Number.isInteger(it.colorIndex) && cell.colorIndex !== it.colorIndex) {
        return reply({ error: `Colour index changed for ${productId}: ${name}` }, 400);
      }
      const colour = hasColours ? { name: cell.colorName, id: cell.colorId } : null;
      const sku = invSkuCode(product, colour, cell.size, taken);
      taken.add(sku);
      cells.push({
        sku,
        productId,
        colorId: String(cell.colorId ?? ''),
        size: String(cell.size ?? ''),
        available: Number(it.quantity),
        threshold: null,
        colorName: cell.colorName,
      });
    }
  }
  if (cells.length !== items.length) return reply({ error: 'Could not resolve all order lines' }, 500);

  const payload = JSON.stringify(cells.map((c) => ({
    sku: c.sku, productId: c.productId, colorId: c.colorId, size: c.size,
    available: c.available, threshold: c.threshold,
  })));
  const stmts = colourUpdates.map((u) => db.prepare(
    'UPDATE showcase_products SET colors_json = ?2 WHERE id = ?1 AND colors_json = ?3'
  ).bind(u.productId, u.next, u.rawColours));
  // order_stock_lines references inventory -> delete it first; movements have no FK.
  stmts.push(db.prepare('DELETE FROM order_stock_lines'));
  stmts.push(db.prepare('DELETE FROM inventory'));
  stmts.push(db.prepare('DELETE FROM inventory_movements'));
  stmts.push(db.prepare(`WITH n AS (
    SELECT json_extract(value, '$.sku') AS sku, json_extract(value, '$.productId') AS product_id,
           json_extract(value, '$.colorId') AS color_id, json_extract(value, '$.size') AS size,
           json_extract(value, '$.available') AS available, json_extract(value, '$.threshold') AS threshold
    FROM json_each(?1))
  INSERT INTO inventory (sku, product_id, color_id, size, available, reserved, incoming, damaged,
                         low_stock_threshold, created_by, created_at, updated_at)
  SELECT sku, product_id, color_id, size, available, 0, 0, 0, threshold, ?2, ?3, ?3 FROM n`
  ).bind(payload, actor, now));
  stmts.push(db.prepare(`WITH n AS (SELECT json_extract(value, '$.sku') AS sku FROM json_each(?1))
  INSERT INTO inventory_movements ${IVR_MOVEMENT_COLS}
  SELECT i.sku, 'track', i.available, 0, 0, 0, i.available, i.reserved, i.incoming, i.damaged, ?2, ?3, ?4, ?5
  FROM inventory i JOIN n ON n.sku = i.sku`
  ).bind(payload, reason, orderNo, actor, now));

  const results = await db.batch(stmts);
  const base = colourUpdates.length;
  const inserted = Number(results?.[base + 3]?.meta?.changes) || 0;
  if (inserted !== cells.length) return reply({ error: 'Stock reset was incomplete' }, 500);
  const units = cells.reduce((s, c) => s + c.available, 0);
  console.log(`admin inventory: ${admin.username} reset stock from ${orderNo}: ${inserted} rows / ${units} units`);
  return reply({
    ok: true,
    orderNo,
    status: order.status,
    deleted: {
      inventory: Number(results?.[base + 1]?.meta?.changes) || 0,
      movements: Number(results?.[base + 2]?.meta?.changes) || 0,
      stockLines: Number(results?.[base]?.meta?.changes) || 0,
    },
    created: inserted,
    units,
    products: byProduct.size,
    colorIdsAssigned: colourUpdates.length,
    lines: cells.map((c) => ({
      sku: c.sku, productId: c.productId, color: c.colorName, size: c.size, available: c.available,
    })),
  });
}

const OPS = {
  track: opTrack, set: opSet, adjust: opAdjust, threshold: opThreshold,
  resetFromOrder: ivrResetFromOrder,
};
const OP_ERRORS = {
  track: 'Could not start tracking',
  set: 'Could not update stock',
  adjust: 'Could not update stock',
  threshold: 'Could not update threshold',
  resetFromOrder: 'Could not reset stock from order',
};

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply({ error: 'Database binding is not configured' }, 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status);
  const { body } = parsed;
  const op = typeof body.op === 'string' ? body.op.trim() : '';
  if (!Object.prototype.hasOwnProperty.call(OPS, op)) return reply({ error: 'Unknown op' }, 400);

  await ensureSchema(env);
  try {
    return await OPS[op](env.DB, body, admin);
  } catch (e) {
    if (invClassifyError(e) === 'missing_table') return reply({ error: MIGRATION_MESSAGE }, 503);
    console.error(`admin inventory: ${op}`, body.productId || body.sku || '', e?.message);
    return reply({ error: OP_ERRORS[op] }, 500);
  }
}
