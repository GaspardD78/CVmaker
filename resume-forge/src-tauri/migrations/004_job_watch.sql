-- Migration 004 : Module Veille Emploi
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS

CREATE TABLE IF NOT EXISTS job_watch_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,           -- 'apec' | 'indeed' | 'wttj' | 'linkedin_rss'
    keywords        TEXT NOT NULL DEFAULT '[]',  -- JSON array ex: ["recruteur", "talent acquisition"]
    location        TEXT,                    -- ex: "Paris"
    radius_km       INTEGER DEFAULT 50,
    contract_types  TEXT DEFAULT '[]',       -- JSON array ex: ["CDI", "Freelance"]
    rss_url         TEXT,                    -- URL RSS construite ou fournie manuellement
    enabled         INTEGER DEFAULT 1,
    last_fetched_at TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_offers (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    source               TEXT NOT NULL,
    url                  TEXT NOT NULL,
    hash                 TEXT NOT NULL UNIQUE,     -- SHA256(source + url)
    title                TEXT NOT NULL,
    company              TEXT,
    location             TEXT,
    contract_type        TEXT,
    description_snippet  TEXT,                     -- 500 premiers caractères
    published_at         TEXT,
    fetched_at           TEXT DEFAULT (datetime('now')),
    score                INTEGER DEFAULT 0,        -- score de pertinence 0-100
    commute_minutes      INTEGER,                  -- temps de trajet TC en minutes (NULL si non calculé)
    commute_status       TEXT DEFAULT 'pending',   -- 'pending' | 'ok' | 'error' | 'not_found'
    is_read              INTEGER DEFAULT 0,
    is_archived          INTEGER DEFAULT 0,
    kanban_id            TEXT,                     -- FK vers applications(id) — TEXT UUID
    FOREIGN KEY (kanban_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_offers_hash    ON job_offers(hash);
CREATE INDEX IF NOT EXISTS idx_job_offers_source  ON job_offers(source);
CREATE INDEX IF NOT EXISTS idx_job_offers_score   ON job_offers(score);
CREATE INDEX IF NOT EXISTS idx_job_offers_fetched ON job_offers(fetched_at);

CREATE TABLE IF NOT EXISTS job_watch_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Valeurs par défaut (INSERT OR IGNORE pour idempotence)
INSERT OR IGNORE INTO job_watch_settings (key, value) VALUES
    ('fetch_interval_hours',  '4'),
    ('email_digest_enabled',  '1'),
    ('email_digest_time',     '08:00'),
    ('email_smtp_host',       ''),
    ('email_smtp_port',       '587'),
    ('email_smtp_user',       ''),
    ('email_smtp_password',   ''),
    ('email_to',              ''),
    ('positive_keywords',     '[]'),
    ('negative_keywords',     '[]'),
    ('navitia_api_key',       ''),
    ('commute_origin_address',''),
    ('commute_departure_time','09:00'),
    ('commute_max_minutes',   '75');
