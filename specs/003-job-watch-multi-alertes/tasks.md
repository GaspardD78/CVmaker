# Tasks: Portefeuille multi-alertes et aide IA stratégique

**Input**: `specs/003-job-watch-multi-alertes/` — spec.md ✓, data-model.md ✓, plan.md ✓, prompts.md ✓, contracts/ ✓
**Branche**: `claude/job-alerts-multi-ai-optimization-a8nbxl`
**Chemins**: relatifs à `resume-forge/`

## Format : `[ID] [P?] [Story] Description`

- **[P]** — parallélisable (fichiers distincts, aucune dépendance en attente)
- Chaque jalon (J1…J5) se termine sur un commit compilable, testé et fonctionnel

**Non-régression exigée à chaque fin de jalon** :
`bunx tsc --noEmit` · `bun test` · `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`

---

## J1 — Modèle et migration

**But** : introduire les alertes sans changer une seule ligne du comportement visible.
À l'issue de ce jalon, l'utilisateur ne doit rien remarquer.

- [ ] T001 Créer `src-tauri/migrations/019_job_watch_alerts.sql` — schéma complet et étapes de migration dans data-model.md §6
- [ ] T002 Enregistrer la migration dans `src-tauri/src/lib.rs` — entrée `Migration { version: 19, description: "job_watch_alerts", … }` après la 018
- [ ] T003 [P] Étendre `src/types/job-watch.ts` — `MAX_ALERTS`, `AlertKind`, `JobWatchAlert`, `OfferAlertLink`, `JobOfferWithAlerts`, `filters.alertId` ; retirer `searchProfile` de `JobWatchSettings`
- [ ] T004 Ajouter les replis dans `src/lib/db.ts` — `CREATE TABLE IF NOT EXISTS` des deux nouvelles tables, `ALTER TABLE … .catch()` des colonnes `alert_id`, index unique `(alert_id, source)` après déduplication, rattrapage FR-054 (profil sans `search_profile`, configs orphelines)
- [ ] T005 Créer `src/lib/watcher/alerts.ts` — CRUD conforme à `contracts/alerts.ts` : `createAlert`, `listAlerts`, `updateAlert`, `deleteAlert`, `duplicateAlert`, `reorderAlerts`, `linkOfferToAlerts`, `loadOfferAlertLinks`
- [ ] T006 [P] Créer `src/lib/watcher/alerts.test.ts` — invariants I1 à I6 : cap à 4, refus de supprimer la dernière, positions contiguës, duplication sans apprentissage, isolation par profil, `job_offers.score` = max des liaisons
- [ ] T007 Étendre `src/stores/jobWatchStore.ts` — état `alerts` + `activeAlertId`, actions CRUD, chargement des offres avec leurs liaisons ; retrait de la gestion globale de `searchProfile`, `aiFilterRule` et des dictionnaires appris
- [ ] T008 Adapter les points d'appel cassés par le retrait de `settings.searchProfile` — `HealthDashboard.tsx`, `HealthDrawer.tsx`, `SetupWizard.tsx`, `CvGeneratorDrawer.tsx`, `JobWatchConfig.tsx` : lire le profil de l'alerte active (adaptation minimale, l'UI complète arrive en J4)

**Vérification** : ouvrir l'app sur une base existante → offres, scores et réglages intacts ; `job_watch_alerts` contient une ligne par profil ; `job_offer_alerts` contient une ligne par offre.

---

## J2 — Pipeline de collecte multi-alertes

**But** : collecter pour N alertes sans multiplier les requêtes par N.

- [ ] T010 Créer `src/lib/watcher/query-key.ts` — `computeQueryKey(source, profile)` : normalisation (minuscules, trim, tri) des seuls paramètres influençant la requête réseau, par source
- [ ] T011 [P] Créer `src/lib/watcher/query-key.test.ts` — profils identiques → même clé ; ville différente → clés distinctes ; compétences ou salaire différents → **même** clé ; ordre des tableaux indifférent
- [ ] T012 Réécrire `runFetch` dans `src/lib/watcher/fetcher.ts` — étapes A à G du plan §2 : plan de collecte, regroupement par `(source, queryKey)`, exécution séquencée avec `SOURCE_THROTTLE_MS`, scoring par alerte, agrégation par hash, rattachement
- [ ] T013 Implémenter l'étape F dans `fetcher.ts` — offre déjà en base nouvellement matchée : créer la liaison manquante, relever `job_offers.score` si meilleur, ne jamais toucher `is_read` / `is_archived`
- [ ] T014 Mettre en cache la résolution géographique par clé de localisation (et non par alerte) dans `fetcher.ts`
- [ ] T015 Passer le `SearchProfile` explicitement aux parsers — `src/lib/watcher/parsers/{apec,wttj,linkedin,linkedin-xray,indeed,hellowork,jobicy,france-travail,emploi-territorial}.ts` et `parsers/base.ts`
- [ ] T016 `writeFetchLog` par couple (alerte, source) + purge « 50 derniers par (alerte, source) » dans `fetcher.ts`
- [ ] T017 Adapter `src/hooks/useJobWatcher.ts` — appel de `runFetch(alerts, …)`, décroissance du dictionnaire par alerte, `last_fetched_at` par alerte
- [ ] T018 [P] Créer `src/lib/watcher/fetcher.test.ts` — mutualisation des requêtes, seuil de sauvegarde sur le meilleur score, rattachement partiel, disqualification par une alerte, offre préexistante nouvellement matchée, statut lu préservé

**Vérification** : deux alertes ciblant la même requête APEC → une seule requête réseau, deux rattachements.

---

## J3 — Apprentissage par piste et digest

**But** : que chaque piste apprenne pour elle seule, et que le digest se lise piste par piste.

- [ ] T020 Adapter `src/lib/watcher/learning-engine.ts` — `analyzeFeedback(alertId)`, décroissance et réputation entreprise portées par l'alerte
- [ ] T021 `submitFeedback` dans `src/stores/jobWatchStore.ts` — enregistrer `alert_id` ; en vue « Toutes les pistes », attribuer à l'alerte de meilleur score sur l'offre
- [ ] T022 Choix de portée lors de l'ajout d'une entreprise à la blacklist (cette piste / toutes) — `JobOfferCard.tsx` et store
- [ ] T023 Réécrire `buildEmailHtml` dans `src/lib/watcher/email-digest.ts` — sections par piste ordonnées par `position`, offre multi-pistes placée dans la section de meilleur score avec mention « Aussi : … », section vide affichée explicitement
- [ ] T024 [P] Créer `src/lib/watcher/email-digest.test.ts` — ordre des sections, non-répétition d'une offre multi-pistes, section vide présente, aucun envoi si zéro nouvelle offre
- [ ] T025 [P] Adapter `src/lib/watcher/scorer.test.ts` — signaux appris fournis par alerte

**Vérification** : archiver 5 offres depuis la piste A → seul le dictionnaire négatif de A évolue.

---

## J4 — Interface

**But** : rendre le portefeuille lisible et manipulable.

- [ ] T030 Créer `src/components/job-watch/AlertList.tsx` — liste des pistes : nom, type, couleur, sources, dernière collecte, état ; actions éditer / dupliquer / activer / supprimer ; bouton « Nouvelle alerte » désactivé à 4 avec explication
- [ ] T031 Créer `src/components/job-watch/AlertEditor.tsx` — réagencement des sections existantes de `JobWatchConfig` (Ce que je cherche, Localisation, Contrat & Salaire, APEC, Sources actives, Filtre IA) au niveau de l'alerte
- [ ] T032 Restructurer `src/components/job-watch/JobWatchConfig.tsx` — niveau 1 liste, niveau 2 éditeur ; réglages globaux (SMTP, Navitia, France Travail, sessions, hygiène des données) isolés dans une section « Réglages généraux »
- [ ] T033 Afficher l'estimation de charge de collecte dans la Configuration — requêtes par cycle, dont mutualisées, durée estimée
- [ ] T034 [P] Créer `src/components/job-watch/AlertBar.tsx` — chips « Toutes » + une par piste, couleur, compteur de non-lues, état inactif visible
- [ ] T035 Intégrer la barre de pistes dans `src/components/job-watch/JobWatchPage.tsx`
- [ ] T036 Filtre de piste et score contextuel dans `src/components/job-watch/JobOffersView.tsx` — combinaison avec tous les filtres existants, entrée « Non rattachées »
- [ ] T037 [P] Badges de pistes et score contextuel dans `src/components/job-watch/JobOfferCard.tsx`
- [ ] T038 Adapter `src/components/job-watch/SetupWizard.tsx` — crée la première alerte au lieu d'écrire le profil global

**Vérification** : scénarios d'acceptation US1 et US2 passés manuellement.

---

## J5 — Couche IA

**But** : faire de l'IA le stratège du portefeuille.

- [ ] T040 Créer `src/lib/watcher/ai-portfolio.ts` — `buildPortfolioStrategyPrompt` (texte dans prompts.md §1), `validateAlertPortfolio`, `buildPortfolioImportPreview`, `applyPortfolioImport` transactionnel
- [ ] T041 [P] Créer `src/lib/watcher/ai-portfolio.test.ts` — JSON valide ; rejets : version inconnue, 3 > n > 4 alertes, absence ou doublon de `core`, absence d'`exploratory`, `jobTitles` ou `excludeTitles` insuffisants, `kind` invalide, source inconnue ; avertissements : recouvrement de titres, piste sans source, `blindSpots` vide
- [ ] T042 Créer `src/components/job-watch/PortfolioStrategyPanel.tsx` — saisie de l'intention, génération et copie du prompt, collage du JSON, aperçu (créations / remplacements / avertissements / charge estimée), application
- [ ] T043 Contextualiser `buildAIFilterPrompt(intent, context)` dans `src/lib/watcher/ai-filter.ts` — blocs piste concernée, autres pistes, règles supplémentaires (prompts.md §2) ; adapter `ai-filter.test.ts`
- [ ] T044 Rattacher `src/components/job-watch/AIFilterGenerator.tsx` à une alerte
- [ ] T045 Créer `src/lib/watcher/portfolio-metrics.ts` — `computePortfolioMetrics` : volumes, offres exclusives, taux de lecture / import / archivage rapide, score médian, recouvrement par paire (SQL de data-model.md §3)
- [ ] T046 [P] Créer `src/lib/watcher/portfolio-metrics.test.ts` — recouvrement 0 %, 100 %, petite piste incluse dans une grande
- [ ] T047 `buildPortfolioReviewPrompt` et `validatePortfolioReview` dans `ai-portfolio.ts` (prompts.md §3)
- [ ] T048 Créer `src/components/job-watch/PortfolioReviewPanel.tsx` — avertissement de recouvrement affiché **sans IA** au-delà de 60 %, génération du prompt de revue, affichage des recommandations, application individuelle des suggestions structurées
- [ ] T049 Scoper les prompts Santé dans `src/lib/prompt-templates.ts` — `generateDiagnosticPrompt(alert, offers)` et `generatePerformanceOptimizationPrompt(…, alert, …)` avec le rappel de contexte portefeuille (prompts.md §4)
- [ ] T050 Sélecteur d'alerte et mode portefeuille dans `src/components/job-watch/HealthDashboard.tsx`

**Vérification** : un JSON de portefeuille valide crée 3-4 pistes configurées ; un JSON invalide ne modifie rien ; le recouvrement s'affiche sans passer par l'IA.

---

## Points de vigilance

1. **`COALESCE(profile_id, '')`** partout dans la migration : `job_watch_config.profile_id` et `job_offers.profile_id` peuvent valoir `NULL`, `job_watch_alerts.profile_id` vaut `''`. C'est le principal piège du jalon 1.
2. **Le seuil de sauvegarde** s'évalue sur le meilleur score, le **rattachement** piste par piste (FR-014 / FR-015). Confondre les deux casse soit les pistes secondaires, soit la pertinence.
3. **Étape F du pipeline** : sans elle, une piste nouvellement créée paraît vide alors que des offres correspondantes sont déjà en base.
4. **Statut lu/archivé porté par l'offre**, jamais par la liaison — le dupliquer produirait des états incohérents selon la piste consultée.
5. **Règle anti-exclusion croisée** du filtre IA (prompts.md §2) : sans elle, l'IA détruit silencieusement l'ouverture qu'elle vient d'aider à construire.
