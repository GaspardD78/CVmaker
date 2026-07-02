-- 018_duplicate_dismissals.sql
-- Paires d'expériences du profil maître explicitement marquées "non-doublon
-- confirmé" par l'utilisateur depuis le scan de doublons (bouton "Scanner les
-- doublons" de la page profil). Une paire présente ici n'est plus jamais
-- re-proposée par les scans suivants : ignorer un groupe enregistre toutes ses
-- paires, retirer une expérience d'un groupe enregistre les paires entre elle
-- et les autres membres. Les ids sont stockés en ordre canonique
-- (entry_id_a < entry_id_b) pour que chaque paire n'existe qu'une fois.
-- La suppression d'une des deux expériences supprime la paire en cascade.

CREATE TABLE duplicate_dismissals (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entry_id_a    TEXT NOT NULL REFERENCES master_entries(id) ON DELETE CASCADE,
  entry_id_b    TEXT NOT NULL REFERENCES master_entries(id) ON DELETE CASCADE,
  dismissed_at  TEXT DEFAULT (datetime('now')),
  UNIQUE (entry_id_a, entry_id_b),
  CHECK (entry_id_a < entry_id_b)
);
