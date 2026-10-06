-- Migration 022: origine et référence des offres relayées (spec 007)
--
-- Purement additive. `origin` : emploi_territorial | place_emploi_public (NULL pour
-- les sources directes). `reference` : référence de l'annonce chez l'émetteur,
-- clé de dédoublonnage entre canaux (Choisir le service public, e-mail).
ALTER TABLE job_offers ADD COLUMN origin    TEXT;
ALTER TABLE job_offers ADD COLUMN reference TEXT;
CREATE INDEX IF NOT EXISTS idx_job_offers_reference ON job_offers(reference);
