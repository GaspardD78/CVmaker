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
