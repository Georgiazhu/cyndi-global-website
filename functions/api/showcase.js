import { json } from '../_lib/auth.js';
import { showcaseSeed } from '../_lib/showcaseSeed.js';
import { isShowcaseAuthenticated } from './showcase/auth-lib.js';

const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// The D1 tables may not exist yet (migration not run). Creating them idempotently here
// avoids an unhandled error (Worker 1101) and means no manual migration on first deploy.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS showcase_categories (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_products (
     id TEXT PRIMARY KEY, category_id TEXT NOT NULL, sku TEXT, name TEXT NOT NULL, description TEXT,
     features_json TEXT, materials TEXT, image TEXT, gallery_json TEXT, colors_json TEXT, sizes_json TEXT,
     pricing_json TEXT, price_includes TEXT, price_notes_json TEXT, charges_json TEXT,
     currency TEXT NOT NULL DEFAULT '$', sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS showcase_media (
     id TEXT PRIMARY KEY, category_id TEXT, file_name TEXT, content_type TEXT,
     image_data TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_products_category ON showcase_products(category_id, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_showcase_media_category ON showcase_media(category_id)`,
];

let schemaReady = null;

async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    for (const stmt of SCHEMA) {
      try { await env.DB.prepare(stmt).run(); }
      catch (e) { console.error('showcase schema:', e?.message); }
    }
  })();
  return schemaReady;
}

// Seeds D1 on first access so the page is never blank with an empty admin console.
// If the admin has saved anything (meta or products), the seed is skipped and the database wins.
async function seedIfEmpty(env) {
  try {
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM showcase_products').first();
    if ((countRow?.n ?? 0) > 0) return false;

    const metaRow = await env.DB.prepare('SELECT data_json FROM showcase_meta WHERE id = 1').first();
    if (metaRow?.data_json) return false;

    const ts = new Date().toISOString();
    const statements = [];

    showcaseSeed.categories.forEach((cat, ci) => {
      statements.push(
        env.DB.prepare('INSERT OR REPLACE INTO showcase_categories (id, name, sort, updated_at) VALUES (?1, ?2, ?3, ?4)')
          .bind(cat.id, cat.name, (ci + 1) * 10, ts)
      );
      cat.products.forEach((p, pi) => {
        statements.push(
          env.DB.prepare(
            `INSERT OR REPLACE INTO showcase_products
               (id, category_id, sku, name, description, features_json, materials, image, gallery_json,
                colors_json, sizes_json, pricing_json, price_includes, price_notes_json, charges_json,
                currency, sort, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`
          ).bind(
            p.id, cat.id, p.sku || null, p.name, p.description || null,
            JSON.stringify(p.features || []), p.materials || null, p.image || null,
            JSON.stringify(p.gallery || []), JSON.stringify(p.colors || []), JSON.stringify(p.sizes || []),
            JSON.stringify(p.pricing || []), p.priceIncludes || null, JSON.stringify(p.priceNotes || []),
            JSON.stringify(p.additionalCharges || []), p.currency || '$', (pi + 1) * 10, ts
          )
        );
      });
    });

    statements.push(
      env.DB.prepare('INSERT OR REPLACE INTO showcase_meta (id, data_json, updated_at) VALUES (1, ?1, ?2)')
        .bind(JSON.stringify(showcaseSeed.meta), ts)
    );

    await env.DB.batch(statements);
    return true;
  } catch (e) {
    console.error('showcase seed:', e?.message);
    return false;
  }
}

// GET /api/showcase — categories + products + global settings.
// Used by https://www.cyndiglobal.com/showcase/.
// Requires a valid showcase session (visible only after sign-in).
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);

  // Reject every unsigned request so the data cannot be fetched around the front end
  if (!await isShowcaseAuthenticated(request, env)) {
    return json({ error: 'Unauthorized', authenticated: false }, 401);
  }

  try {
    await ensureSchema(env);
    await seedIfEmpty(env);

    const catRows = await env.DB.prepare(
      'SELECT id, name, sort FROM showcase_categories ORDER BY sort ASC, name ASC'
    ).all();
    const prodRows = await env.DB.prepare(
      `SELECT id, category_id, sku, name, description, features_json, materials,
              image, gallery_json, colors_json, sizes_json, pricing_json,
              price_includes, price_notes_json, charges_json, currency, sort
       FROM showcase_products ORDER BY sort ASC, name ASC`
    ).all();

    const byCategory = {};
    for (const p of prodRows.results || []) {
      (byCategory[p.category_id] ||= []).push({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        features: parse(p.features_json, []),
        materials: p.materials,
        image: p.image,
        gallery: parse(p.gallery_json, []),
        colors: parse(p.colors_json, []),
        sizes: parse(p.sizes_json, []),
        pricing: parse(p.pricing_json, []),
        priceIncludes: p.price_includes,
        priceNotes: parse(p.price_notes_json, []),
        additionalCharges: parse(p.charges_json, []),
        currency: p.currency || '$',
      });
    }

    const categories = (catRows.results || []).map((c) => ({
      id: c.id,
      name: c.name,
      products: byCategory[c.id] || [],
    }));

    let meta = null;
    const metaRow = await env.DB.prepare('SELECT data_json FROM showcase_meta WHERE id = 1').first();
    if (metaRow?.data_json) meta = parse(metaRow.data_json, null);

    // Protected content must never be cached:
    //  public lets browsers and intermediaries cache the response, so content stays
    //  readable after sign-out and on shared machines. It must be private + no-store.
    return json({ meta, categories }, 200, {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Vary: 'Cookie',
    });
  } catch (e) {
    return json({ error: e?.message || 'Failed to load showcase', categories: [], meta: null }, 500);
  }
}
