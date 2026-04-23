-- Migration 014: fetch log breakdown columns
-- Adds explicit counters to job_watch_fetch_log so the HealthDashboard can
-- show users why `offers_fetched` differs from `offers_new`:
--   offers_duplicate : rejected because already present (hash) or cross-source duplicate
--   offers_filtered  : rejected because score < min_save_score

ALTER TABLE job_watch_fetch_log ADD COLUMN offers_duplicate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_watch_fetch_log ADD COLUMN offers_filtered  INTEGER NOT NULL DEFAULT 0;
