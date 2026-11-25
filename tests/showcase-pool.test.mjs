// End-to-end state test for "customer showcase pool -> project shortlist".
// Run: node --test tests/showcase-pool.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  getCustomerPool, setCustomerPool, filterByPool, ensureClientShowcaseSchema,
} from '../functions/_lib/client-showcase.js';
import {
  ensureDashboardSchema, loadDashboard, mutateDashboard,
  adminCreateProject, adminPublishShortlist,
} from '../functions/_lib/dashboard.js';

// Minimal D1-compatible wrapper over node:sqlite so the real SQL runs in tests.
function d1(sqlite) {
  return {
    prepare(sql) {
      return {
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
  };
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT, display_name TEXT, username TEXT, status TEXT);
    CREATE TABLE orders (order_no TEXT PRIMARY KEY, customer_id INTEGER, customer_name TEXT, customer_email TEXT,
      items_json TEXT, item_count INTEGER, total REAL, status TEXT, created_at TEXT, status_updated_at TEXT);
    CREATE TABLE showcase_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE showcase_products (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, sku TEXT, name TEXT,
      image TEXT, pricing_json TEXT, sort INTEGER DEFAULT 0, updated_at TEXT NOT NULL);
    INSERT INTO customers VALUES (1,'alice@example.com','Alice','alice','active'),(2,'bob@example.com','Bob','bob','active');
    INSERT INTO showcase_categories VALUES ('apparel','Apparel',10,'2026-01-01');
    INSERT INTO showcase_products VALUES
      ('p1','apparel','HD-01','Hoodie','', '[{"price":38}]',10,'2026-01-01'),
      ('p2','apparel','CP-02','Cap','',   '[{"price":14}]',20,'2026-01-01'),
      ('p3','apparel','BT-08','Bottle','','[{"price":22}]',30,'2026-01-01');
  `);
  const db = d1(sqlite);
  await ensureDashboardSchema(db);
  await ensureClientShowcaseSchema(db);
  return { db, sqlite, alice: { id: 1, email: 'alice@example.com', displayName: 'Alice' } };
}

test('customer pool curates the showcase and gates shortlist picks', async () => {
  const { db, alice } = await fixture();
  const products = (await db.prepare('SELECT id, sku, name, pricing_json FROM showcase_products').all()).results;

  // Uncurated customers keep the full catalogue (backwards compatible).
  assert.equal(await getCustomerPool(db, 1), null);
  assert.equal((await loadDashboard(db, alice)).showcase.length, 3);

  // Cyndi adds new products and removes ones that don't fit this client's taste.
  await setCustomerPool(db, 1, ['p1', 'p3']);
  assert.deepEqual(await getCustomerPool(db, 1), ['p1', 'p3']);
  assert.deepEqual(filterByPool(products, ['p1', 'p3']).map((p) => p.id), ['p1', 'p3']);
  const dash = await loadDashboard(db, alice);
  assert.deepEqual(dash.showcase.map((p) => p.name), ['Hoodie', 'Bottle']);
  assert.equal(dash.showcase[0].price, 38);

  // Admin creates a project; admin shortlist publishing still works.
  const adminProject = await adminCreateProject(db, { id: 1, email: alice.email }, { title: 'Admin project' }, 'admin');
  assert.ok(adminProject.projectNo.startsWith('PRJ-'));
  await adminPublishShortlist(db, adminProject.projectNo, [{ name: 'Hoodie', sku: 'HD-01', price: 38 }], 'admin', true);
  const afterAdmin = (await loadDashboard(db, alice)).projects.find((p) => p.id === adminProject.projectNo);
  assert.equal(afterAdmin.stage, 2);
  assert.match(afterAdmin.latest.detail, /Shortlist confirmed/);

  // Client creates their own project and can only pick from their pool.
  const clientProject = await mutateDashboard(db, alice, { action: 'createProject', title: 'Client project' });
  assert.ok(clientProject.projectNo.startsWith('PRJ-'));
  const added = await mutateDashboard(db, alice, {
    action: 'addShortlist', projectNo: clientProject.projectNo, productIds: ['p3'],
  });
  assert.equal(added.added, 1);
  await assert.rejects(
    mutateDashboard(db, alice, { action: 'addShortlist', projectNo: clientProject.projectNo, productIds: ['p2'] }),
    /not in your showcase/,
  );
  const afterClient = (await loadDashboard(db, alice)).projects.find((p) => p.id === clientProject.projectNo);
  assert.equal(afterClient.shortlist[0][1], 'BT-08');
  assert.match(afterClient.latest.detail, /added from your showcase/);

  // Reset restores the full catalogue for this customer only.
  await db.prepare('DELETE FROM client_showcase_pools WHERE customer_id = ?1').bind('1').run();
  assert.equal((await loadDashboard(db, alice)).showcase.length, 3);
});
