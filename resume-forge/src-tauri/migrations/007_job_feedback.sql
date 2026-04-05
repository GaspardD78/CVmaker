-- Migration 007: Behavioral feedback table + archived_at timestamp

CREATE TABLE IF NOT EXISTS job_offer_feedback (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  offer_id       TEXT NOT NULL,
  action         TEXT NOT NULL,
  time_to_action INTEGER,
  created_at     DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_offer ON job_offer_feedback(offer_id);

ALTER TABLE job_offers ADD COLUMN archived_at TEXT;
