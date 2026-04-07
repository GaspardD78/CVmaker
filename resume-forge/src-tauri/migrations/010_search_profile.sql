-- Migration 010: SearchProfile — source unique de vérité pour requêtes + scoring
--
-- Remplace l'ancienne dualité :
--   - job_watch_config.keywords   → paramètres de recherche par source
--   - job_watch_settings.search_intent → critères de scoring globaux
--
-- Désormais un seul objet JSON `search_profile` dans job_watch_settings
-- pilote à la fois les requêtes API et le scoring.
--
-- Compatibilité ascendante :
--   - Les colonnes keywords/location/radius_km/contract_types/exclude_keywords
--     restent en base (non supprimées) mais ne sont plus utilisées par l'app.
--   - search_intent reste en base pour archivage, non lu par le code.
--   - Le store migre automatiquement search_intent → search_profile au chargement.

INSERT OR IGNORE INTO job_watch_settings (key, value)
VALUES (
  'search_profile',
  '{"name":"Ma recherche","jobTitles":[],"skills":[],"domains":[],"excludeTitles":[],"excludeDomains":[],"location":{"label":"","city":"","inseeCode":"","departmentCodes":[],"radiusKm":30},"contractTypes":["CDI"],"salary":{"min":null,"target":null},"scoring":{"mode":"balanced"},"blacklistedCompanies":[]}'
);
