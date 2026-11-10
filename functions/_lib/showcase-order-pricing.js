/**
 * Keep PENDING showcase (SC-) orders in sync with current product pricing.
 *
 * Order items are normally a snapshot taken at checkout. This portal is a
 * proposal / shortlist that is still being priced, so when an admin edits a
 * product's price in the showcase editor we re-price the affected lines of
 * every PENDING SC- order. Confirmed, cancelled and completed orders are
 * deliberately left untouched — those are historical records.
 *
 * Only unitPrice / lineTotal / total are rewritten. Colour, quantity, size,
 * image, currency and all other snapshot fields stay as they were.
 *
 * All helpers carry a `sop` prefix: Pages bundles functions/_lib modules into
 * a shared namespace, so generic names like `parse` would collide.
 */

const sopRound2 = (n) => Math.round(n * 100) / 100;

const sopParse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// Mirrors tierUnitPrice() in functions/api/showcase/orders.js:
// the price of the highest tier whose quantity <= ordered quantity applies.
function sopTierUnitPrice(pricing, quantity) {
  const tiers = (Array.isArray(pricing) ? pricing : [])
    .filter((t) => t && Number.isFinite(Number(t.quantity)) && Number.isFinite(Number(t.price)))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  if (!tiers.length) return 0;
  let price = Number(tiers[0].price);
  for (const t of tiers) {
    if (quantity >= Number(t.quantity)) price = Number(t.price);
  }
  return price;
}

/**
 * @param {object} db                  D1 binding
 * @param {string|null} onlyProductId limit re-pricing to this one product
 * @returns {{scanned:number, updated:number, changes:Array}}
 */
export async function repricePendingShowcaseOrders(db, onlyProductId = null) {
  const res = await db.prepare(
    `SELECT order_no, items_json, total FROM orders
     WHERE order_no LIKE 'SC-%' AND status = 'pending'`
  ).all();
  const rows = res.results || [];
  const parsedRows = [];
  const wanted = new Set();

  for (const row of rows) {
    const items = sopParse(row.items_json, []);
    if (!Array.isArray(items)) continue;
    parsedRows.push({ row, items });
    for (const it of items) {
      const id = typeof it?.productId === 'string' ? it.productId : '';
      if (id && (!onlyProductId || id === onlyProductId)) wanted.add(id);
    }
  }
  if (!wanted.size) return { scanned: rows.length, updated: 0, changes: [] };

  // Load current pricing once for every referenced product.
  const ids = [...wanted];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ');
  const prodRes = await db.prepare(
    `SELECT id, pricing_json FROM showcase_products WHERE id IN (${placeholders})`
  ).bind(...ids).all();
  const prices = {};
  for (const p of prodRes.results || []) prices[p.id] = sopParse(p.pricing_json, []);

  const changes = [];
  let updated = 0;
  for (const { row, items } of parsedRows) {
    let dirty = false;
    const next = items.map((it) => {
      const id = typeof it?.productId === 'string' ? it.productId : '';
      if (!id || !(id in prices)) return it;
      if (onlyProductId && id !== onlyProductId) return it;
      const pricing = prices[id];
      // A deleted product or an empty/invalid price list must never zero out an order.
      if (!Array.isArray(pricing) || !pricing.length) return it;
      const qty = Number(it.quantity) || 0;
      const unitPrice = sopRound2(sopTierUnitPrice(pricing, qty));
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return it;
      const lineTotal = sopRound2(unitPrice * qty);
      if (it.unitPrice === unitPrice && it.lineTotal === lineTotal) return it;
      dirty = true;
      return { ...it, unitPrice, lineTotal };
    });
    if (!dirty) continue;

    const total = sopRound2(next.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0));
    const before = Number(row.total) || 0;
    await db.prepare(
      `UPDATE orders SET items_json = ?2, total = ?3
       WHERE order_no = ?1 AND status = 'pending'`
    ).bind(row.order_no, JSON.stringify(next), total).run();
    updated++;
    changes.push({ orderNo: row.order_no, totalBefore: before, totalAfter: total });
  }
  return { scanned: rows.length, updated, changes };
}
