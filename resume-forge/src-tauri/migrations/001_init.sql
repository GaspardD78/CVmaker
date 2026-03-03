CREATE TABLE profiles (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'France',
  linkedin_url  TEXT,
  github_url    TEXT,
  portfolio_url TEXT,
  photo_path    TEXT,
  title         TEXT,
  summary       TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE master_entries (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type    TEXT NOT NULL CHECK (entry_type IN (
    'experience', 'education', 'skill', 'certification',
    'language', 'interest', 'project', 'volunteer'
  )),
  title         TEXT NOT NULL,
  subtitle      TEXT,
  location      TEXT,
  start_date    TEXT,
  end_date      TEXT,
  is_current    INTEGER DEFAULT 0,
  description   TEXT,
  metadata      TEXT DEFAULT '{}',
  sort_order    INTEGER DEFAULT 0,
  tags          TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_entries_profile ON master_entries(profile_id);
CREATE INDEX idx_entries_type ON master_entries(entry_type);

CREATE TABLE cv_documents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  template_id   TEXT NOT NULL DEFAULT 'ats-classic',
  target_job    TEXT,
  target_company TEXT,
  custom_summary TEXT,
  settings      TEXT DEFAULT '{}',
  is_favorite   INTEGER DEFAULT 0,
  last_exported TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE cv_blocks (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  cv_id           TEXT NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  entry_id        TEXT REFERENCES master_entries(id) ON DELETE SET NULL,
  block_type      TEXT NOT NULL,
  section_name    TEXT,
  custom_content  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_visible      INTEGER DEFAULT 1,
  override_data   TEXT DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_blocks_cv ON cv_blocks(cv_id, sort_order);

CREATE TABLE applications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cv_id           TEXT REFERENCES cv_documents(id) ON DELETE SET NULL,
  company_name    TEXT NOT NULL,
  job_title       TEXT NOT NULL,
  job_url         TEXT,
  source          TEXT CHECK (source IN (
    'job_board', 'spontaneous', 'network', 'recruiter', 'linkedin', 'other'
  )),
  source_detail   TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'applied',
    'acknowledged',
    'phone_screen',
    'interview',
    'technical_test',
    'offer',
    'accepted',
    'rejected',
    'withdrawn',
    'ghosted'
  )),
  salary_min      INTEGER,
  salary_max      INTEGER,
  location        TEXT,
  remote_policy   TEXT,
  priority        INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  notes           TEXT,
  applied_at      TEXT,
  next_action     TEXT,
  next_action_date TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_apps_status ON applications(status);
CREATE INDEX idx_apps_profile ON applications(profile_id);

CREATE TABLE application_events (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'status_change', 'note', 'email_sent', 'email_received',
    'call', 'interview', 'followup', 'document_sent', 'other'
  )),
  event_date      TEXT NOT NULL DEFAULT (datetime('now')),
  title           TEXT NOT NULL,
  description     TEXT,
  old_status      TEXT,
  new_status      TEXT,
  calendar_id     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_app ON application_events(application_id, event_date);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('app_version', '1.0.0'),
  ('default_template', 'ats-classic'),
  ('default_language', 'fr'),
  ('theme', 'light');
