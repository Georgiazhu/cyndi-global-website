// Tests for the redemption portal engine (M3 Personal links / M4 Open portal).
// Run: node --test tests/redemption.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureRedemptionSchema, createPortal, listPortals, getPortal, setPortalItems,
  importInvites, getInviteTokens, listInvites, getPublicRedemption, submitRedemption,
  listPendingApprovals, listRedemptionOrders, reviewRedemptionOrder, shippingCountries,
} from '../functions/_lib/redemption.js';
import { ensureDashboardSchema, mutateDashboard, adminPublishMockups, loadDashboard } from '../functions/_lib/dashboard.js';
import { allowedNextStatuses } from '../functions/_lib/order-channels.js';

// D1-compatible wrapper over node:sqlite with batch() support.
function d1(sqlite) {
  return {
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...a) { this.args = a; return this; },
        async run() {
          const r = sqlite.prepare(sql).run(...this.args);
          return { success: true, meta: { changes: Number(r.changes || 0) } };
        },
        async all() { return { results: sqlite.prepare(sql).all(...this.args) }; },
        async first() { return sqlite.prepare(sql).get(...this.args) || null; },
      };
    },
    async batch(stmts) {
      const results = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of stmts) {
          const r = sqlite.prepare(s.sql).run(...s.args);
          results.push({ success: true, meta: { changes: Number(r.changes || 0) } });
        }
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
      return results;
    },
  };
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT, display_name TEXT, username TEXT, status TEXT);
    CREATE TABLE orders (order_no TEXT PRIMARY KEY, customer_id INTEGER, customer_name TEXT, customer_email TEXT,
      customer_phone TEXT, company TEXT, notes TEXT, items_json TEXT, item_count INTEGER, total REAL,
      status TEXT, created_at TEXT, status_updated_at TEXT);
    CREATE TABLE showcase_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE showcase_products (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, sku TEXT, name TEXT,
      image TEXT, colors_json TEXT, sizes_json TEXT, pricing_json TEXT, sort INTEGER DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE inventory (
      sku TEXT PRIMARY KEY, product_id TEXT NOT NULL, color_id TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '',
      available INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_available_nonneg CHECK (available >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_reserved_nonneg CHECK (reserved >= 0),
      incoming INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_incoming_nonneg CHECK (incoming >= 0),
      damaged INTEGER NOT NULL DEFAULT 0 CONSTRAINT inv_damaged_nonneg CHECK (damaged >= 0),
      low_stock_threshold INTEGER, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (product_id, color_id, size));
    CREATE TABLE order_stock_lines (
      order_no TEXT NOT NULL REFERENCES orders(order_no) ON UPDATE CASCADE ON DELETE CASCADE,
      sku TEXT NOT NULL REFERENCES inventory(sku) ON UPDATE CASCADE ON DELETE CASCADE,
      qty INTEGER NOT NULL CONSTRAINT osl_qty_pos CHECK (qty > 0),
      state TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT osl_state CHECK (state IN ('reserved','shipped','released')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (order_no, sku));
    CREATE TABLE inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, type TEXT NOT NULL,
      d_available INTEGER NOT NULL DEFAULT 0, d_reserved INTEGER NOT NULL DEFAULT 0,
      d_incoming INTEGER NOT NULL DEFAULT 0, d_damaged INTEGER NOT NULL DEFAULT 0,
      available_after INTEGER, reserved_after INTEGER, incoming_after INTEGER, damaged_after INTEGER,
      reason TEXT, ref_order_no TEXT, actor TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO customers VALUES (1,'hrt@example.com','HRT','hrt','active');
    INSERT INTO showcase_categories VALUES ('apparel','Apparel',10,'2026-01-01');
    INSERT INTO showcase_products VALUES
      ('p1','apparel','HD-01','Hoodie','','[{"id":"blk","name":"Black"}]','["S","M"]','[{"quantity":1,"price":38}]',10,'2026-01-01'),
      ('p2','apparel','CP-02','Cap','','[]','["OS"]','[{"quantity":1,"price":14}]',20,'2026-01-01');
    INSERT INTO inventory VALUES
      ('HD-01-BLK-S','p1','blk','S',5,0,0,0,NULL,'admin','2026-01-01','2026-01-01'),
      ('HD-01-BLK-M','p1','blk','M',2,0,0,0,NULL,'admin','2026-01-01','2026-01-01');
  `);
  const db = d1(sqlite);
  await ensureDashboardSchema(db);
  await ensureRedemptionSchema(db);
  const customer = { id: 1, email: 'hrt@example.com', displayName: 'HRT' };
  return { db, sqlite, customer };
}

function addr() {
  return {
    name: 'Jane Doe', email: 'jane@example.com', phone: '+1 212 555 0100',
    countryCode: 'US', state: 'NY', city: 'New York', postalCode: '10001',
    address1: '1 Broadway', address2: '',
  };
}

test('createPortals: four methods, slug uniqueness, item catalogue gate', async () => {
  const { db, customer } = await fixture();
  const created = [];
  for (const type of ['BULK_SHIPMENT', 'REWARDS_STORE', 'PERSONAL_LINK', 'OPEN_PORTAL']) {
    created.push(await createPortal(db, customer, { type, name: type, customTitle: 'Gift' }, 'admin'));
  }
  assert.equal(created.length, 4);
  const list = await listPortals(db, customer);
  assert.deepEqual(list.map((p) => p.type).sort(), ['BULK_SHIPMENT', 'OPEN_PORTAL', 'PERSONAL_LINK', 'REWARDS_STORE']);
  assert.equal(new Set(list.map((p) => p.slug)).size, 4, 'slugs are unique');
  const open = list.find((p) => p.type === 'OPEN_PORTAL');
  await setPortalItems(db, customer, open.id, [{ productId: 'p1', maxQty: 1 }, { productId: 'p2', maxQty: null }]);
  const detail = await getPortal(db, customer, open.id);
  assert.equal(detail.items.length, 2);
  assert.equal(detail.items[0].maxQty, 1);
  assert.equal(detail.items[1].maxQty, null);
  await assert.rejects(() => setPortalItems(db, customer, open.id, [{ productId: 'missing' }]), /not in the catalogue/);
});

test('M3 personal link: token is high entropy, one redemption, direct to dispatch', async () => {
  const { db, customer } = await fixture();
  const { portalId } = await createPortal(db, customer, { type: 'PERSONAL_LINK', name: 'Candidates' }, 'admin');
  await setPortalItems(db, customer, portalId, [{ productId: 'p1', maxQty: 1 }]);
  const res = await importInvites(db, customer, portalId, [
    { name: 'Jane', email: 'jane@example.com' },
    { name: 'John', email: 'john@example.com' },
  ], 'admin');
  assert.equal(res.added, 2);
  const tokens = await getInviteTokens(db, customer, portalId);
  assert.equal(tokens.length, 2);
  assert.ok(tokens.every((t) => t.token.length === 64), '256-bit hex token');
  assert.notEqual(tokens[0].token, tokens[1].token);
  const jane = tokens.find((t) => t.name === 'Jane');

  const view = await getPublicRedemption(db, { token: jane.token });
  assert.equal(view.redeemed, false);
  assert.equal(view.recipient.name, 'Jane');
  assert.equal(view.products.length, 1);

  const submit = await submitRedemption(db, {}, {
    token: jane.token,
    contact: { name: 'Jane', email: 'jane@example.com' },
    shipping: addr(),
    items: [{ productId: 'p1', colorId: 'blk', size: 'S', qty: 1 }],
  });
  assert.equal(submit.approvalStatus, 'NOT_REQUIRED');
  assert.equal(submit.fulfilmentStatus, 'READY_FOR_DISPATCH');
  assert.equal(submit.status, 'processing');

  const after = await getPublicRedemption(db, { token: jane.token });
  assert.equal(after.redeemed, true, 'link becomes single-use');
  assert.equal(after.orderId, submit.orderNo);
  assert.ok(!('shipping' in (after.recipient || {})), 'no address leaked after redemption');

  await assert.rejects(() => submitRedemption(db, {}, {
    token: jane.token,
    contact: { name: 'Jane', email: 'jane@example.com' }, shipping: addr(),
    items: [{ productId: 'p1', colorId: 'blk', size: 'S', qty: 1 }],
  }), /already been redeemed/);

  // Stock was reserved once, never twice.
  const stock = await db.prepare('SELECT available,reserved FROM inventory WHERE sku=?1').bind('HD-01-BLK-S').first();
  assert.equal(stock.available, 4);
  assert.equal(stock.reserved, 1);
});

test('M4 open portal: pending approval, SPU limit, atomic stock rollback on reject', async () => {
  const { db, customer } = await fixture();
  const { portalId, slug } = await createPortal(db, customer, {
    type: 'OPEN_PORTAL', name: 'Holiday', slug: 'holiday-2026', customTitle: 'Holiday gifts',
  }, 'admin');
  await setPortalItems(db, customer, portalId, [{ productId: 'p1', maxQty: 2 }]);

  const view = await getPublicRedemption(db, { slug });
  assert.equal(view.portal.title, 'Holiday gifts');
  assert.equal(view.portal.slug, 'holiday-2026');
  assert.equal(view.products[0].variants.find((v) => v.size === 'M').available, 2);

  // SPU limit: three units across two sizes exceed max 2 for the same product.
  await assert.rejects(() => submitRedemption(db, {}, {
    slug, contact: { name: 'A', email: 'a@example.com' }, shipping: addr(),
    items: [
      { productId: 'p1', colorId: 'blk', size: 'S', qty: 2 },
      { productId: 'p1', colorId: 'blk', size: 'M', qty: 1 },
    ],
  }), /limit is 2 per order/);

  const submitted = await submitRedemption(db, {}, {
    slug, contact: { name: 'A', email: 'a@example.com' }, shipping: addr(),
    items: [{ productId: 'p1', colorId: 'blk', size: 'S', qty: 2 }],
  });
  assert.equal(submitted.approvalStatus, 'PENDING');
  assert.equal(submitted.fulfilmentStatus, 'PENDING_APPROVAL');
  assert.equal(submitted.status, 'pending');

  let stock = await db.prepare('SELECT available,reserved FROM inventory WHERE sku=?1').bind('HD-01-BLK-S').first();
  assert.equal(stock.available, 3, 'stock deducted on submit');
  assert.equal(stock.reserved, 2);

  const queue = await listPendingApprovals(db);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].shipping.city, 'New York');
  assert.equal(queue[0].items[0].qty, 2);

  await reviewRedemptionOrder(db, submitted.orderNo, 'REJECT', 'admin', 'suspected duplicate');
  stock = await db.prepare('SELECT available,reserved FROM inventory WHERE sku=?1').bind('HD-01-BLK-S').first();
  assert.equal(stock.available, 5, 'stock rolled back atomically');
  assert.equal(stock.reserved, 0);
  assert.equal((await listPendingApprovals(db)).length, 0);
});

test('M4 approve does not double-deduct stock; paused portals reject submissions', async () => {
  const { db, customer } = await fixture();
  const { portalId, slug } = await createPortal(db, customer, { type: 'OPEN_PORTAL', name: 'Open' }, 'admin');
  await setPortalItems(db, customer, portalId, [{ productId: 'p2', maxQty: null }]);
  const submitted = await submitRedemption(db, {}, {
    slug, contact: { name: 'B', email: 'b@example.com' }, shipping: addr(),
    items: [{ productId: 'p2', size: 'OS', qty: 1 }],
  });
  await reviewRedemptionOrder(db, submitted.orderNo, 'APPROVE', 'admin');
  const approved = await db.prepare('SELECT status,approval_status,fulfilment_status FROM orders WHERE order_no=?1').bind(submitted.orderNo).first();
  assert.equal(approved.approval_status, 'APPROVED');
  assert.equal(approved.fulfilment_status, 'READY_FOR_DISPATCH');
  assert.equal(approved.status, 'processing');

  await updateStatus(db, customer, portalId, 'PAUSED');
  await assert.rejects(() => getPublicRedemption(db, { slug }), /paused/);
  await assert.rejects(() => submitRedemption(db, {}, {
    slug, contact: { name: 'C', email: 'c@example.com' }, shipping: addr(),
    items: [{ productId: 'p2', size: 'OS', qty: 1 }],
  }), /paused/);

  assert.ok(shippingCountries().some((c) => c.code === 'US'));
});

async function updateStatus(db, customer, portalId, status) {
  const { updatePortal } = await import('../functions/_lib/redemption.js');
  await updatePortal(db, customer, portalId, { status }, 'admin');
}

test('company orders are M1/M2: pre-approved, no recipient approval', async () => {
  const { db, customer } = await fixture();
  const created = await mutateDashboard(db, customer, { action: 'createProject', title: 'Channels' });
  const projectNo = created.projectNo;
  await mutateDashboard(db, customer, { action: 'addShortlist', projectNo, productIds: ['p1'] });
  await adminPublishMockups(db, projectNo, [{ label: 'mockup' }], 'admin', true);
  const first = await mutateDashboard(db, customer, {
    action: 'confirmOrder', projectNo, channel: 'M1',
    items: [{ productIndex: 0, qty: 2, color: 'Black', size: 'S' }],
  });
  const second = await mutateDashboard(db, customer, {
    action: 'confirmOrder', projectNo, channel: 'M2',
    items: [{ productIndex: 0, qty: 1, color: 'Black', size: 'M' }],
  });
  const rows = await db.prepare('SELECT order_no, order_channel, origin_type, source_type, approval_status FROM orders ORDER BY order_no').all();
  const byNo = new Map(rows.results.map((r) => [r.order_no, r]));
  assert.equal(byNo.get(first.orderNo).order_channel, 'M1');
  assert.equal(byNo.get(first.orderNo).source_type, 'INTERNAL_TEAM');
  assert.equal(byNo.get(second.orderNo).order_channel, 'M2');
  assert.equal(byNo.get(second.orderNo).source_type, 'REWARDS_STORE');
  for (const r of rows.results) {
    assert.equal(r.origin_type, 'COMPANY');
    assert.equal(r.approval_status, 'NOT_REQUIRED');
  }
  const dash = await loadDashboard(db, customer);
  assert.deepEqual(dash.orders.map((o) => o.channel).sort(), ['M1', 'M2']);
  assert.ok(dash.orders.every((o) => o.origin === 'COMPANY'));
  assert.equal((await listPendingApprovals(db)).length, 0, 'company orders never enter the approval queue');
});

test('individual M3/M4 orders carry channel, owner and different approval rights', async () => {
  const { db, customer } = await fixture();
  // M3: named personal link — pre-approved and immediately dispatchable.
  const m3 = await createPortal(db, customer, { type: 'PERSONAL_LINK', name: 'Candidates' }, 'admin');
  await setPortalItems(db, customer, m3.portalId, [{ productId: 'p2', maxQty: 1 }]);
  const [invite] = await getInviteTokens(db, customer, m3.portalId).then(async (tokens) => {
    if (!tokens.length) {
      await importInvites(db, customer, m3.portalId, [{ name: 'Jane', email: 'jane@example.com' }], 'admin');
      return getInviteTokens(db, customer, m3.portalId);
    }
    return tokens;
  });
  const personal = await submitRedemption(db, {}, {
    token: invite.token, contact: { name: 'Jane', email: 'jane@example.com' }, shipping: addr(),
    items: [{ productId: 'p2', size: 'OS', qty: 1 }],
  });
  // M4: shared open portal — pending client approval.
  const m4 = await createPortal(db, customer, { type: 'OPEN_PORTAL', name: 'Open', slug: 'gift-open' }, 'admin');
  await setPortalItems(db, customer, m4.portalId, [{ productId: 'p2', maxQty: 1 }]);
  const open = await submitRedemption(db, {}, {
    slug: m4.slug, contact: { name: 'Alex', email: 'alex@example.com' }, shipping: addr(),
    items: [{ productId: 'p2', size: 'OS', qty: 1 }],
  });

  const rows = await db.prepare('SELECT order_no, order_channel, origin_type, customer_id, approval_status FROM orders').all();
  const byNo = new Map(rows.results.map((r) => [r.order_no, r]));
  assert.equal(byNo.get(personal.orderNo).order_channel, 'M3');
  assert.equal(byNo.get(open.orderNo).order_channel, 'M4');
  assert.ok(rows.results.every((r) => r.origin_type === 'INDIVIDUAL' && Number(r.customer_id) === 1));
  assert.equal(byNo.get(personal.orderNo).approval_status, 'NOT_REQUIRED');
  assert.equal(byNo.get(open.orderNo).approval_status, 'PENDING');

  const all = await listRedemptionOrders(db);
  assert.deepEqual(all.map((o) => o.channel).sort(), ['M3', 'M4']);
  const dash = await loadDashboard(db, customer);
  assert.deepEqual(dash.orders.map((o) => o.channel).sort(), ['M3', 'M4']);
  assert.ok(dash.orders.every((o) => o.origin === 'INDIVIDUAL' && o.shipping?.city === 'New York'));
  assert.equal((await listPendingApprovals(db)).length, 1, 'only M4 waits for approval');

  assert.deepEqual(allowedNextStatuses({ orderChannel: 'M3', approvalStatus: 'NOT_REQUIRED', status: 'processing' }), ['shipped', 'cancelled']);
  assert.deepEqual(allowedNextStatuses({ orderChannel: 'M4', approvalStatus: 'PENDING', status: 'pending' }), ['cancelled']);

  // Client approval is scoped to their own portal and only to pending M4 orders.
  await assert.rejects(() => reviewRedemptionOrder(db, open.orderNo, 'APPROVE', 'client', '', {
    role: 'client', customerId: '999',
  }), /another customer|not found/);
  await assert.rejects(() => reviewRedemptionOrder(db, personal.orderNo, 'APPROVE', 'client', '', {
    role: 'client', customerId: '1',
  }), /not found/);
  const approved = await reviewRedemptionOrder(db, open.orderNo, 'APPROVE', 'client', 'looks good', {
    role: 'client', customerId: '1',
  });
  assert.equal(approved.approvalStatus, 'APPROVED');
  const finalRow = await db.prepare('SELECT reviewed_by, review_note FROM orders WHERE order_no=?1').bind(open.orderNo).first();
  assert.equal(finalRow.reviewed_by, 'client');
  assert.equal(finalRow.review_note, 'looks good');
});
