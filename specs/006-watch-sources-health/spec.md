# Spec 006 - Veille Emploi : sources, doublons, rescoring, blacklist

Chemins relatifs à `resume-forge/`. Branche : `claude/happy-planck-jrzyud`.

## Objectif

Que la Veille collecte réellement sur ses sources, n'affiche plus de doublons, compare des scores sur une même échelle et ne pousse plus à blacklister des employeurs ciblés.

## Point de départ : état de la spec 005

Le dépôt ne contient **aucune spec 005 « analyse IA de la Veille »** : le seul `005` du dépôt est `005-cv-angles` (CV, hors périmètre), absente de `specs/` et décrite dans `CHANGELOG.md`. Rien de l'analyse IA de la Veille n'est donc livré ; ce qui recoupe la 006 est réalisé ici plutôt que dupliqué :

| Élément attendu de la 005 | État constaté | Traitement en 006 |
|---|---|---|
| Dédoublonnage, indicateur « piste quasi identique » | non fait | phase 6 (`alert-similarity.ts`) |
| Pas d'apprentissage négatif sur un terme des intitulés/skills/domaines | non fait | phase 9 (`protectedTokensOf`) |
| Portée des exclusions | non fait | phase 9 (`companyTitleExclusions`) |
| Échantillon du diagnostic IA | existant (`generateDiagnosticPrompt`), jointure dupliquant les offres | phases 6 et 10 |
| Sources par piste | **déjà livré** (spec 003 : `job_watch_config.alert_id`, `alert.sources`) | réutilisé, pas de colonne `enabled_sources` |

## Constats et exigences

| # | Constat | Exigence |
|---|---|---|
| C1 | APEC « Erreur » (403), Emploi Territorial « Erreur » (404 puis « Request Rejected ») | statuts distincts et honnêtes, jamais « 0 offre » |
| C2 | France Travail « Vide » avec des intitulés anglais entre guillemets | requête bâtie sur les intitulés français ; sinon `intitulés inadaptés` |
| C3 | Indeed et HelloWork « Non configurée » | configuration guidée, sans contournement |
| C4 | Offre Hublo affichée deux fois | cause confirmée par test, une seule carte |
| C5 | Scores sur deux échelles, seuil comparant des échelles différentes | version du scorer, recalcul, échelle unique |
| C6 | « Score minimum trop élevé ? 79 % » sans issue | seuil visible, offres masquées, seuil suggéré |
| C7 | Suggestions de blacklist d'entreprises ciblées | titres rejetés visibles, deux portées, garde-fous |
| C8 | Diagnostic IA sur échantillon quasi mono-source | couverture par source, avertissement > 70 % |

## Règles non négociables

1. Jamais de contournement d'une protection anti-robot : en-têtes réalistes et session de navigateur ordinaire seulement ; si le site refuse, on s'arrête et on l'affiche.
2. Migrations additives et idempotentes ; aucune perte (offres, feedback, learnedDict, blacklist).
3. Aucune action destructive sans confirmation ni annulation.
4. Le module CV n'est pas touché.
