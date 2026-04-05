-- Migration 008: SearchIntent scoring model
--
-- Inserts a default search_intent entry for existing installations that were
-- created before Sprint 2.  The app-side loadSettingsFromDb will also migrate
-- any legacy positive_keywords / negative_keywords rows automatically, but
-- this row guarantees a parseable default is always present.
--
-- Note on soft-delete: the sprint requested a `deleted_at` column.
-- Migration 007 already introduced `archived_at` on job_offers, which is
-- semantically identical (non-NULL = soft-deleted).  No duplicate column is
-- added; the existing archived_at / is_archived pair is kept for consistency.

INSERT OR IGNORE INTO job_watch_settings (key, value)
VALUES (
  'search_intent',
  '{"role":{"primary":[],"mustExclude":[]},"domain":{"required":[],"preferred":[],"excluded":[]},"salary":{"target":null,"hideIfBelow":null}}'
);
