-- Migration 005 : Veille Emploi v1.2
-- - Passe les PK de INTEGER AUTOINCREMENT à TEXT UUID
-- - Ajoute salary_min, salary_max, salary_raw, location_lat, location_lon
-- - Ajoute ft_dept_code sur job_watch_config (France Travail)
-- - Ajoute les clés France Travail dans job_watch_settings

PRAGMA foreign_keys = OFF;

-- ───────────────────────────────────────────────
-- job_watch_config : INTEGER PK → TEXT UUID
-- ───────────────────────────────────────────────
ALTER TABLE job_watch_config RENAME TO job_watch_config_old;

CREATE TABLE job_watch_config (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    source          TEXT NOT NULL,
    keywords        TEXT NOT NULL DEFAULT '[]',
    location        TEXT,
    radius_km       INTEGER DEFAULT 50,
    contract_types  TEXT DEFAULT '[]',
    rss_url         TEXT,
    ft_dept_code    TEXT,
    enabled         INTEGER DEFAULT 1,
    last_fetched_at TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

INSERT INTO job_watch_config (id, source, keywords, location, radius_km, contract_types, rss_url, enabled, last_fetched_at, created_at)
SELECT lower(hex(randomblob(16))), source, keywords, location, radius_km, contract_types, rss_url, enabled, last_fetched_at, created_at
FROM job_watch_config_old;

DROP TABLE job_watch_config_old;

-- ───────────────────────────────────────────────
-- job_offers : INTEGER PK → TEXT UUID + new columns
-- ───────────────────────────────────────────────
ALTER TABLE job_offers RENAME TO job_offers_old;

CREATE TABLE job_offers (
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
    kanban_id            TEXT,
    FOREIGN KEY (kanban_id) REFERENCES applications(id) ON DELETE SET NULL
);

INSERT INTO job_offers (id, source, url, hash, title, company, location, contract_type, description_snippet, published_at, fetched_at, score, commute_minutes, commute_status, is_read, is_archived, kanban_id)
SELECT lower(hex(randomblob(16))), source, url, hash, title, company, location, contract_type, description_snippet, published_at, fetched_at, score, commute_minutes, commute_status, is_read, is_archived, kanban_id
FROM job_offers_old;

DROP TABLE job_offers_old;

CREATE INDEX IF NOT EXISTS idx_job_offers_hash    ON job_offers(hash);
CREATE INDEX IF NOT EXISTS idx_job_offers_source  ON job_offers(source);
CREATE INDEX IF NOT EXISTS idx_job_offers_score   ON job_offers(score);
CREATE INDEX IF NOT EXISTS idx_job_offers_fetched ON job_offers(fetched_at);

PRAGMA foreign_keys = ON;

-- ───────────────────────────────────────────────
-- Nouvelles clés France Travail dans job_watch_settings
-- ───────────────────────────────────────────────
INSERT OR IGNORE INTO job_watch_settings (key, value) VALUES
    ('ft_client_id',       ''),
    ('ft_client_secret',   ''),
    ('ft_access_token',    ''),
    ('ft_token_expires_at','');
