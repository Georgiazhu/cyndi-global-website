// Shared activity feed for client projects.
//
// Every shortlist / mockup / order action — from the admin console or from the
// customer portal — appends one row here. The customer dashboard reads the feed
// so the "latest action" pushed by Cyndi is always visible on each project.

let readyPromise = null;

export async function ensureActivitySchema(db) {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS client_project_activity (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_no    TEXT NOT NULL,
        actor         TEXT NOT NULL,
        actor_role    TEXT NOT NULL DEFAULT 'admin',
        action        TEXT NOT NULL,
        detail        TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL
      )`).run();
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_cpa_project ON client_project_activity(project_no, id DESC)').run();
      } catch {}
    })().catch((e) => { readyPromise = null; throw e; });
  }
  return readyPromise;
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Append an activity row. Never throws into the caller's main action. */
export async function logActivity(db, projectNo, actor, action, detail = '', actorRole = 'admin') {
  if (!db || !projectNo) return;
  try {
    await ensureActivitySchema(db);
    await db.prepare(`INSERT INTO client_project_activity
      (project_no, actor, actor_role, action, detail, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(
      String(projectNo).slice(0, 40),
      clip(actor, 120) || 'Cyndi Global',
      clip(actorRole, 20) || 'admin',
      clip(action, 60) || 'update',
      clip(detail, 500),
      new Date().toISOString()
    ).run();
  } catch (e) {
    console.error('project activity log:', e?.message);
  }
}

/**
 * Read the feed for a set of projects, newest first.
 * Returns a flat array: { id, project, actor, role, action, detail, at }.
 */
export async function listActivity(db, projectNos, limitPerProject = 8) {
  const nos = (Array.isArray(projectNos) ? projectNos : []).filter(Boolean).map((n) => String(n));
  if (!db || !nos.length) return [];
  await ensureActivitySchema(db);
  const out = [];
  for (const no of nos) {
    try {
      const res = await db.prepare(
        'SELECT * FROM client_project_activity WHERE project_no = ?1 ORDER BY id DESC LIMIT ?2'
      ).bind(no, Math.max(1, Math.min(50, limitPerProject))).all();
      for (const r of res.results || []) {
        out.push({
          id: r.id,
          project: r.project_no,
          actor: r.actor || 'Cyndi Global',
          role: r.actor_role || 'admin',
          action: r.action || 'update',
          detail: r.detail || '',
          at: r.created_at || '',
        });
      }
    } catch (e) {
      console.error('project activity list:', e?.message);
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || (b.id - a.id));
}
