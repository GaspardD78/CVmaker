-- Migration 025: mentions d'en-tête du profil (permis de conduire, mentions libres)
--
-- driving_license : texte libre, ex. « Permis B ».
-- header_extras   : tableau JSON de chaînes libres, ex. ["Mobilité Île-de-France"].
-- Affichés dans l'en-tête des CV après la ville ; masquables par CV (cv.settings).
ALTER TABLE profiles ADD COLUMN driving_license TEXT;
ALTER TABLE profiles ADD COLUMN header_extras TEXT;
