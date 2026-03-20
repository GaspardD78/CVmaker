-- Add job description field to applications
ALTER TABLE applications ADD COLUMN job_description TEXT;

-- Store computed compatibility scores
CREATE TABLE compatibility_scores (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id       TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  cv_id                TEXT NOT NULL,
  score_global         INTEGER NOT NULL,
  score_skills         INTEGER NOT NULL,
  score_experience     INTEGER NOT NULL,
  score_education      INTEGER NOT NULL,
  score_keywords       INTEGER NOT NULL,
  details              TEXT NOT NULL, -- JSON: { axes, advice }
  cv_content_hash      TEXT NOT NULL, -- detect CV changes
  job_description_hash TEXT NOT NULL, -- detect job description changes
  computed_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_compat_scores_app ON compatibility_scores(application_id);
