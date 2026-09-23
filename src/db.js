import { PATHS, ensureHome } from './config.js';

// node:sqlite is built into Node >= 22.13; hide its "experimental" banner.
const emit = process.emitWarning;
process.emitWarning = (w, ...rest) =>
  String(w?.message ?? w).includes('SQLite') ? undefined : emit.call(process, w, ...rest);
const { DatabaseSync } = await import('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  country TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  popularity INTEGER,
  difficulty INTEGER,
  app_count INTEGER,
  top_apps TEXT
);
CREATE INDEX IF NOT EXISTS keyword_snapshots_lookup ON keyword_snapshots(keyword, country, observed_at);

CREATE TABLE IF NOT EXISTS ranks (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  country TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  rank INTEGER
);
CREATE INDEX IF NOT EXISTS ranks_lookup ON ranks(app_id, keyword, country, observed_at);

CREATE TABLE IF NOT EXISTS tracked (
  app_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  country TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (app_id, keyword, country)
);

CREATE TABLE IF NOT EXISTS app_snapshots (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  country TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  name TEXT,
  subtitle TEXT,
  developer TEXT,
  rating REAL,
  rating_count INTEGER,
  version TEXT,
  data TEXT
);
CREATE INDEX IF NOT EXISTS app_snapshots_lookup ON app_snapshots(app_id, country, observed_at);

CREATE TABLE IF NOT EXISTS metadata_log (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  logged_at TEXT NOT NULL
);
`;

let db;

export function openDb(file = PATHS.db) {
  if (db) return db;
  if (file !== ':memory:') ensureHome();
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();

export function recordKeyword(row) {
  openDb().prepare(
    `INSERT INTO keyword_snapshots (keyword, country, observed_at, popularity, difficulty, app_count, top_apps)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.keyword, row.country, row.observedAt, row.popularity, row.difficulty, row.appCount,
    JSON.stringify(row.topApps ?? []));
}

export function recordRank({ appId, keyword, country, observedAt, rank }) {
  openDb().prepare('INSERT INTO ranks (app_id, keyword, country, observed_at, rank) VALUES (?, ?, ?, ?, ?)')
    .run(appId, keyword, country, observedAt, rank);
}

export function recordApp(app, country) {
  openDb().prepare(
    `INSERT INTO app_snapshots (app_id, country, observed_at, name, subtitle, developer, rating, rating_count, version, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(app.id, country, now(), app.name, app.subtitle, app.developer, app.rating, app.ratingCount, app.version,
    JSON.stringify(app));
}

// Popularity changes slowly; reuse a value observed within `maxAgeHours`.
export function cachedPopularity(keyword, country, maxAgeHours = 24) {
  const since = new Date(Date.now() - maxAgeHours * 3600e3).toISOString();
  const row = openDb().prepare(
    `SELECT popularity FROM keyword_snapshots
     WHERE keyword = ? AND country = ? AND observed_at >= ? AND popularity IS NOT NULL
     ORDER BY observed_at DESC LIMIT 1`
  ).get(keyword, country, since);
  return row?.popularity ?? null;
}

export function trackAdd(appId, keywords, country) {
  const stmt = openDb().prepare('INSERT OR IGNORE INTO tracked (app_id, keyword, country, added_at) VALUES (?, ?, ?, ?)');
  const t = now();
  return keywords.filter((k) => stmt.run(appId, k, country, t).changes > 0);
}

export function trackRemove(appId, keywords, country) {
  const stmt = openDb().prepare('DELETE FROM tracked WHERE app_id = ? AND keyword = ? AND country = ?');
  return keywords.filter((k) => stmt.run(appId, k, country).changes > 0);
}

export function trackList(appId) {
  const sql = 'SELECT app_id AS appId, keyword, country, added_at AS addedAt FROM tracked';
  return appId
    ? openDb().prepare(`${sql} WHERE app_id = ? ORDER BY country, keyword`).all(appId)
    : openDb().prepare(`${sql} ORDER BY app_id, country, keyword`).all();
}

// Latest and previous rank per tracked keyword, joined with latest popularity/difficulty.
export function latestRanks(appId, country) {
  return openDb().prepare(`
    SELECT t.keyword,
      (SELECT rank FROM ranks r WHERE r.app_id = t.app_id AND r.keyword = t.keyword AND r.country = t.country
         ORDER BY observed_at DESC LIMIT 1) AS rank,
      (SELECT rank FROM ranks r WHERE r.app_id = t.app_id AND r.keyword = t.keyword AND r.country = t.country
         ORDER BY observed_at DESC LIMIT 1 OFFSET 1) AS previousRank,
      (SELECT observed_at FROM ranks r WHERE r.app_id = t.app_id AND r.keyword = t.keyword AND r.country = t.country
         ORDER BY observed_at DESC LIMIT 1) AS checkedAt,
      (SELECT popularity FROM keyword_snapshots k WHERE k.keyword = t.keyword AND k.country = t.country
         AND k.popularity IS NOT NULL ORDER BY observed_at DESC LIMIT 1) AS popularity,
      (SELECT difficulty FROM keyword_snapshots k WHERE k.keyword = t.keyword AND k.country = t.country
         ORDER BY observed_at DESC LIMIT 1) AS difficulty
    FROM tracked t WHERE t.app_id = ? AND t.country = ?
    ORDER BY t.keyword`).all(appId, country);
}

export function keywordHistory(keyword, country, appId, days) {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const snapshots = openDb().prepare(
    `SELECT observed_at AS observedAt, popularity, difficulty, app_count AS appCount
     FROM keyword_snapshots WHERE keyword = ? AND country = ? AND observed_at >= ? ORDER BY observed_at`
  ).all(keyword, country, since);
  const ranks = appId
    ? openDb().prepare(
      `SELECT observed_at AS observedAt, rank FROM ranks
       WHERE app_id = ? AND keyword = ? AND country = ? AND observed_at >= ? ORDER BY observed_at`
    ).all(appId, keyword, country, since)
    : [];
  return { snapshots, ranks };
}

export function logChange(entry) {
  const r = openDb().prepare(
    `INSERT INTO metadata_log (app_id, locale, field, old_value, new_value, note, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(entry.appId, entry.locale, entry.field, entry.old ?? null, entry.new ?? null, entry.note ?? null, now());
  return Number(r.lastInsertRowid);
}

export function listChanges(appId) {
  const sql = `SELECT id, app_id AS appId, locale, field, old_value AS old, new_value AS new, note, logged_at AS loggedAt
               FROM metadata_log`;
  return appId
    ? openDb().prepare(`${sql} WHERE app_id = ? ORDER BY logged_at DESC`).all(appId)
    : openDb().prepare(`${sql} ORDER BY logged_at DESC`).all();
}

export function readOnlyQuery(sql) {
  const ro = new DatabaseSync(PATHS.db, { readOnly: true });
  try {
    return ro.prepare(sql).all();
  } finally {
    ro.close();
  }
}

export function tables() {
  return openDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(({ name }) => ({
    name,
    rows: openDb().prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n,
    columns: openDb().prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name).join(', '),
  }));
}
