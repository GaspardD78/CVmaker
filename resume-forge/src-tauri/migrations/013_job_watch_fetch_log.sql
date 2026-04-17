-- Migration 013: job_watch_fetch_log
-- Persists per-source fetch results for the HealthDashboard transparency view.

CREATE TABLE IF NOT EXISTS job_watch_fetch_log (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source         TEXT NOT NULL,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  offers_fetched INTEGER NOT NULL DEFAULT 0,
  offers_new     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL CHECK (status IN ('success', 'error', 'empty')),
  error_message  TEXT,
  duration_ms    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_source
  ON job_watch_fetch_log(source, fetched_at DESC);
