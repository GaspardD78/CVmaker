-- Migration 015: Paramètres de veille emploi isolés par profil
--
-- Ajoute profile_id à job_watch_settings pour que chaque profil ait
-- ses propres préférences de recherche (intitulés, score min, commute…).
-- profile_id = '' désigne les paramètres globaux (clés API, SMTP, etc.)
-- communs à tous les profils sur l'appareil.
--
-- Stratégie de lecture : les paramètres spécifiques au profil priment
-- sur les globaux ; un nouveau profil hérite des valeurs par défaut.

CREATE TABLE IF NOT EXISTS job_watch_settings_new (
  key        TEXT NOT NULL,
  profile_id TEXT NOT NULL DEFAULT '',
  value      TEXT,
  PRIMARY KEY (key, profile_id)
);

-- Copie les paramètres existants comme paramètres globaux (profile_id = '')
INSERT INTO job_watch_settings_new (key, profile_id, value)
SELECT key, '', value FROM job_watch_settings;

DROP TABLE job_watch_settings;
ALTER TABLE job_watch_settings_new RENAME TO job_watch_settings;
