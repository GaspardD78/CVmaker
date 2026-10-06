-- Migration 022: Emploi Territorial devient une source indisponible (spec 006)
--
-- Le site bloque les accès automatiques et son API exige un token réservé au
-- support GIP Informatique des CDG (cf. specs/006-watch-sources-health/AUDIT.md).
-- On désactive la source pour toutes les pistes SANS supprimer la configuration :
-- l'URL de flux éventuelle et le rattachement à la piste sont conservés, pour
-- pouvoir réactiver la source si le flux revient.
UPDATE job_watch_config SET enabled = 0 WHERE source = 'emploi_territorial';
