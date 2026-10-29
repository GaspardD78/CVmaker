# Spec 004 - Audit et refonte du moteur de CV IA

**Branche de travail** : `claude/quirky-cori-vrxoct` (la branche `fix/cv-engine-optimization` du brief a été remplacée par la branche imposée par l'environnement).
**Périmètre** : `resume-forge/src` (TypeScript). Hors périmètre : Rust (`src-tauri/`), Veille Emploi (`lib/watcher/`), prompts hors CV.

## Objectif
Rendre le CV produit par le flux « prompt externe → JSON collé → `parseAiCvResponse` → `applyAiCvToBlocks` → rendu / export » réellement optimisé pour une annonce, sans anomalie de structure, de langue ou de mise en page, et sans pouvoir inventer d'information.

## Anomalies à corriger
| # | Symptôme | Cause suspectée |
|---|---|---|
| A | La section « Compétences » disparaît, remplacée par des catégories | `apply-ai-cv.ts` renomme l'en-tête en 1re catégorie |
| B | Sections / catégories vides affichées | `PrintableCV` et `export-docx` rendent tout `section_header` |
| C | CV en français pour une annonce EN | aucune consigne de langue, « Présent » et niveaux figés |
| D | Section « Langues » toujours présente | aucune règle de pertinence |
| E | Optimisation faible | prompt monolithique, `SYSTEM_RULES` conçu pour du texte |

## Règles non négociables
1. Non destructif : jamais de modification des `MasterEntry` (tout vit dans `cv_blocks`).
2. Zéro invention (chiffres, compétences, employeurs, diplômes, dates).
3. Rétrocompatibilité : l'ancien schéma JSON se parse et s'applique toujours ; tout champ nouveau est optionnel.
4. TypeScript strict, pas de `any`, pas de nouvelle dépendance.
5. Test d'abord pour chaque anomalie.
6. Classes CSS « contrat » (ARCHITECTURE.md §4.2) inchangées.

## Critères d'acceptation
Voir §Phase 6 du brief : compétences conservées + sous-en-têtes sans doublon, aucune section vide (principal, sidebar, DOCX), langues pertinentes, annonce EN supportée (consigne, `sectionLabels`, « Present »), ancien schéma accepté, JSON bruité accepté, nombre inventé détecté, invariant `planCvBlockOrder`, snapshots de prompt, `bunx tsc --noEmit` et `bun test` verts.

## Addendum : orientation des puces (`missions` / `resultats`)

Les consignes qui poussent vers les chiffres (définition de la puce, gras sur les résultats, « conserve tous les chiffres », questions de quantification) sont regroupées dans `lib/cv-focus-rules.ts` et dépendent d'un réglage :

- `missions` (défaut) : le CV explique le périmètre et les missions ; 3 chiffres au maximum hors années, aucun gras, `warnings` = périmètres à préciser.
- `resultats` : texte historique, identique octet pour octet (instantanés de `cv-prompt.test.ts`).

Réglage par profil (`settings`, `cv_bullet_focus:{profileId}`) et par CV (`cv.settings.bulletFocus`) ; priorité CV > profil > défaut de la cible > `missions` (`resolveBulletFocus`). Le garde-fou ajoute `too-many-numbers`, `bold-in-missions-mode` (gras retiré) et `summary-has-numbers`, sans toucher à l'anti-invention des chiffres. Schéma JSON inchangé.

## Addendum : temps des verbes, titre libre, accroche (lot 4)

- Temps des verbes : réglage par profil `cv_verb_tense:{profileId}` (`infinitif` par défaut, `passe-present`, `nominal`), composé avec l'orientation dans `lib/cv-focus-rules.ts` : une seule définition de la puce (`bulletForm`) et une règle du premier mot (`tenseRule`). Le garde-fou adapte `tense` (`bulletLead`) : infinitif = signale participe passé, nom d'action et verbe conjugué ; nominal = signale les verbes ; passé / présent = cohérence historique.
- Titre libre : `TargetChoice.titleRule = 'free'`, choix manuel pour un CV, prioritaire sur l'angle et la fiche ; le titre proposé est conservé tel quel.
- Accroche : le prompt interdit de répéter le titre du CV en début d'accroche ; `summary-starts-with-title` côté garde-fou.

## Addendum : lignes de compétences reformulées (lot 3)

`cvSkillLines: [{ "text", "sources" }]` (champ additif) : lignes propres au CV, jamais écrites dans le profil maître. Chaque ligne cite au moins une entrée existante (expérience ou compétence) ; sans source valide, elle est retirée. Avec au moins 3 lignes valides, elles deviennent des blocs `custom_text` (`overrideData.aiSkillLine`) sous « Compétences » et les catégories de compétences du profil ne restent visibles que si l'IA les liste en `visible: true` ; en dessous, rien n'est masqué. Réapplication idempotente ; une application sans lignes défait la précédente.

## Addendum : fusion d'expériences (lot 2)

`mergedEntries: [{ "ids", "titleOverride", "subtitleOverride"?, "description"? }]` (champ additif) regroupe plusieurs entrées d'un même type en une ligne. Le bloc de la plus récente porte `override_data` (`title`, `subtitle`, `description`, dates calculées, `mergedFrom`) ; les autres passent `is_visible = false` avec `mergedInto`. Les dates sont calculées, jamais fournies par l'IA, et jamais via `datesOverride`. Réapplication idempotente ; une application sans fusion, ou le bouton « Défaire », rétablit surcharges et visibilité d'origine (`mergeBackup`, `mergedWasVisible`). Une `cvSkillLine` peut citer une entrée fusionnée comme source.
