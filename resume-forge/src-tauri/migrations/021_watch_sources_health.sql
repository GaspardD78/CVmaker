-- Migration 021: santé des sources, version du scoring, intitulés de piste (spec 006)
--
-- Purement additive. Aucune donnée n'est supprimée ni réécrite : les offres,
-- retours, learnedDict et blacklists restent tels quels.

-- Statut détaillé d'une collecte (la colonne `status` historique garde son CHECK).
ALTER TABLE job_watch_fetch_log ADD COLUMN source_status TEXT;
ALTER TABLE job_watch_fetch_log ADD COLUMN http_status   INTEGER;
ALTER TABLE job_watch_fetch_log ADD COLUMN error_url     TEXT;

-- Version du scorer ayant produit le score. Les offres existantes valent 1
-- (échelle antérieure) et sont recalculées en tâche de fond.
ALTER TABLE job_offers       ADD COLUMN score_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE job_offer_alerts ADD COLUMN score_version INTEGER NOT NULL DEFAULT 1;

-- Dernière modification des intitulés visés d'une piste : les rejets
-- antérieurs ne comptent plus dans les suggestions de blacklist.
ALTER TABLE job_watch_alerts ADD COLUMN titles_updated_at TEXT;

-- Repos imposé à une source qui a refusé nos requêtes (pas de martèlement).
CREATE TABLE IF NOT EXISTS job_watch_source_cooldown (
  source        TEXT PRIMARY KEY,
  blocked_until TEXT NOT NULL,
  reason        TEXT
);
