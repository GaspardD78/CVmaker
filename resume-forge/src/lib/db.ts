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

    // Fallback: ensure migration 011 columns exist (rejection fields)
    await db.execute(`ALTER TABLE applications ADD COLUMN rejection_reason TEXT`).catch(() => {/* already exists */});
    await db.execute(`ALTER TABLE applications ADD COLUMN rejection_email TEXT`).catch(() => {/* already exists */});
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

    // Fallback: ensure migration 005 tables exist (v1.2 schema with TEXT UUID PKs)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_watch_config (
        id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        source           TEXT NOT NULL,
        keywords         TEXT NOT NULL DEFAULT '[]',
        exclude_keywords TEXT NOT NULL DEFAULT '[]',
        location         TEXT,
        radius_km        INTEGER DEFAULT 50,
        contract_types   TEXT DEFAULT '[]',
        rss_url          TEXT,
        ft_dept_code     TEXT,
        enabled          INTEGER DEFAULT 1,
        last_fetched_at  TEXT,
        created_at       TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_offers (
        id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        source               TEXT NOT NULL,
        url                  TEXT NOT NULL,
        hash                 TEXT NOT NULL UNIQUE,
        title                TEXT NOT NULL,
        company              TEXT,
        location             TEXT,
        location_lat         REAL,
        location_lon         REAL,
        contract_type        TEXT,
        description_snippet  TEXT,
        published_at         TEXT,
        fetched_at           TEXT DEFAULT (datetime('now')),
        score                INTEGER DEFAULT 0,
        commute_minutes      INTEGER,
        commute_status       TEXT DEFAULT 'pending',
        salary_min           INTEGER,
        salary_max           INTEGER,
        salary_raw           TEXT,
        is_read              INTEGER DEFAULT 0,
        is_archived          INTEGER DEFAULT 0,
        kanban_id            TEXT REFERENCES applications(id) ON DELETE SET NULL
      )
    `);
    // Fallback: ensure migration 006 column exists
    await db.execute(`ALTER TABLE job_watch_config ADD COLUMN exclude_keywords TEXT NOT NULL DEFAULT '[]'`).catch(() => {/* already exists */});

    // Fallback: ensure migration 007 table and column exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_offer_feedback (
        id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        offer_id       TEXT NOT NULL,
        action         TEXT NOT NULL,
        time_to_action INTEGER,
        created_at     DATETIME DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_feedback_offer ON job_offer_feedback(offer_id)`);
    await db.execute(`ALTER TABLE job_offers ADD COLUMN archived_at TEXT`).catch(() => {/* already exists */});

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_hash    ON job_offers(hash)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_source  ON job_offers(source)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_score   ON job_offers(score)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_fetched ON job_offers(fetched_at)`);

    // Fallback: ensure migration 009 columns exist (profile isolation)
    await db.execute(`ALTER TABLE job_watch_config ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE`).catch(() => {/* already exists */});
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_watch_config_profile ON job_watch_config(profile_id)`);
    await db.execute(`ALTER TABLE job_offers ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE`).catch(() => {/* already exists */});
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_job_offers_profile ON job_offers(profile_id)`);

    // Fallback: ensure migration 012 columns exist (markdown editor)
    await db.execute(`ALTER TABLE cv_documents ADD COLUMN markdown_content TEXT`).catch(() => {/* already exists */});
    await db.execute(`ALTER TABLE cv_documents ADD COLUMN markdown_mode INTEGER NOT NULL DEFAULT 0 CHECK (markdown_mode IN (0, 1))`).catch(() => {/* already exists */});
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_watch_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    // Fallback: ensure migration 015 schema exists (job_watch_settings per profile).
    // We detect the old schema (no profile_id column) via pragma_table_info and
    // recreate the table preserving existing rows as global settings (profile_id='').
    const cols = await db.select<{ name: string }[]>(
      `SELECT name FROM pragma_table_info('job_watch_settings')`
    );
    const hasProfileId = cols.some(c => c.name === 'profile_id');
    if (!hasProfileId) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS job_watch_settings_new (
          key        TEXT NOT NULL,
          profile_id TEXT NOT NULL DEFAULT '',
          value      TEXT,
          PRIMARY KEY (key, profile_id)
        )
      `);
      await db.execute(
        `INSERT OR IGNORE INTO job_watch_settings_new (key, profile_id, value)
         SELECT key, '', value FROM job_watch_settings`
      );
      await db.execute(`DROP TABLE job_watch_settings`);
      await db.execute(`ALTER TABLE job_watch_settings_new RENAME TO job_watch_settings`);
    }
    // Fallback: ensure migration 013 table exists (job_watch_fetch_log)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_watch_fetch_log (
        id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        source         TEXT NOT NULL,
        fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
        offers_fetched INTEGER NOT NULL DEFAULT 0,
        offers_new     INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL CHECK (status IN ('success', 'error', 'empty')),
        error_message  TEXT,
        duration_ms    INTEGER NOT NULL DEFAULT 0
      )
    `).catch(() => {/* already exists */});
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON job_watch_fetch_log(source, fetched_at DESC)`
    ).catch(() => {/* already exists */});
    // Fallback: ensure migration 014 columns exist (breakdown counters)
    await db.execute(
      `ALTER TABLE job_watch_fetch_log ADD COLUMN offers_duplicate INTEGER NOT NULL DEFAULT 0`
    ).catch(() => {/* already exists */});
    await db.execute(
      `ALTER TABLE job_watch_fetch_log ADD COLUMN offers_filtered INTEGER NOT NULL DEFAULT 0`
    ).catch(() => {/* already exists */});
    // Fallback: migration 016 — consolide la source LinkedIn 'linkedin_rss' → 'linkedin'.
    // Supprime d'abord les doublons (config 'linkedin' déjà présente pour le profil),
    // puis bascule le reste. Idempotent : no-op une fois les lignes legacy migrées.
    await db.execute(
      `DELETE FROM job_watch_config
       WHERE source = 'linkedin_rss'
         AND EXISTS (
           SELECT 1 FROM job_watch_config existing
           WHERE existing.source = 'linkedin'
             AND existing.profile_id IS job_watch_config.profile_id
         )`
    ).catch(() => {/* table absente ou rien à migrer */});
    await db.execute(
      `UPDATE job_watch_config SET source = 'linkedin' WHERE source = 'linkedin_rss'`
    ).catch(() => {/* table absente ou rien à migrer */});

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
      ['ft_client_id',          ''],
      ['ft_client_secret',      ''],
      ['ft_access_token',       ''],
      ['ft_token_expires_at',   ''],
      ['min_save_score',        '20'],
      ['auto_clean_expired_enabled', '1'],
      ['expired_max_age_days',  '30'],
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
