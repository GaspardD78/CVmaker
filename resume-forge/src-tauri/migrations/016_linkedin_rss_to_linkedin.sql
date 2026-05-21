-- Migration 016 : Consolidation de la source LinkedIn
--
-- L'ancienne source 'linkedin_rss' (flux RSS tiers via rss.app) est dépréciée
-- et remplacée par la source canonique 'linkedin' (recherche X-ray DuckDuckGo,
-- cf. parsers/linkedin-xray.ts). Cette migration bascule les configurations
-- de collecte existantes 'linkedin_rss' → 'linkedin'.
--
-- Idempotente : une fois exécutée, plus aucune ligne 'linkedin_rss' ne subsiste
-- dans job_watch_config ; les ré-exécutions (fallback db.ts) sont des no-op.
--
-- Note : les offres historiques (job_offers) conservent leur source d'origine
-- pour préserver l'affichage et la traçabilité ; seule la config de collecte
-- est consolidée.

-- 1. Supprime les configs 'linkedin_rss' redondantes lorsqu'une config
--    'linkedin' existe déjà pour le même profil (évite deux entrées LinkedIn).
--    `IS` compare profile_id de façon NULL-safe (NULL = NULL → vrai).
DELETE FROM job_watch_config
WHERE source = 'linkedin_rss'
  AND EXISTS (
    SELECT 1 FROM job_watch_config existing
    WHERE existing.source = 'linkedin'
      AND existing.profile_id IS job_watch_config.profile_id
  );

-- 2. Bascule les configs 'linkedin_rss' restantes vers 'linkedin'.
UPDATE job_watch_config SET source = 'linkedin' WHERE source = 'linkedin_rss';
