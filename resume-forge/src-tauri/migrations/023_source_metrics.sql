-- Migration 023: mesures par source et catégorie d'employeur (spec 007)
--
-- Purement additive. `metrics` : JSON propre à la source (Choisir le service
-- public : offres listées, retenues, enrichies, durée). `employer_type` :
-- catégorie d'employeur affichée par la source (« Communes »), distincte de
-- `company` qui ne porte qu'un employeur réel.
ALTER TABLE job_watch_fetch_log ADD COLUMN metrics TEXT;
ALTER TABLE job_offers          ADD COLUMN employer_type TEXT;
