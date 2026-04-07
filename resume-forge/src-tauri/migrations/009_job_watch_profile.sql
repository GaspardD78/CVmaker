-- Migration 009: Rattacher la veille emploi au profil utilisateur
--
-- Ajoute profile_id à job_watch_config et job_offers pour isoler
-- les données de chaque profil (multi-utilisateur sur un même appareil).
-- Les paramètres globaux (job_watch_settings) restent partagés car ils
-- contiennent des clés API et préférences liées à l'appareil.

ALTER TABLE job_watch_config ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_job_watch_config_profile ON job_watch_config(profile_id);

ALTER TABLE job_offers ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_job_offers_profile ON job_offers(profile_id);
