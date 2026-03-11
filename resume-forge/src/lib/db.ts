import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  // Prevent fatal crash when running in browser context (like Playwright UI tests)
  if (typeof window !== 'undefined' && !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    throw new Error("L'application doit être lancée dans Tauri (pas dans un navigateur classique) pour accéder à la base de données locale.");
  }

  if (!db) {
    db = await Database.load('sqlite:resumeforge.db');

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
  }
  return db;
}
