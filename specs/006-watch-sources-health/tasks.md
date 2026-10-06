# Tasks 006

## Phase 1 - Statuts de source
- [x] `source-status.ts` + `source-status.test.ts` (un cas par statut, page « Request Rejected »)
- [x] `fetcher.ts` : `sourceStatus`, `failure`, journal enrichi ; `rss-utils.ts` et `apec.ts` lèvent des `SourceError`
- [x] Tableau « Dernières collectes » : badge par statut, info-bulle (code HTTP, URL sans secret, heure, conseil), par piste

## Phase 2 - APEC
- [x] Rust : GET préalable + cookies + en-têtes de navigateur ordinaire
- [x] Pause 24 h (`source-cooldown.ts`, table `job_watch_source_cooldown`), message « Créez une alerte e-mail APEC »
- [x] `AUDIT.md`
- [ ] Ingestion des alertes e-mail APEC (hors périmètre, amélioration suivante)

## Phase 3 - Emploi Territorial
- [x] Détection pare-feu, plus de repli trompeur sur le flux global
- [x] Spec OpenAPI v5.3 lue : API authentifiée, sans recherche d'offres publiées, aucun parser API (décision finale, `AUDIT.md`)
- [x] Source indisponible : migration 022, statut et message, plus proposée, plus interrogée ; parser RSS conservé

## Phase 4 - Sources et requêtes par piste
- [x] Sources par piste : déjà livrées (spec 003)
- [x] `french-titles.ts`, builders France Travail / Emploi Territorial, empreinte de requête, statut `intitulés inadaptés`

## Phase 5 - Indeed / HelloWork
- [x] Explication et lien « Configurer » dans le tableau ; détection de contrôle anti-robot (`bloquee`)

## Phase 6 - Doublons
- [x] `offer-dedup.ts`, cas Hublo reproduit (deux causes), collecte, store, métriques, diagnostic
- [x] Indicateur « piste quasi identique »

## Phase 7 - Version du scoring
- [x] `score_version`, `score-recalc.ts`, store, bouton, bandeau, scores arrondis, seuil et métriques sur la version courante

## Phase 8 - Seuil
- [x] `threshold-analysis.ts`, `ThresholdPanel.tsx`

## Phase 9 - Blacklist
- [x] `blacklist-suggestions.ts`, `BlacklistSuggestions.tsx`, `companyTitleExclusions`, apprentissage négatif protégé

## Phase 10 - Prompts
- [x] `source-coverage.ts`, prompts de diagnostic, d'optimisation et de revue de portefeuille

## Phase 11 - Documentation
- [x] `ARCHITECTURE.md`, `CHANGELOG.md`, `CLAUDE.md`
