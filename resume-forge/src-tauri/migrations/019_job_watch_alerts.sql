-- Migration 019: Portefeuille multi-alertes pour la veille emploi
--
-- Introduit job_watch_alerts (une piste de recherche = un SearchProfile autonome,
-- son filtre IA et son apprentissage) et job_offer_alerts (liaison N-N offre↔piste
-- portant le score par piste).
--
-- La configuration existante devient l'alerte « Recherche principale ».
-- Purement additive : rien n'est supprimé, les anciennes clés de job_watch_settings
-- restent en base pour archivage (même convention que la migration 010).
--
-- Piège principal : job_watch_config.profile_id et job_offers.profile_id ont été
-- ajoutés par ALTER TABLE sans NOT NULL (migration 009) et peuvent valoir NULL,
-- alors que job_watch_alerts.profile_id vaut '' par défaut. D'où le COALESCE
-- systématique dans les jointures.

CREATE TABLE IF NOT EXISTS job_watch_alerts (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id         TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  color              TEXT NOT NULL DEFAULT '#6366f1',
  kind               TEXT NOT NULL DEFAULT 'core',
  position           INTEGER NOT NULL DEFAULT 0,
  enabled            INTEGER NOT NULL DEFAULT 1,
  search_profile     TEXT NOT NULL,
  ai_filter_rule     TEXT,
  learned_dict       TEXT NOT NULL DEFAULT '{"positive":{},"negative":{}}',
  company_reputation TEXT NOT NULL DEFAULT '{}',
  learned_decayed_at TEXT,
  last_fetched_at    TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_watch_alerts_profile ON job_watch_alerts(profile_id, position);

CREATE TABLE IF NOT EXISTS job_offer_alerts (
  offer_id   TEXT NOT NULL REFERENCES job_offers(id)       ON DELETE CASCADE,
  alert_id   TEXT NOT NULL REFERENCES job_watch_alerts(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL DEFAULT 0,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (offer_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_alert ON job_offer_alerts(alert_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_offer ON job_offer_alerts(offer_id);

-- ── Étape 1 : une alerte par profil ayant un search_profile ──────────────────
INSERT INTO job_watch_alerts (
  profile_id, name, color, kind, position, enabled,
  search_profile, ai_filter_rule, learned_dict, company_reputation, learned_decayed_at
)
SELECT
  s.profile_id,
  'Recherche principale',
  '#6366f1',
  'core',
  0,
  1,
  s.value,
  (SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'ai_filter_rule' AND v.profile_id = s.profile_id),
  -- Concaténation plutôt que json_object() : pas de dépendance à l'extension JSON1
  '{"positive":'
    || COALESCE((SELECT v.value FROM job_watch_settings v
         WHERE v.key = 'learned_dict_positive' AND v.profile_id = s.profile_id), '{}')
    || ',"negative":'
    || COALESCE((SELECT v.value FROM job_watch_settings v
         WHERE v.key = 'learned_dict_negative' AND v.profile_id = s.profile_id), '{}')
    || '}',
  COALESCE((SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'company_reputation' AND v.profile_id = s.profile_id), '{}'),
  (SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'learned_dict_decayed_at' AND v.profile_id = s.profile_id)
FROM job_watch_settings s
WHERE s.key = 'search_profile';

-- ── Étape 2 : rattachement des sources configurées ───────────────────────────
ALTER TABLE job_watch_config ADD COLUMN alert_id TEXT REFERENCES job_watch_alerts(id) ON DELETE CASCADE;

UPDATE job_watch_config
SET alert_id = (
  SELECT a.id FROM job_watch_alerts a
  WHERE a.profile_id = COALESCE(job_watch_config.profile_id, '')
  ORDER BY a.position LIMIT 1
)
WHERE alert_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_watch_config_alert ON job_watch_config(alert_id);

-- ── Étape 3 : rattachement des offres existantes ─────────────────────────────
INSERT OR IGNORE INTO job_offer_alerts (offer_id, alert_id, score, matched_at)
SELECT o.id, a.id, COALESCE(o.score, 0), COALESCE(o.fetched_at, datetime('now'))
FROM job_offers o
JOIN job_watch_alerts a ON a.profile_id = COALESCE(o.profile_id, '');

-- ── Étape 4 : traçabilité du feedback et des logs ────────────────────────────
ALTER TABLE job_offer_feedback ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_alert ON job_offer_feedback(alert_id);

ALTER TABLE job_watch_fetch_log ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_fetch_log_alert ON job_watch_fetch_log(alert_id, fetched_at DESC);
