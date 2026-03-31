-- Migration 006 : Mots-clés d'exclusion par source
-- Ajoute exclude_keywords (JSON array) sur job_watch_config

ALTER TABLE job_watch_config ADD COLUMN exclude_keywords TEXT NOT NULL DEFAULT '[]';
