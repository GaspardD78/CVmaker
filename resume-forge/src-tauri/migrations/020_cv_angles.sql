-- 020_cv_angles.sql
-- Bibliothèque d'angles de CV, par profil (additive). Un angle oriente la
-- sélection et l'ordre du contenu pour un type de poste ; il ne contient aucun
-- fait de CV. Valeurs : title_rule ∈ ('profile', 'profile+keyword'),
-- older_policy ∈ ('one-line', 'short'), skill_category_order = liste JSON de
-- titres de catégories de compétences.
-- L'affinité des entrées n'est pas ici : tags « angle:<slug> » et
-- « hide:<slug> » de master_entries.tags (aucune migration des tags).

CREATE TABLE IF NOT EXISTS cv_angles (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL,
  label                 TEXT NOT NULL,
  title_rule            TEXT NOT NULL DEFAULT 'profile',
  summary_structure     TEXT NOT NULL DEFAULT '',
  skill_category_order  TEXT NOT NULL DEFAULT '[]',
  vocabulary            TEXT NOT NULL DEFAULT '',
  older_policy          TEXT NOT NULL DEFAULT 'one-line',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now')),
  UNIQUE (profile_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_cv_angles_profile ON cv_angles(profile_id);
