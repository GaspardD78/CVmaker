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
