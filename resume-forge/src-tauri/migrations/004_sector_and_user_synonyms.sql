-- Migration 004: Add sector field to profiles + user_synonyms table

ALTER TABLE profiles ADD COLUMN sector TEXT;

CREATE TABLE IF NOT EXISTS user_synonyms (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  canonical  TEXT NOT NULL,
  variants   TEXT NOT NULL,  -- JSON array
  sector     TEXT,           -- null = tous secteurs
  created_at TEXT DEFAULT (datetime('now'))
);
