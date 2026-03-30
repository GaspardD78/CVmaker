import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  // Prevent fatal crash when running in browser context (like Playwright UI tests)
  if (typeof window !== 'undefined' && !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    throw new Error("L'application doit être lancée dans Tauri (pas dans un navigateur classique) pour accéder à la base de données locale.");
  }

  if (!db) {
    // In portable mode (.portable marker next to exe), the backend returns
    // an absolute sqlite: URI pointing to a data/ folder beside the executable.
    const dbUri = await invoke<string>('get_db_uri');
    db = await Database.load(dbUri);

    // Fallback: ensure migration 002 is applied even if the SQLx migration
    // system failed silently on an existing database (checksum mismatch, etc.)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS application_attachments (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        file_name       TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        file_type       TEXT,
        file_size       INTEGER,
        label           TEXT DEFAULT 'other' CHECK (label IN (
          'cv', 'cover_letter', 'portfolio', 'certificate', 'other'
        )),
        created_at      TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_attachments_app ON application_attachments(application_id)`
    );

    // Fallback: ensure migration 003 columns/tables exist
    await db.execute(`ALTER TABLE applications ADD COLUMN job_description TEXT`).catch(() => {/* already exists */});
    await db.execute(`
      CREATE TABLE IF NOT EXISTS compatibility_scores (
        id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        application_id       TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
        cv_id                TEXT NOT NULL,
        score_global         INTEGER NOT NULL,
        score_skills         INTEGER NOT NULL,
        score_experience     INTEGER NOT NULL,
        score_education      INTEGER NOT NULL,
        score_keywords       INTEGER NOT NULL,
        details              TEXT NOT NULL,
        cv_content_hash      TEXT NOT NULL,
        job_description_hash TEXT NOT NULL,
        computed_at          TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_compat_scores_app ON compatibility_scores(application_id)`
    );

    // Fallback: ensure migration 004 tables exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_watch_config (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source          TEXT NOT NULL,
        keywords        TEXT NOT NULL DEFAULT '[]',
        location        TEXT,
        radius_km       INTEGER DEFAULT 50,
        contract_types  TEXT DEFAULT '[]',
        rss_url         TEXT,
        enabled         INTEGER DEFAULT 1,
        last_fetched_at TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_offers (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        source               TEXT NOT NULL,
        url                  TEXT NOT NULL,
        hash                 TEXT NOT NULL UNIQUE,
        title                TEXT NOT NULL,
        company              TEXT,
        location             TEXT,
        contract_type        TEXT,
        description_snippet  TEXT,
        published_at         TEXT,
        fetched_at           TEXT DEFAULT (datetime('now')),
        score                INTEGER DEFAULT 0,
        commute_minutes      INTEGER,
        commute_status       TEXT DEFAULT 'pending',
        is_read              INTEGER DEFAULT 0,
        is_archived          INTEGER DEFAULT 0,
        kanban_id            TEXT REFERENCES applications(id) ON DELETE SET NULL
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_hash    ON job_offers(hash)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_source  ON job_offers(source)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_score   ON job_offers(score)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_fetched ON job_offers(fetched_at)`);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_watch_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    const defaultSettings: Array<[string, string]> = [
      ['fetch_interval_hours',  '4'],
      ['email_digest_enabled',  '1'],
      ['email_digest_time',     '08:00'],
      ['email_smtp_host',       ''],
      ['email_smtp_port',       '587'],
      ['email_smtp_user',       ''],
      ['email_smtp_password',   ''],
      ['email_to',              ''],
      ['positive_keywords',     '[]'],
      ['negative_keywords',     '[]'],
      ['navitia_api_key',       ''],
      ['commute_origin_address',''],
      ['commute_departure_time','09:00'],
      ['commute_max_minutes',   '75'],
    ];
    for (const [key, value] of defaultSettings) {
      await db.execute(
        `INSERT OR IGNORE INTO job_watch_settings (key, value) VALUES (?1, ?2)`,
        [key, value]
      );
    }
  }
  return db;
}

/**
 * Read a single value from the `settings` table.
 */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM settings WHERE key = ?1',
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

/**
 * Write a value to the `settings` table (upsert).
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = ?2`,
    [key, value]
  );
}
