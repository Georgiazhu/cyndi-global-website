// Unit tests for functions/_lib/inventory.js and the prepareInsertOrder split.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INV_COLOUR_ID_RE,
  INV_ORDER_NO_ATTEMPTS,
  invAssignColourIds,
  invVariantKey,
  invProductMatrix,
  invSkuCode,
  invStockEffect,
  invClassifyError,
  invResolveOrderLines,
  invStockShortMessage,
  invLoadForProducts,
  invReserveStatements,
  invTransitionStatements,
  invTrackStatements,
  invSetStatements,
  invAdjustStatements,
  invThresholdStatements,
  invRowsUnlinkedBy,
  invRowLabel,
  invUnlinkVerdict,
  invOpenOrderLines,
  invCellKey,
} from '../functions/_lib/inventory.js';
import { customerItem, insertOrder, prepareInsertOrder } from '../functions/_lib/orders.js';

// Fake D1: records the SQL and bound args of each statement.
function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const stmt = {
        sql,
        args: null,
        runs: 0,
        bind(...a) { this.args = a; return this; },
        async run() { this.runs += 1; return { meta: { changes: 1 } }; },
      };
      calls.push(stmt);
      return stmt;
    },
  };
}

// Every statement must reference its highest bound index and nothing above it.
function assertBindsMatch(stmts) {
  for (const s of stmts) {
    assert.ok(Array.isArray(s.args) && s.args.length > 0, 'statement is bound');
    assert.ok(s.sql.includes(`?${s.args.length}`), `sql references ?${s.args.length}:\n${s.sql}`);
    assert.ok(!new RegExp(`\\?${s.args.length + 1}(?!\\d)`).test(s.sql), `sql has no ?${s.args.length + 1}`);
  }
}

// ---- invStockEffect -------------------------------------------------------------------
test('invStockEffect matrix', () => {
  const cases = [
    ['pending', 'cancelled', 'release'],
    ['processing', 'cancelled', 'release'],
    ['legacy_status', 'cancelled', 'release'],
    ['cancelled', 'cancelled', null],
    ['shipped', 'cancelled', null],
    ['pending', 'shipped', 'ship'],
    ['processing', 'shipped', 'ship'],
    ['shipped', 'processing', 'unship'],
    ['in_transit', 'processing', 'unship'],
    ['delivered', 'pending', 'unship'],
    ['shipped', 'in_transit', null],
    ['in_transit', 'shipped', null],
    ['in_transit', 'delivered', null],
    ['shipped', 'delivered', null],
    ['pending', 'processing', null],
    ['processing', 'pending', null],
    ['legacy_status', 'processing', null],
  ];
  for (const [from, to, want] of cases) assert.equal(invStockEffect(from, to), want, `${from} -> ${to}`);
});

// ---- invAssignColourIds ----------------------------------------------------------------
test('invAssignColourIds keeps valid ids and touches nothing else', () => {
  const inc = [{ id: 'c_abc123', name: 'Black', hex: '#000', image: 'x' }];
  const out = invAssignColourIds(inc, []);
  assert.deepEqual(out, inc);
  assert.notEqual(out[0], inc[0], 'returns a copy');
});

test('invAssignColourIds reuses ids by name + hex', () => {
  const prev = [{ id: 'c_black1', name: 'Black', hex: '#000000' }, { id: 'c_red001', name: 'Red', hex: '#FF0000' }];
  const out = invAssignColourIds([{ name: ' Red ', hex: '#ff0000' }, { name: 'Black', hex: '#000000' }], prev);
  assert.equal(out[0].id, 'c_red001');
  assert.equal(out[1].id, 'c_black1');
  assert.equal(out[0].name, ' Red ');
});

test('invAssignColourIds does not reuse an id claimed by another incoming colour', () => {
  const prev = [{ id: 'c_black1', name: 'Black', hex: '#000' }];
  const out = invAssignColourIds([{ name: 'Black', hex: '#000' }, { id: 'c_black1', name: 'Noir', hex: '#111' }], prev);
  assert.equal(out[1].id, 'c_black1');
  assert.notEqual(out[0].id, 'c_black1');
  assert.match(out[0].id, /^c_[a-z0-9]{6}$/);
});

test('invAssignColourIds treats a duplicate supplied id as missing', () => {
  const out = invAssignColourIds([{ id: 'c_same01', name: 'A' }, { id: 'c_same01', name: 'B' }], []);
  assert.equal(out[0].id, 'c_same01');
  assert.notEqual(out[1].id, 'c_same01');
  assert.match(out[1].id, INV_COLOUR_ID_RE);
});

test('invAssignColourIds replaces invalid ids, generates unique ids', () => {
  const inc = Array.from({ length: 50 }, (_, i) => ({ id: i % 2 ? 'BAD ID' : undefined, name: `C${i}` }));
  const out = invAssignColourIds(inc, null);
  const ids = out.map((c) => c.id);
  for (const id of ids) assert.match(id, /^c_[a-z0-9]{6}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('invAssignColourIds handles non-array input and non-object entries', () => {
  assert.deepEqual(invAssignColourIds(null, []), []);
  assert.deepEqual(invAssignColourIds('x', 'y'), []);
  const out = invAssignColourIds(['str', null, { name: 'A' }], 'not-an-array');
  assert.equal(out[0], 'str');
  assert.equal(out[1], null);
  assert.match(out[2].id, INV_COLOUR_ID_RE);
});

// ---- invSkuCode ------------------------------------------------------------------------
test('invSkuCode slugging and fallbacks', () => {
  assert.equal(invSkuCode({ sku: 't3265271', id: 'p1' }, { name: 'Trench Coat', id: 'c_x' }, 'One Size'), 'T3265271-TRENCH-COAT-ONE-SIZE');
  assert.equal(invSkuCode({ sku: '', id: 'cy-tote-001' }, null, ''), 'CY-TOTE-001-OS');
  assert.equal(invSkuCode({ sku: '***', id: '%%%' }, { name: '中文', id: 'c_ab12cd' }, '!!'), 'P-C-AB12CD-OS');
  assert.equal(invSkuCode({ sku: '***', id: 'abc' }, { name: '', id: '' }, 'M'), 'ABC-C-M');
});

test('invSkuCode caps parts at 20 and total at 60 without dangling dashes', () => {
  const code = invSkuCode({ sku: 'ABCDEFGHIJKLMNOPQRS-TUVWXYZ' }, { name: 'aaaaaaaaaaaaaaaaaaa bbbb' }, 'x'.repeat(30));
  for (const part of ['ABCDEFGHIJKLMNOPQRS', 'AAAAAAAAAAAAAAAAAAA']) assert.ok(code.includes(part));
  assert.ok(!/--/.test(code));
  assert.ok(!/^-|-$/.test(code));
  const long = invSkuCode({ sku: 'A'.repeat(40) }, { name: 'B'.repeat(40) }, 'C'.repeat(40));
  assert.ok(long.length <= 62);
  assert.match(long, /^[A-Z0-9-]{1,64}$/);
});

test('invSkuCode de-duplicates with -2, -3', () => {
  const taken = new Set(['X-OS', 'X-OS-2']);
  assert.equal(invSkuCode({ sku: 'x' }, null, '', taken), 'X-OS-3');
  assert.equal(invSkuCode({ sku: 'x' }, null, '', new Set()), 'X-OS');
});

test('invSkuCode always matches the sku pattern', () => {
  const weird = ['', ' ', '---', 'é', 'a/b', 'Z'.repeat(100), '-x-'];
  for (const a of weird) for (const b of weird) for (const c of weird) {
    assert.match(invSkuCode({ sku: a, id: b }, { name: b, id: c }, c), /^[A-Z0-9-]{1,64}$/);
  }
});

// ---- invProductMatrix ------------------------------------------------------------------
test('invProductMatrix: colours × sizes, in order', () => {
  const m = invProductMatrix({
    colors_json: JSON.stringify([{ id: 'c_a', name: 'A', hex: '#111' }, { id: 'c_b', name: 'B', hex: '#222' }]),
    sizes_json: JSON.stringify(['S', 'M']),
  });
  assert.deepEqual(m.map((c) => [c.colorId, c.size, c.colorIndex]), [['c_a', 'S', 0], ['c_a', 'M', 0], ['c_b', 'S', 1], ['c_b', 'M', 1]]);
  assert.equal(m[2].colorName, 'B');
  assert.equal(m[2].colorHex, '#222');
});

test('invProductMatrix: no colours, no sizes, non-array JSON', () => {
  assert.deepEqual(invProductMatrix({ colors_json: '[]', sizes_json: '[]' }), [{ colorId: '', colorName: '', colorHex: '', colorIndex: null, size: '' }]);
  assert.deepEqual(invProductMatrix({ colors_json: '{"a":1}', sizes_json: 'nope' }).length, 1);
  const noSizes = invProductMatrix({ colors_json: JSON.stringify([{ id: 'c_a', name: 'A' }]), sizes_json: null });
  assert.deepEqual(noSizes.map((c) => [c.colorId, c.size]), [['c_a', '']]);
  const noColours = invProductMatrix({ colors_json: null, sizes_json: '["S","M","S"]' });
  assert.deepEqual(noColours.map((c) => [c.colorId, c.size]), [['', 'S'], ['', 'M']]);
});

test('invProductMatrix: colours without valid ids give colorId null', () => {
  const m = invProductMatrix({ colors_json: JSON.stringify([{ name: 'A' }, { id: 'BAD', name: 'B' }, { id: 'c_ok', name: 'C' }]), sizes_json: '["S"]' });
  assert.deepEqual(m.map((c) => c.colorId), [null, null, 'c_ok']);
  assert.deepEqual(m.map((c) => c.colorIndex), [0, 1, 2]);
});

test('invVariantKey is collision-free', () => {
  assert.notEqual(invVariantKey('a', 'b-c', ''), invVariantKey('a-b', 'c', ''));
});

// ---- invResolveOrderLines --------------------------------------------------------------
const P1 = { id: 'p1', name: 'Tote', colors_json: JSON.stringify([{ id: 'c_blk', name: 'Black' }, { name: 'NoId' }]), sizes_json: '["S","M"]' };
const P2 = { id: 'p2', name: 'Cap', colors_json: '[]', sizes_json: '[]' };
const P3 = { id: 'p3', name: 'Untracked', colors_json: '[]', sizes_json: '[]' };
const PRODUCTS = { p1: P1, p2: P2, p3: P3 };
const ROWS = [
  { sku: 'P1-BLACK-S', product_id: 'p1', color_id: 'c_blk', size: 'S', available: 5 },
  { sku: 'P2-OS', product_id: 'p2', color_id: '', size: '', available: 0 },
];

test('invResolveOrderLines: untracked product, tracked match, aggregation, shortages', () => {
  const r = invResolveOrderLines(PRODUCTS, [
    { n: 1, productId: 'p3', colorIndex: null, size: null, quantity: 9 },
    { n: 2, productId: 'p1', colorIndex: 0, size: 'S', quantity: 3 },
    { n: 3, productId: 'p1', colorIndex: 0, size: 'S', quantity: 3 },
    { n: 4, productId: 'p1', colorIndex: 0, size: 'M', quantity: 1 },
    { n: 5, productId: 'p2', colorIndex: null, size: null, quantity: 1 },
  ], ROWS);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.lineSkus, [null, 'P1-BLACK-S', 'P1-BLACK-S', null, 'P2-OS']);
  assert.equal(r.needs.size, 2);
  assert.equal(r.needs.get('P1-BLACK-S').qty, 6);
  assert.equal(r.needs.get('P1-BLACK-S').line, 2);
  assert.deepEqual(r.shortages.map((s) => [s.line, s.requested, s.available]), [[2, 6, 5], [5, 1, 0]]);
  assert.equal(r.shortages[0].colorName, 'Black');
});

test('invResolveOrderLines: colour without id is untracked', () => {
  const r = invResolveOrderLines(PRODUCTS, [{ n: 1, productId: 'p1', colorIndex: 1, size: 'S', quantity: 1 }], ROWS);
  assert.deepEqual(r.lineSkus, [null]);
  assert.equal(r.needs.size, 0);
  assert.equal(r.shortages.length, 0);
});

test('invResolveOrderLines: tracked product with missing colour or size -> error', () => {
  const c = invResolveOrderLines(PRODUCTS, [{ n: 2, productId: 'p1', colorIndex: null, size: 'S', quantity: 1 }], ROWS);
  assert.equal(c.error, 'Line 2: please choose a colour for Tote');
  const s = invResolveOrderLines(PRODUCTS, [{ n: 3, productId: 'p1', colorIndex: 0, size: null, quantity: 1 }], ROWS);
  assert.equal(s.error, 'Line 3: please choose a size for Tote');
  // Untracked products keep today's rules (no error).
  const u = invResolveOrderLines(PRODUCTS, [{ n: 1, productId: 'p1', colorIndex: null, size: null, quantity: 1 }], []);
  assert.equal(u.error, undefined);
});

// ---- invClassifyError -----------------------------------------------------------------
test('invClassifyError on D1 messages', () => {
  const cases = [
    ['D1_ERROR: no such table: inventory: SQLITE_ERROR', 'missing_table'],
    ['no such table: order_stock_lines', 'missing_table'],
    ['no such table: main.inventory_movements', 'missing_table'],
    ['no such table: shipments', null],
    ['D1_ERROR: CHECK constraint failed: inv_available_nonneg: SQLITE_CONSTRAINT', 'insufficient'],
    ['CHECK constraint failed: inv_reserved_nonneg', 'inconsistent'],
    ['CHECK constraint failed: inv_incoming_nonneg', 'inconsistent'],
    ['CHECK constraint failed: inv_damaged_nonneg', 'inconsistent'],
    ['D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT', 'fk'],
    ['UNIQUE constraint failed: orders.order_no: SQLITE_CONSTRAINT', 'order_no_taken'],
    ['UNIQUE constraint failed: inventory.sku', 'duplicate'],
    ['UNIQUE constraint failed: inventory.product_id, inventory.color_id, inventory.size', 'duplicate'],
    ['network error', null],
  ];
  for (const [msg, want] of cases) assert.equal(invClassifyError(new Error(msg)), want, msg);
  assert.equal(invClassifyError({ message: 'D1_ERROR', cause: { message: 'CHECK constraint failed: inv_available_nonneg' } }), 'insufficient');
  assert.equal(invClassifyError('CHECK constraint failed: inv_available_nonneg'), 'insufficient');
  assert.equal(invClassifyError(null), null);
});

// ---- invStockShortMessage -------------------------------------------------------------
test('invStockShortMessage', () => {
  assert.equal(invStockShortMessage([{ name: 'Tote', colorName: 'Black', size: 'S', available: 2 }]),
    'Only 2 left of Tote (Black / S). Please reduce the quantity.');
  assert.equal(invStockShortMessage([{ name: 'Cap', colorName: null, size: null, available: 0 }]), 'Cap is out of stock.');
  assert.equal(invStockShortMessage([{ name: 'Cap', size: 'M', available: 0 }]), 'Cap (M) is out of stock.');
  const five = Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, available: 1 }));
  const msg = invStockShortMessage(five);
  assert.ok(msg.startsWith('Only 1 left of P0. Please reduce the quantity. Only 1 left of P1.'));
  assert.ok(msg.endsWith(' … and 2 more item(s).'));
  assert.ok(!msg.includes('P3'));
});

// ---- invLoadForProducts ---------------------------------------------------------------
test('invLoadForProducts chunks ids and treats a missing table as untracked', async () => {
  const seen = [];
  const db = {
    prepare(sql) {
      return { bind(...a) { seen.push({ sql, a }); return this; }, async all() { return { results: [{ sku: `S${seen.length}` }] }; } };
    },
  };
  const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
  const rows = await invLoadForProducts(db, [...ids, 'p0']);
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((s) => s.a.length), [90, 90, 20]);
  assert.ok(seen[0].sql.includes('?90') && !seen[0].sql.includes('?91'));
  assert.equal(rows.length, 3);

  const missing = { prepare() { return { bind() { return this; }, async all() { throw new Error('no such table: inventory: SQLITE_ERROR'); } }; } };
  assert.deepEqual(await invLoadForProducts(missing, ['a']), []);
  const broken = { prepare() { return { bind() { return this; }, async all() { throw new Error('boom'); } }; } };
  await assert.rejects(invLoadForProducts(broken, ['a']), /boom/);
  assert.deepEqual(await invLoadForProducts(broken, []), []);
});

// ---- Builders -------------------------------------------------------------------------
test('invReserveStatements: 3 set-based statements, json payload, binds match', () => {
  const db = fakeDb();
  const needs = new Map([['A', { qty: 2 }], ['B', { qty: 1 }]]);
  const s = invReserveStatements(db, { orderNo: 'SHOWCASE-20261111-001', now: 'T', actor: 'customer:2', needs });
  assert.equal(s.length, 3);
  assertBindsMatch(s);
  assert.deepEqual(JSON.parse(s[0].args[0]), [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }]);
  assert.ok(!/available\s*>=/.test(s[0].sql), 'no available >= guard: CHECK is the oversell guard');
  assert.ok(s[0].sql.includes('json_each(?1)'));
  assert.deepEqual(s[1].args.slice(1), ['SHOWCASE-20261111-001', 'T']);
  assert.deepEqual(s[2].args.slice(1), ['SHOWCASE-20261111-001', 'customer:2', 'T']);
  assert.ok(s[2].sql.includes("'reserve'"));
  // Plain object form (used by the harness).
  const s2 = invReserveStatements(fakeDb(), { orderNo: 'X', now: 'T', actor: 'a', needs: { A: 1 } });
  assert.deepEqual(JSON.parse(s2[0].args[0]), [{ sku: 'A', qty: 1 }]);
});

test('invTransitionStatements: per effect literals, guard in every statement, binds match', () => {
  const guardSql = 'EXISTS (SELECT 1 FROM orders o WHERE o.order_no = ?1 AND o.status = ?4)';
  const want = {
    release: ["state = 'reserved'", "state = 'released'", "'release'"],
    ship: ["state = 'reserved'", "state = 'shipped'", "'ship'"],
    unship: ["state = 'shipped'", "state = 'reserved'", "'unship'"],
  };
  for (const [effect, [fromLit, toLit, typeLit]] of Object.entries(want)) {
    const s = invTransitionStatements(fakeDb(), { effect, orderNo: 'O', now: 'T', actor: 'admin:x', guardSql, guardBinds: ['processing'] });
    assert.equal(s.length, 3);
    assertBindsMatch(s);
    for (const st of s) assert.ok(st.sql.includes(guardSql));
    assert.ok(s[0].sql.includes(fromLit));
    assert.ok(s[1].sql.includes(typeLit));
    assert.ok(s[2].sql.includes(`SET ${toLit}`));
    assert.deepEqual(s[0].args, ['O', 'T', 'admin:x', 'processing']);
  }
  const rel = invTransitionStatements(fakeDb(), { effect: 'release', orderNo: 'O', now: 'T', actor: 'a', guardSql, guardBinds: ['p'] });
  assert.ok(rel[0].sql.includes('available = available +'));
  const ship = invTransitionStatements(fakeDb(), { effect: 'ship', orderNo: 'O', now: 'T', actor: 'a', guardSql, guardBinds: ['p'] });
  assert.ok(!ship[0].sql.includes('available ='));

  // Customer guard with three binds (?4..?6).
  const cg = 'EXISTS (SELECT 1 FROM orders o WHERE o.order_no = ?1 AND o.customer_id = ?4 AND o.status IN (?5, ?6))';
  const c = invTransitionStatements(fakeDb(), { effect: 'release', orderNo: 'O', now: 'T', actor: 'customer:2', guardSql: cg, guardBinds: [2, 'pending', 'processing'] });
  assertBindsMatch(c);
  assert.equal(c[0].args.length, 6);

  assert.throws(() => invTransitionStatements(fakeDb(), { effect: 'nope', orderNo: 'O', now: 'T', actor: 'a', guardSql }), /unknown effect/);
  assert.throws(() => invTransitionStatements(fakeDb(), { effect: 'ship', orderNo: 'O', now: 'T', actor: 'a' }), /guardSql/);
});

test('invTrackStatements: strings for colour/size, binds match', () => {
  const s = invTrackStatements(fakeDb(), {
    productId: 'p1',
    cells: [{ sku: 'A', colorId: null, size: undefined, available: 7, threshold: 2 }, { sku: 'B', colorId: 'c_x', size: 'M' }],
    reason: 'Start tracking', actor: 'admin:x', now: 'T',
  });
  assert.equal(s.length, 2);
  assertBindsMatch(s);
  assert.deepEqual(JSON.parse(s[0].args[0]), [
    { sku: 'A', colorId: '', size: '', available: 7, threshold: 2 },
    { sku: 'B', colorId: 'c_x', size: 'M', available: 0, threshold: null },
  ]);
  assert.deepEqual(s[0].args.slice(1), ['p1', 'admin:x', 'T']);
  assert.deepEqual(s[1].args.slice(1), ['Start tracking', 'admin:x', 'T']);
  assert.ok(s[1].sql.includes("'track', i.available"));
});

test('invTrackStatements with expect: version check on colours + sizes, binds match', () => {
  const s = invTrackStatements(fakeDb(), {
    productId: 'p1', cells: [{ sku: 'A', colorId: 'c_x', size: 'M' }], reason: null, actor: 'admin:x', now: 'T',
    expect: { colorsJson: '[{"id":"c_x"}]', sizesJson: null },
  });
  assertBindsMatch(s);
  assert.match(s[0].sql, /WHERE EXISTS \(SELECT 1 FROM showcase_products p WHERE p\.id = \?2 AND p\.colors_json IS \?5 AND p\.sizes_json IS \?6\)/);
  assert.deepEqual(s[0].args.slice(1), ['p1', 'admin:x', 'T', '[{"id":"c_x"}]', null]);
  assert.equal(s[1].args.length, 4);
});

// ---- product edit / delete guard -----------------------------------------------------
const guardProduct = {
  id: 'p1', name: 'Tote',
  colors_json: JSON.stringify([{ id: 'c_blk', name: 'Black', hex: '#000' }, { id: 'c_red', name: 'Red', hex: '#f00' }]),
  sizes_json: JSON.stringify(['S', 'M']),
};
const invRow = (sku, color_id, size, o = {}) => ({ sku, product_id: 'p1', color_id, size, available: 0, reserved: 0, incoming: 0, damaged: 0, ...o });

test('invRowsUnlinkedBy: removed colour / size, rename keeps link, delete affects all, unlinked rows ignored', () => {
  const rows = [invRow('A', 'c_blk', 'S'), invRow('B', 'c_blk', 'M'), invRow('C', 'c_red', 'S'), invRow('OLD', 'c_gone', 'S')];
  // Rename + hex change keeps ids -> nothing affected.
  const renamed = { colors_json: [{ id: 'c_blk', name: 'Jet', hex: '#111' }, { id: 'c_red', name: 'Red', hex: '#f00' }], sizes_json: ['S', 'M'] };
  assert.deepEqual(invRowsUnlinkedBy(rows, guardProduct, renamed), []);
  // Remove Red and rename size M -> Medium.
  const next = { colors_json: [{ id: 'c_blk', name: 'Black', hex: '#000' }], sizes_json: ['S', 'Medium'] };
  assert.deepEqual(invRowsUnlinkedBy(rows, guardProduct, next).map((r) => r.sku), ['B', 'C']);
  // Delete affects every row, including already-unlinked ones.
  assert.deepEqual(invRowsUnlinkedBy(rows, guardProduct, null).map((r) => r.sku), ['A', 'B', 'C', 'OLD']);
});

test('invRowLabel uses current colour names', () => {
  assert.equal(invRowLabel(guardProduct, invRow('A', 'c_blk', 'M')), 'Tote (Black / M)');
  assert.equal(invRowLabel(guardProduct, invRow('X', 'c_zz', '')), 'Tote (c_zz)');
  assert.equal(invRowLabel({ name: 'Mug' }, invRow('Y', '', '')), 'Mug');
});

test('invUnlinkVerdict: reserved refuses, any tracked row needs confirm, empty passes', () => {
  const a = (row) => ({ row, label: invRowLabel(guardProduct, row) });
  assert.equal(invUnlinkVerdict([]), null);
  // An all-zero (out of stock) tracked row must not unlink silently: it would become unlimited.
  const zero = invUnlinkVerdict([a(invRow('A', 'c_blk', 'S'))]);
  assert.equal(zero.code, 'STOCK_CONFIRM_REQUIRED');
  assert.deepEqual(zero.variants.map((v) => v.sku), ['A']);
  assert.match(zero.error, /^Tote \(Black \/ S\) is tracked and out of stock\. .*not be stock-limited/);
  const reserved = invUnlinkVerdict([a(invRow('A', 'c_blk', 'S', { available: 5 })), a(invRow('B', 'c_blk', 'M', { reserved: 4 }))]);
  assert.equal(reserved.code, 'STOCK_RESERVED');
  assert.deepEqual(reserved.variants.map((v) => v.sku), ['B']);
  assert.equal(reserved.error, 'Tote (Black / M) has 4 unit(s) reserved by open orders; ship or cancel them first.');
  const onHand = invUnlinkVerdict([a(invRow('A', 'c_blk', 'S', { damaged: 1 }))]);
  assert.equal(onHand.code, 'STOCK_CONFIRM_REQUIRED');
  assert.match(onHand.error, /Tote \(Black \/ S\) still has stock \(available 0, incoming 0, damaged 1\)\./);
  const many = invUnlinkVerdict(['S', 'M', 'L', 'XL', 'XXL'].map((z) => a(invRow(z, 'c_blk', z, { reserved: 1 }))));
  assert.match(many.error, /… and 2 more variant\(s\)\.$/);
});

test('invOpenOrderLines: only untracked lines of the product, per cell', () => {
  const orders = [
    { order_no: 'SHOWCASE-1', status: 'pending', items_json: JSON.stringify([
      { productId: 'p1', colorIndex: 1, size: 'S', quantity: 3 },
      { productId: 'p1', colorIndex: 0, size: 'M', quantity: 2, stockSku: 'T-BLACK-M' }, // reserved already
      { productId: 'p2', colorIndex: 0, size: 'S', quantity: 9 },
    ]) },
    { order_no: 'SHOWCASE-2', status: 'processing', items_json: JSON.stringify([
      { productId: 'p1', colorIndex: 1, size: 'S', quantity: 1 },
      { productId: 'p1', colorIndex: 7, size: 'S', quantity: 4 }, // colour no longer exists
    ]) },
    { order_no: 'SHOWCASE-3', status: 'pending', items_json: 'not json' },
    { order_no: 'SHOWCASE-4', status: 'pending', items_json: JSON.stringify([{ productId: 'p1', colorIndex: 0, size: 'S', quantity: 2, stockSku: 'X' }]) },
  ];
  const r = invOpenOrderLines(guardProduct, orders);
  assert.equal(r.count, 2);
  assert.equal(r.quantity, 8);
  assert.deepEqual(r.orders, [
    { orderNo: 'SHOWCASE-1', status: 'pending', quantity: 3 },
    { orderNo: 'SHOWCASE-2', status: 'processing', quantity: 5 },
  ]);
  // Keyed by colour index; the out-of-range colour (index 7) counts in the total only.
  assert.equal(r.cells.get(invCellKey(1, 'S')), 4);
  assert.equal(r.cells.size, 1);
  // Product without colours / sizes keys cells with ''.
  const plain = invOpenOrderLines({ id: 'p1' }, [{ order_no: 'S-5', status: 'pending', items_json: JSON.stringify([{ productId: 'p1', colorIndex: null, size: null, quantity: 6 }]) }]);
  assert.equal(plain.cells.get(invCellKey('', '')), 6);
});

test('admin builders: set / adjust / threshold bind only what they reference', () => {
  const set = invSetStatements(fakeDb(), { sku: 'A', available: 100, expected: 0, reason: 'count', actor: 'admin:x', now: 'T' });
  assertBindsMatch(set);
  assert.deepEqual(set[0].args, ['A', 100, 'T', 0]);
  assert.equal(set[1].args.length, 6);
  assert.ok(set[1].sql.includes('changes() = 1'));
  assert.ok(set[0].sql.includes('available = ?4'));

  const adj = invAdjustStatements(fakeDb(), { sku: 'A', delta: -3, reason: 'broken', actor: 'admin:x', now: 'T' });
  assertBindsMatch(adj);
  assert.deepEqual(adj[0].args, ['A', -3, 'T']);
  assert.ok(adj[1].sql.includes('changes() = 1'));

  const th = invThresholdStatements(fakeDb(), { sku: 'A', threshold: null, reason: 'Low-stock threshold cleared', actor: 'admin:x', now: 'T' });
  assertBindsMatch(th);
  assert.deepEqual(th[0].args, ['A', null, 'T']);
  assert.ok(th[1].sql.includes("'threshold', 0, 0, 0, 0"));
});

test('INV_ORDER_NO_ATTEMPTS is 5', () => {
  assert.equal(INV_ORDER_NO_ATTEMPTS, 5);
});

// ---- prepareInsertOrder / insertOrder -------------------------------------------------
test('prepareInsertOrder keeps the exact SQL and 11 binds; insertOrder runs it once', async () => {
  const fields = {
    orderNo: 'SW-20261111-ABC123', name: 'N', email: 'e@x.io', phone: '', company: undefined, notes: 'hi',
    items: [{ a: 1 }], itemCount: 3, total: 12.345, customerId: 0,
  };
  const db = fakeDb();
  const { stmt, createdAt } = prepareInsertOrder(db, fields);
  assert.equal(stmt.runs, 0, 'prepare does not run');
  assert.equal(stmt.sql, `INSERT INTO orders
      (order_no, customer_name, customer_email, customer_phone, company, notes,
       items_json, item_count, total, status, created_at, status_updated_at, customer_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?10, ?11)`);
  assert.deepEqual(stmt.args, ['SW-20261111-ABC123', 'N', 'e@x.io', null, null, 'hi', '[{"a":1}]', 3, 12.35, createdAt, null]);
  assert.match(createdAt, /^\d{4}-\d\d-\d\dT/);

  const db2 = fakeDb();
  const res = await insertOrder(db2, fields);
  assert.equal(db2.calls.length, 1);
  assert.equal(db2.calls[0].runs, 1);
  assert.equal(db2.calls[0].sql, stmt.sql);
  assert.deepEqual(res, { createdAt: db2.calls[0].args[9] });
});

test('customerItem: drops stockSku only', () => {
  assert.deepEqual(customerItem({ productId: 'p', qty: 2, stockSku: 'T1-BLACK-S' }), { productId: 'p', qty: 2 });
  assert.deepEqual(customerItem({ name: 'Shop item', quantity: 1 }), { name: 'Shop item', quantity: 1 });
  assert.equal(customerItem(null), null);
});
