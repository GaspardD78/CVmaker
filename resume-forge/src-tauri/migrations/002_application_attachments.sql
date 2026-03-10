CREATE TABLE application_attachments (
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
);

CREATE INDEX idx_attachments_app ON application_attachments(application_id);
