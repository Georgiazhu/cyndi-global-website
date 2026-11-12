// Guangzhou warehouse inventory for Showcase variants (migrations/0013_inventory.sql).
//
// A variant is (showcase_products.id, colour id, size). It is tracked iff it has a row in
// `inventory`; untracked variants are unlimited and behave exactly as before.
//
// All inventory SQL lives in this module. Callers:
//  - functions/api/showcase/orders.js  reserve on place, release on customer cancel
//  - functions/api/admin/orders.js     release / ship / unship on admin status change
//  - functions/api/admin/inventory.js  track / set / adjust / threshold
//
// Statement builders return arrays of D1 prepared statements; the caller owns db.batch().
// Every batch has a constant number of statements: per-sku data travels as one JSON
// payload read with json_each(?1). Oversell protection is the named CHECK constraint
// inv_available_nonneg: the decrementing UPDATE has no "available >= qty" predicate, so a
// short sku raises an error and the whole batch (order INSERT included) rolls back.
//
// Names use an `inv` prefix because Pages bundles _lib modules into one namespace.

import { DISPATCHED_STATUSES } from './order-status.js';

export const INV_COLOUR_ID_RE = /^[a-z0-9_]{1,24}$/;
export const INV_SKU_RE = /^[A-Z0-9-]{1,64}$/;
export const INV_ORDER_NO_ATTEMPTS = 5;
const INV_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const INV_LOAD_CHUNK = 90;

const invParseArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const invIsObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const invValidColourId = (id) => typeof id === 'string' && INV_COLOUR_ID_RE.test(id);
const invColourIdOrNull = (c) => (invIsObject(c) && invValidColourId(c.id) ? c.id : null);
const invNameKey = (c) => `${String(c?.name ?? '').trim()}\u0000${String(c?.hex ?? '').toLowerCase()}`;

function invRandomColourId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = 'c_';
  for (const b of bytes) s += INV_ID_CHARS[b % INV_ID_CHARS.length];
  return s;
}

/**
 * Give every colour a stable id, unique within the product.
 *  1. keep a supplied valid id (first use only; a duplicate is treated as missing);
 *  2. else reuse the id of the first previous colour with the same name + hex whose id is
 *     valid and not used / claimed by another incoming colour;
 *  3. else mint `c_` + 6 random [a-z0-9].
 * Only `id` is set; non-object entries pass through untouched.
 */
export function invAssignColourIds(incoming, previous) {
  if (!Array.isArray(incoming)) return [];
  const prev = Array.isArray(previous) ? previous : [];

  // Ids that rule 1 keeps (first occurrence of each valid supplied id).
  const claimed = new Set();
  const keepIndex = new Set();
  incoming.forEach((c, i) => {
    if (invIsObject(c) && invValidColourId(c.id) && !claimed.has(c.id)) {
      claimed.add(c.id);
      keepIndex.add(i);
    }
  });

  const used = new Set();
  return incoming.map((c, i) => {
    if (!invIsObject(c)) return c;
    if (keepIndex.has(i)) {
      used.add(c.id);
      return { ...c };
    }
    const key = invNameKey(c);
    const match = prev.find((p) => invIsObject(p) && invValidColourId(p.id) && !used.has(p.id)
      && !claimed.has(p.id) && invNameKey(p) === key);
    let id = match ? match.id : null;
    while (!id || used.has(id) || claimed.has(id)) id = invRandomColourId();
    used.add(id);
    return { ...c, id };
  });
}

export function invVariantKey(productId, colorId, size) {
  return JSON.stringify([productId, colorId, size]);
}

/**
 * Every colour × size cell of a showcase_products row (colors_json / sizes_json).
 * No colours -> colorId '' / colorIndex null; no sizes -> size ''.
 * A colour without a valid id gets colorId null (never tracked until an id is assigned).
 */
export function invProductMatrix(product) {
  const colours = invParseArray(product?.colors_json);
  const sizes = invParseArray(product?.sizes_json).filter((s) => typeof s === 'string');
  const sizeList = sizes.length ? sizes : [''];
  const out = [];
  const seen = new Set();
  const colourList = colours.length ? colours.map((c, i) => ({ c, i })) : [{ c: null, i: null }];
  for (const { c, i } of colourList) {
    const colorId = i === null ? '' : invColourIdOrNull(c);
    const colorName = invIsObject(c) ? String(c.name ?? '') : '';
    const colorHex = invIsObject(c) ? String(c.hex ?? '') : '';
    for (const size of sizeList) {
      const k = JSON.stringify([colorId === null ? `#${i}` : colorId, size]);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ colorId, colorName, colorHex, colorIndex: i, size });
    }
  }
  return out;
}

function invSlug(v) {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/^-+|-+$/g, '');
}

// First part of every sku code of a product (used to find codes that could collide).
export function invSkuProductPart(product) {
  return invSlug(product?.sku) || invSlug(product?.id) || 'P';
}

/**
 * Immutable inventory sku code: {sku or id}-{colour name or id}-{size or OS}, uppercase
 * [A-Z0-9-], ≤ 64 chars, de-duplicated against `taken` with -2, -3, …
 * `colour` is null when the product has no colours (the colour part is omitted).
 * The caller adds the result to `taken`.
 */
export function invSkuCode(product, colour, size, taken = new Set()) {
  const parts = [invSkuProductPart(product)];
  if (colour) parts.push(invSlug(colour.name) || invSlug(colour.id) || 'C');
  parts.push(invSlug(size) || 'OS');
  const base = parts.join('-').slice(0, 60).replace(/^-+|-+$/g, '');
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
  if (!INV_SKU_RE.test(code)) throw new Error(`invSkuCode: generated an invalid sku "${code}"`);
  return code;
}

// Stock effect of an order status change: 'release' | 'ship' | 'unship' | null.
export function invStockEffect(from, to) {
  const fromDispatched = DISPATCHED_STATUSES.includes(from);
  const toDispatched = DISPATCHED_STATUSES.includes(to);
  if (to === 'cancelled' && !fromDispatched && from !== 'cancelled') return 'release';
  if (to === 'shipped' && !fromDispatched) return 'ship';
  if (fromDispatched && !toDispatched && to !== 'cancelled') return 'unship';
  return null;
}

// Classify a D1 error by its message (constraint names are stable).
export function invClassifyError(e) {
  const msg = `${String(e?.message || e || '')} ${String(e?.cause?.message || '')}`;
  if (/no such table/i.test(msg) && /\b(inventory|order_stock_lines|inventory_movements)\b/.test(msg)) return 'missing_table';
  if (msg.includes('inv_available_nonneg')) return 'insufficient';
  if (/inv_(reserved|incoming|damaged)_nonneg/.test(msg)) return 'inconsistent';
  if (msg.includes('FOREIGN KEY constraint failed')) return 'fk';
  if (msg.includes('UNIQUE constraint failed: orders.order_no')) return 'order_no_taken';
  if (msg.includes('UNIQUE constraint failed: inventory.')) return 'duplicate';
  return null;
}

// Tracked rows for the given products; [] when 0013 has not been applied.
export async function invLoadForProducts(db, productIds) {
  const ids = [...new Set((productIds || []).filter((v) => typeof v === 'string' && v))];
  const rows = [];
  try {
    for (let i = 0; i < ids.length; i += INV_LOAD_CHUNK) {
      const chunk = ids.slice(i, i + INV_LOAD_CHUNK);
      const ph = chunk.map((_, j) => `?${j + 1}`).join(', ');
      const res = await db.prepare(
        `SELECT sku, product_id, color_id, size, available FROM inventory WHERE product_id IN (${ph})`
      ).bind(...chunk).all();
      rows.push(...(res?.results || []));
    }
  } catch (e) {
    if (invClassifyError(e) === 'missing_table') return [];
    throw e;
  }
  return rows;
}

/**
 * Map validated order lines to inventory skus and pre-check stock (advisory; the CHECK
 * constraint is the real guard).
 *  products: id -> showcase_products row; lines: [{n, productId, colorIndex, size, quantity}];
 *  rows: invLoadForProducts result.
 * Returns {error} (HTTP 400) or {lineSkus, needs: Map sku -> {...}, shortages}.
 */
export function invResolveOrderLines(products, lines, rows) {
  const byKey = new Map();
  const tracked = new Set();
  for (const r of rows || []) {
    tracked.add(r.product_id);
    byKey.set(invVariantKey(r.product_id, r.color_id, r.size), r);
  }
  const lineSkus = [];
  const needs = new Map();
  for (const l of lines) {
    const p = products[l.productId];
    if (!p || !tracked.has(l.productId)) {
      lineSkus.push(null);
      continue;
    }
    const colours = invParseArray(p.colors_json);
    const sizes = invParseArray(p.sizes_json);
    if (colours.length && l.colorIndex === null) return { error: `Line ${l.n}: please choose a colour for ${p.name}` };
    if (sizes.length && l.size === null) return { error: `Line ${l.n}: please choose a size for ${p.name}` };
    const colour = colours.length ? colours[l.colorIndex] : null;
    const colorId = colours.length ? invColourIdOrNull(colour) : '';
    const size = sizes.length ? l.size : '';
    const row = colorId === null ? null : byKey.get(invVariantKey(l.productId, colorId, size));
    if (!row) {
      lineSkus.push(null);
      continue;
    }
    lineSkus.push(row.sku);
    const prev = needs.get(row.sku);
    if (prev) prev.qty += l.quantity;
    else {
      needs.set(row.sku, {
        qty: l.quantity,
        available: Number(row.available) || 0,
        line: l.n,
        productId: l.productId,
        colorIndex: l.colorIndex,
        size: l.size,
        name: p.name,
        colorName: invIsObject(colour) && colour.name ? String(colour.name) : null,
      });
    }
  }
  const shortages = [];
  for (const v of needs.values()) {
    if (v.qty > v.available) {
      shortages.push({
        line: v.line,
        productId: v.productId,
        colorIndex: v.colorIndex,
        size: v.size,
        name: v.name,
        colorName: v.colorName,
        requested: v.qty,
        available: v.available,
      });
    }
  }
  return { lineSkus, needs, shortages };
}

// Human-readable 409 text for INSUFFICIENT_STOCK.
export function invStockShortMessage(shortages) {
  const list = Array.isArray(shortages) ? shortages : [];
  const sentences = list.slice(0, 3).map((s) => {
    const parts = [s.colorName, s.size].filter(Boolean);
    const label = `${s.name || 'This item'}${parts.length ? ` (${parts.join(' / ')})` : ''}`;
    const n = Math.max(0, Number(s.available) || 0);
    return n === 0 ? `${label} is out of stock.` : `Only ${n} left of ${label}. Please reduce the quantity.`;
  });
  const more = list.length - sentences.length;
  return sentences.join(' ') + (more > 0 ? ` … and ${more} more item(s).` : '');
}

// ---- Product edit / delete guard (spec §6.3) --------------------------------------------

// Map key for a (colour id, size) cell of one product.
export const invCellKey = (colorId, size) => JSON.stringify([colorId, size]);

/**
 * Inventory rows of one product that a save or delete would unlink.
 * `current` is the stored showcase_products row, `next` the row after the save
 * ({colors_json, sizes_json}); `next = null` means delete, which affects every row.
 * A save only affects rows the current matrix still links: rows that are already
 * unlinked stay as they are and do not block later saves.
 */
export function invRowsUnlinkedBy(rows, current, next) {
  const linked = (p) => new Set(invProductMatrix(p).filter((c) => c.colorId !== null).map((c) => invCellKey(c.colorId, c.size)));
  const list = Array.isArray(rows) ? rows : [];
  if (!next) return list.slice();
  const before = linked(current);
  const after = linked(next);
  return list.filter((r) => {
    const k = invCellKey(r.color_id, r.size);
    return before.has(k) && !after.has(k);
  });
}

// "Product (Colour / Size)" for an inventory row, using the product's current colour names.
export function invRowLabel(product, row) {
  const colour = invParseArray(product?.colors_json).find((c) => invIsObject(c) && c.id === row.color_id);
  const parts = [row.color_id ? String(colour?.name || row.color_id) : '', row.size || ''].filter(Boolean);
  return String(product?.name || row.product_id || '') + (parts.length ? ` (${parts.join(' / ')})` : '');
}

/**
 * Verdict for rows about to be unlinked (`affected` = [{row, label}]):
 *  - any reserved > 0                 -> {code:'STOCK_RESERVED'}: refuse (ship or cancel first);
 *  - any other affected row, even all-zero -> {code:'STOCK_CONFIRM_REQUIRED'}: needs confirmStockOrphan
 *    (an unlinked out-of-stock variant would otherwise silently become unlimited);
 *  - no affected rows -> null.
 */
export function invUnlinkVerdict(affected) {
  const list = Array.isArray(affected) ? affected : [];
  const out = (a) => ({ sku: a.row.sku, label: a.label, available: a.row.available, reserved: a.row.reserved,
    incoming: a.row.incoming, damaged: a.row.damaged });
  const join = (sentences) => sentences.slice(0, 3).join(' ')
    + (sentences.length > 3 ? ` … and ${sentences.length - 3} more variant(s).` : '');
  const reserved = list.filter((a) => Number(a.row.reserved) > 0);
  if (reserved.length) {
    return {
      code: 'STOCK_RESERVED',
      variants: reserved.map(out),
      error: join(reserved.map((a) => `${a.label} has ${a.row.reserved} unit(s) reserved by open orders; ship or cancel them first.`)),
    };
  }
  // Any other tracked row also needs confirmation, including an all-zero one: once
  // unlinked, the variant that replaces it has no row and so has no stock limit.
  if (list.length) {
    const hasStock = (a) => Number(a.row.available) > 0 || Number(a.row.incoming) > 0 || Number(a.row.damaged) > 0;
    return {
      code: 'STOCK_CONFIRM_REQUIRED',
      variants: list.map(out),
      error: join(list.map((a) => (hasStock(a)
        ? `${a.label} still has stock (available ${a.row.available}, incoming ${a.row.incoming}, damaged ${a.row.damaged}).`
        : `${a.label} is tracked and out of stock.`)))
        + ' Its stock row will no longer match the product, and the changed variant will not be stock-limited until you track it again.',
    };
  }
  return null;
}

/**
 * Open-order lines placed before tracking: items of `product` in the given orders
 * (pending/processing, already filtered by the caller) that carry no stockSku, so they
 * never reserved stock. Returns {count, quantity, orders:[{orderNo,status,quantity}],
 * cells: Map invCellKey(colorIndex or '', size) -> quantity}, matching invProductMatrix
 * cells by their colorIndex (null colorIndex = no colours -> '').
 */
export function invOpenOrderLines(product, orderRows) {
  const colours = invParseArray(product?.colors_json);
  const sizes = invParseArray(product?.sizes_json);
  const cells = new Map();
  const orders = [];
  let quantity = 0;
  for (const o of Array.isArray(orderRows) ? orderRows : []) {
    let qty = 0;
    for (const it of invParseArray(o.items_json)) {
      if (!invIsObject(it) || it.productId !== product?.id || it.stockSku) continue;
      const q = Math.max(0, Math.floor(Number(it.quantity) || 0));
      if (!q) continue;
      // Keyed by colour index, as the order resolves colours[colorIndex] (works before ids exist).
      const colour = colours.length
        ? (Number.isInteger(it.colorIndex) && it.colorIndex >= 0 && it.colorIndex < colours.length ? it.colorIndex : null)
        : '';
      const size = sizes.length ? (typeof it.size === 'string' && sizes.includes(it.size) ? it.size : null) : '';
      if (colour !== null && size !== null) {
        const k = invCellKey(colour, size);
        cells.set(k, (cells.get(k) || 0) + q);
      }
      qty += q;
    }
    if (qty) {
      orders.push({ orderNo: o.order_no, status: o.status, quantity: qty });
      quantity += qty;
    }
  }
  return { count: orders.length, quantity, orders, cells };
}

// ---- Statement builders ----------------------------------------------------------------

// D1 rejects binding more values than the highest ?N in the statement, so bind only up to
// the highest index the SQL actually references (placeholders are positional by number).
function invBind(db, sql, args) {
  let max = 0;
  for (const m of sql.matchAll(/\?(\d+)/g)) max = Math.max(max, Number(m[1]));
  return db.prepare(sql).bind(...args.slice(0, max));
}

const INV_MOVEMENT_COLS = `(sku, type, d_available, d_reserved, d_incoming, d_damaged,
  available_after, reserved_after, incoming_after, damaged_after, reason, ref_order_no, actor, created_at)`;

function invNeedsJson(needs) {
  const entries = needs instanceof Map ? [...needs] : Object.entries(needs || {});
  return JSON.stringify(entries.map(([sku, v]) => ({ sku, qty: typeof v === 'number' ? v : Number(v?.qty) })));
}

const INV_NEEDS_CTE = `WITH n AS (SELECT json_extract(value, '$.sku') AS sku, json_extract(value, '$.qty') AS qty FROM json_each(?1))`;

// Reserve: available -> reserved for every sku in `needs` (Map sku -> {qty} or {sku: qty}).
// The caller puts the order INSERT first in the same batch.
export function invReserveStatements(db, { orderNo, now, actor, needs }) {
  const payload = invNeedsJson(needs);
  return [
    invBind(db, `${INV_NEEDS_CTE}
UPDATE inventory
SET available = available - (SELECT qty FROM n WHERE n.sku = inventory.sku),
    reserved = reserved + (SELECT qty FROM n WHERE n.sku = inventory.sku),
    updated_at = ?2
WHERE sku IN (SELECT sku FROM n)`, [payload, now]),
    invBind(db, `${INV_NEEDS_CTE}
INSERT INTO order_stock_lines (order_no, sku, qty, state, created_at, updated_at)
SELECT ?2, sku, qty, 'reserved', ?3, ?3 FROM n`, [payload, orderNo, now]),
    invBind(db, `${INV_NEEDS_CTE}
INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT i.sku, 'reserve', -n.qty, n.qty, 0, 0, i.available, i.reserved, i.incoming, i.damaged, NULL, ?2, ?3, ?4
FROM inventory i JOIN n ON n.sku = i.sku`, [payload, orderNo, actor, now]),
  ];
}

// Fixed literals per effect (never user input).
const INV_TRANSITIONS = {
  release: {
    fromState: 'reserved', toState: 'released', type: 'release',
    set: (q) => `reserved = reserved - ${q}, available = available + ${q}`,
    dAvailable: 'l.qty', dReserved: '-l.qty',
  },
  ship: {
    fromState: 'reserved', toState: 'shipped', type: 'ship',
    set: (q) => `reserved = reserved - ${q}`,
    dAvailable: '0', dReserved: '-l.qty',
  },
  unship: {
    fromState: 'shipped', toState: 'reserved', type: 'unship',
    set: (q) => `reserved = reserved + ${q}`,
    dAvailable: '0', dReserved: 'l.qty',
  },
};

/**
 * Release / ship / unship the order's stock lines. Binds [orderNo ?1, now ?2, actor ?3,
 * ...guardBinds ?4…]. guardSql is an EXISTS(...) over `orders o` (qualified columns) that
 * checks the pre-change status; the caller appends its order UPDATE as the last statement.
 */
export function invTransitionStatements(db, { effect, orderNo, now, actor, guardSql, guardBinds = [] }) {
  const t = Object.prototype.hasOwnProperty.call(INV_TRANSITIONS, effect) ? INV_TRANSITIONS[effect] : null;
  if (!t) throw new Error(`invTransitionStatements: unknown effect "${effect}"`);
  if (typeof guardSql !== 'string' || !guardSql.trim()) throw new Error('invTransitionStatements: guardSql is required');
  const args = [orderNo, now, actor, ...guardBinds];
  const q = '(SELECT qty FROM l WHERE l.sku = inventory.sku)';
  return [
    invBind(db, `WITH l AS (SELECT sku, qty FROM order_stock_lines WHERE order_no = ?1 AND state = '${t.fromState}')
UPDATE inventory SET ${t.set(q)}, updated_at = ?2
WHERE sku IN (SELECT sku FROM l) AND ${guardSql}`, args),
    invBind(db, `INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT i.sku, '${t.type}', ${t.dAvailable}, ${t.dReserved}, 0, 0, i.available, i.reserved, i.incoming, i.damaged, NULL, ?1, ?3, ?2
FROM order_stock_lines l JOIN inventory i ON i.sku = l.sku
WHERE l.order_no = ?1 AND l.state = '${t.fromState}' AND ${guardSql}`, args),
    invBind(db, `UPDATE order_stock_lines SET state = '${t.toState}', updated_at = ?2
WHERE order_no = ?1 AND state = '${t.fromState}' AND ${guardSql}`, args),
  ];
}

const invIntOrNull = (v) => (v === null || v === undefined ? null : Math.trunc(Number(v)));

// Track: insert inventory rows for `cells` [{sku, colorId, size, available?, threshold?}]
// plus one 'track' movement each (d_available = opening stock). Constant 2 statements.
// With `expect` = {colorsJson, sizesJson} the rows are inserted only while the product's
// colours and sizes still equal those texts (a concurrent product save inserts nothing;
// the caller compares results[0].meta.changes with cells.length).
export function invTrackStatements(db, { productId, cells, reason, actor, now, expect }) {
  const payload = JSON.stringify((cells || []).map((c) => ({
    sku: String(c.sku),
    colorId: String(c.colorId ?? ''),
    size: String(c.size ?? ''),
    available: Math.trunc(Number(c.available) || 0),
    threshold: invIntOrNull(c.threshold),
  })));
  return [
    invBind(db, `WITH n AS (SELECT json_extract(value, '$.sku') AS sku, json_extract(value, '$.colorId') AS color_id,
                  json_extract(value, '$.size') AS size, json_extract(value, '$.available') AS available,
                  json_extract(value, '$.threshold') AS threshold
           FROM json_each(?1))
INSERT INTO inventory (sku, product_id, color_id, size, available, reserved, incoming, damaged,
                       low_stock_threshold, created_by, created_at, updated_at)
SELECT sku, ?2, color_id, size, available, 0, 0, 0, threshold, ?3, ?4, ?4 FROM n${expect
    ? '\nWHERE EXISTS (SELECT 1 FROM showcase_products p WHERE p.id = ?2 AND p.colors_json IS ?5 AND p.sizes_json IS ?6)'
    : ''}`, [payload, productId, actor, now, expect?.colorsJson ?? null, expect?.sizesJson ?? null]),
    invBind(db, `WITH n AS (SELECT json_extract(value, '$.sku') AS sku FROM json_each(?1))
INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT i.sku, 'track', i.available, 0, 0, 0, i.available, i.reserved, i.incoming, i.damaged, ?2, NULL, ?3, ?4
FROM inventory i JOIN n ON n.sku = i.sku`, [payload, reason ?? null, actor, now]),
  ];
}

// Set available to an absolute value, guarded by the value the admin saw (`expected`).
// The movement is written only when the lock hit (changes() = 1).
export function invSetStatements(db, { sku, available, expected, reason, actor, now }) {
  const args = [sku, available, now, expected, reason, actor];
  return [
    invBind(db, 'UPDATE inventory SET available = ?2, updated_at = ?3 WHERE sku = ?1 AND available = ?4', args),
    invBind(db, `INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT sku, 'adjust', ?2 - ?4, 0, 0, 0, available, reserved, incoming, damaged, ?5, NULL, ?6, ?3
FROM inventory WHERE sku = ?1 AND changes() = 1`, args),
  ];
}

// Apply a delta to available; a negative result fails CHECK inv_available_nonneg.
export function invAdjustStatements(db, { sku, delta, reason, actor, now }) {
  const args = [sku, delta, now, reason, actor];
  return [
    invBind(db, 'UPDATE inventory SET available = available + ?2, updated_at = ?3 WHERE sku = ?1', args),
    invBind(db, `INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT sku, 'adjust', ?2, 0, 0, 0, available, reserved, incoming, damaged, ?4, NULL, ?5, ?3
FROM inventory WHERE sku = ?1 AND changes() = 1`, args),
  ];
}

// Set or clear the low-stock threshold (all deltas 0).
export function invThresholdStatements(db, { sku, threshold, reason, actor, now }) {
  return [
    invBind(db, 'UPDATE inventory SET low_stock_threshold = ?2, updated_at = ?3 WHERE sku = ?1', [sku, threshold, now]),
    invBind(db, `INSERT INTO inventory_movements ${INV_MOVEMENT_COLS}
SELECT sku, 'threshold', 0, 0, 0, 0, available, reserved, incoming, damaged, ?2, NULL, ?3, ?4
FROM inventory WHERE sku = ?1 AND changes() = 1`, [sku, reason, actor, now]),
  ];
}
