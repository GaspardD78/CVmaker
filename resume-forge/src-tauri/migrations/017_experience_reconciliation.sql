-- 017_experience_reconciliation.sql
-- Historique append-only des variantes brutes d'expériences ayant contribué à
-- une entrée du profil maître, via la réconciliation manuelle depuis un CV
-- adapté ("Synchroniser vers le profil maître"). Une ligne est écrite quand une
-- variante est fusionnée dans une entrée existante (resolution='merged') ou
-- quand une variante donne naissance à une toute nouvelle entrée
-- (resolution='new_entry'). Rien n'est jamais modifié ni supprimé ici, sauf la
-- suppression en cascade si l'entrée du profil maître elle-même est supprimée.

CREATE TABLE entry_variant_history (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  master_entry_id   TEXT NOT NULL REFERENCES master_entries(id) ON DELETE CASCADE,
  source_cv_id      TEXT REFERENCES cv_documents(id) ON DELETE SET NULL,
  source_cv_name    TEXT,
  raw_title         TEXT,
  raw_subtitle      TEXT,
  raw_location      TEXT,
  raw_start_date    TEXT,
  raw_end_date      TEXT,
  raw_is_current    INTEGER DEFAULT 0,
  raw_description   TEXT,
  match_score       REAL,
  match_criteria    TEXT DEFAULT '{}',
  resolution        TEXT NOT NULL CHECK (resolution IN ('merged', 'new_entry')),
  synced_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_variant_history_entry ON entry_variant_history(master_entry_id, synced_at DESC);
