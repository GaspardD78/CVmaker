# Tasks: Refonte Veille Emploi — Fiabilité, Pertinence et Transparence

**Input**: Design documents from `specs/002-job-watch-reliability/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: scorer.test.ts requis explicitement (FR-023, SC-009). Inclus en Phase 4.

**Organization**: Tâches groupées par user story. US3 (persistence) est fondationnelle pour US1 (affichage) — son infrastructure est dans les phases Setup + Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Exécutable en parallèle (fichiers différents, pas de dépendances incomplètes)
- **[Story]**: User story concernée (US1–US5)
- Chemins absolus depuis `resume-forge/`

---

## Phase 1: Setup (Infrastructure partagée)

**Purpose**: Créer les fondations techniques — migration SQL, types TypeScript, fallbacks DB

- [x] T001 Créer resume-forge/src-tauri/migrations/013_job_watch_fetch_log.sql — CREATE TABLE + index `idx_fetch_log_source` (schéma complet dans data-model.md)
- [x] T002 Enregistrer migration 013 dans resume-forge/src-tauri/src/lib.rs — ajouter l'entrée `Migration { version: 13, description: "job_watch_fetch_log", ... }` entre la migration 012 et la fin du tableau
- [x] T003 [P] Mettre à jour resume-forge/src/types/job-watch.ts — ajouter interface `FetchLog`, enrichir `FetchResult` avec `totalFetched: number`, `durationMs: number`, `status: 'success' | 'error' | 'empty'`, ajouter `minSaveScore: number` à `JobWatchSettings` et `DEFAULT_JOB_WATCH_SETTINGS` (valeur 20)
- [x] T004 [P] Mettre à jour resume-forge/src/lib/db.ts — ajouter fallback `CREATE TABLE IF NOT EXISTS job_watch_fetch_log (...)` + `CREATE INDEX IF NOT EXISTS idx_fetch_log_source` + `INSERT OR IGNORE INTO job_watch_settings (key, value) VALUES ('min_save_score', '20')` dans la séquence d'initialisation

---

## Phase 2: Foundational (Prérequis bloquants)

**Purpose**: Utilitaires partagés et enrichissement du fetcher — bloquent US1, US3, US4 et US5

**⚠️ CRITIQUE**: Les user stories US1, US4, US5 ne peuvent pas être implémentées avant que cette phase soit complète

- [x] T005 Créer resume-forge/src/lib/watcher/json-ld-utils.ts — implémenter `extractJsonLdJobs(html: string): JsonLdJob[]` (parse `<script type="application/ld+json">` via DOMParser), `parseJobLocation(job: JsonLdJob): string | null`, `parseJobDate(job: JsonLdJob): string | null` (extraire et normaliser datePosted en ISO 8601)
- [x] T006 Mettre à jour resume-forge/src/lib/watcher/fetcher.ts — ajouter mesure `startTime = Date.now()` avant `runParser()` pour chaque source, calculer `durationMs = Date.now() - startTime`, implémenter helper `writeFetchLog(db, entry)` + SQL de purge (LIMIT 50 par source), appeler `writeFetchLog` après chaque source, enrichir les objets `FetchResult` retournés avec `totalFetched`, `durationMs`, `status`

**Checkpoint**: Migration créée + types enrichis + json-ld-utils disponible + fetcher mesure la durée et écrit les logs → les user stories peuvent démarrer

---

## Phase 3: User Story 1 — Transparence par source (Priority: P1) 🎯 MVP

**Goal**: L'utilisateur voit le statut de chaque source (succès/erreur/vide/non configurée) dans le HealthDashboard après chaque collecte, avec historique expandable et warning profil incomplet.

**Independent Test**: Déclencher une collecte avec une source OK et une source en erreur → HealthDashboard affiche deux lignes avec badges colorés corrects, compteurs et timestamp.

- [x] T007 [US1] Ajouter `loadFetchLogs(): Promise<void>` et `fetchLogs: FetchLog[]` state dans resume-forge/src/stores/jobWatchStore.ts — requête SQLite `SELECT * FROM job_watch_fetch_log ORDER BY fetched_at DESC LIMIT 60`, mapper camelCase via keysToCamelCase
- [x] T008 [US1] Ajouter `purgeOffers(minScore: number): Promise<number>` dans resume-forge/src/stores/jobWatchStore.ts — `DELETE FROM job_offers WHERE score < ?1 AND is_archived = 0`, retourner le count de lignes supprimées, recharger les offres
- [x] T009 [US1] Construire la section "Dernières collectes" dans resume-forge/src/components/job-watch/HealthDashboard.tsx — tableau avec 1 ligne par source (`JobSource[]`), colonne Statut (badge : success=vert, error=rouge, empty=orange, jamais collectée=gris), colonnes Récupérées / Nouvelles / Timestamp, appeler `loadFetchLogs()` au montage du composant
- [x] T010 [US1] Ajouter expand "Voir l'historique" dans resume-forge/src/components/job-watch/HealthDashboard.tsx — état local `expandedSource: JobSource | null`, afficher les 10 derniers logs de la source sélectionnée dans un panneau inline (filtrer depuis `fetchLogs` déjà chargés)
- [x] T011 [US1] Ajouter bannière d'avertissement jobTitles dans resume-forge/src/components/job-watch/HealthDashboard.tsx — condition `settings.searchProfile.jobTitles.length === 0`, texte "Aucun titre de poste cible configuré — tous les scores seront permissifs (base 50)."
- [x] T012 [US1] Ajouter info-bulle scoring dans resume-forge/src/components/job-watch/HealthDashboard.tsx — texte "Le scoring a été mis à jour. Les offres précédentes conservent leur score d'origine.", dismissable via bouton ×, état `scoringInfoDismissed` initialisé depuis `localStorage.getItem('scoring_info_dismissed') === '1'`, persisté au dismiss

**Checkpoint**: US1 complète et testable — le HealthDashboard affiche les logs de collecte persistants

---

## Phase 4: User Story 2 — Scoring affiné par champ (Priority: P2)

**Goal**: Les scores reflètent mieux la pertinence — base 0 si jobTitles configurés, cap 25 en balanced sans match, veto absolu sur termes exclus.

**Independent Test**: `computeScore(offer avec jobTitle exact, high conf) ≥ 40` ; `computeScore(offer sans match, balanced) ≤ 25` ; `computeScore(offer avec terme exclu) === 0` ; `computeScore(offer, profil sans jobTitles) ≥ 50`.

- [x] T013 [US2] Refactorer resume-forge/src/lib/watcher/scorer.ts vers v3 — (1) `base = jobTitles.length > 0 ? 0 : 50`, (2) title high → +40, medium/low → +30, description → +15, (3) mode balanced + no title match + jobTitles non vide → remplacer la pénalité `-15` par un cap `Math.min(total, 25)` sur le score assemblé, (4) supprimer le cap strict explicite à 30, (5) skills titre +6 max +24, skills snippet +3 max +12, (6) contract bad balanced → -15 (au lieu de -20), (7) mettre à jour le commentaire d'en-tête et les valeurs dans `ScoreBreakdown` (titleMatchScore: 0|15|30|40, skillsScore: 0..24)
- [x] T014 [P] [US2] Créer resume-forge/src/lib/watcher/scorer.test.ts — 4 cas obligatoires avec fonctions helper `makeProfile()` et `makeOffer()` : (1) terme exclu dans titre → score === 0, (2) balanced + pas de jobTitle match → score ≤ 25, (3) jobTitle exact dans titre, confidence high → titleMatchScore ≥ 40, (4) jobTitles vide → score ≥ 50 ; runner : `bun test`

**Checkpoint**: Tous les tests scorer.test.ts passent, scorer.ts v3 en production

---

## Phase 5: User Story 3 — Statuts de collecte persistants (Priority: P2)

**Goal**: Les logs de collecte survivent au redémarrage de l'application. La table est créée automatiquement même sur les DBs sans migration 013.

**Independent Test**: Déclencher une collecte → quitter et relancer l'application → HealthDashboard affiche toujours le statut avec le bon timestamp.

*Note: L'infrastructure DB (T001-T004) et les écritures fetcher (T006) couvrent les FR-001, FR-005, FR-006, FR-007. Cette phase ajoute le refactoring wttj.ts (prérequis US4) et valide le chemin complet.*

- [x] T015 [US3] Refactorer resume-forge/src/lib/watcher/parsers/wttj.ts — remplacer les fonctions inline `extractCity()` et le parsing JSON-LD par des imports depuis `json-ld-utils.ts` (`extractJsonLdJobs`, `parseJobLocation`, `parseJobDate`), aucun changement comportemental, les types `WttjJsonLdJob` deviennent `JsonLdJob` importé

**Checkpoint**: wttj.ts utilise json-ld-utils.ts → json-ld-utils.ts est validé en production → US4 (LinkedIn) peut démarrer

---

## Phase 6: User Story 4 — Alternative LinkedIn sans RSS (Priority: P3)

**Goal**: LinkedIn scraping natif (tauriFetch + JSON-LD) quand rssUrl est absent, avec message d'erreur explicite si bloqué.

**Independent Test**: Configurer LinkedIn sans rssUrl → déclencher une collecte → soit des offres apparaissent, soit le message "Scraping LinkedIn échoué — essayez rss.app comme alternative." s'affiche dans le statut de la source.

- [x] T016 [US4] Mettre à jour la signature de `parseLinkedinRss` dans resume-forge/src/lib/watcher/parsers/linkedin-rss.ts — accepter un second paramètre optionnel `settings?: JobWatchSettings` (nécessaire pour construire l'URL LinkedIn depuis `searchProfile.jobTitles` et `searchProfile.location`)
- [x] T017 [US4] Mettre à jour resume-forge/src/lib/watcher/fetcher.ts — passer `settings` comme second argument à `parseLinkedinRss(config, settings)` dans `runParser()`
- [x] T018 [US4] Implémenter le scraping conditionnel dans resume-forge/src/lib/watcher/parsers/linkedin-rss.ts — si `config.rssUrl` → comportement RSS existant inchangé ; si `!config.rssUrl` → construire l'URL `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=<query>&location=France&start=0`, tauriFetch avec `BROWSER_USER_AGENT`, DOMParser + `extractJsonLdJobs` (json-ld-utils.ts), fallback sélecteurs CSS `[data-job-id]` si JSON-LD vide, en cas d'échec (statut ≠ 2xx ou 0 offres extraites) : retourner `[]` et ajouter `LINKEDIN_SCRAPING_ERROR_MESSAGE` aux erreurs du FetchResult

**Checkpoint**: LinkedIn scraping fonctionne ou échoue explicitement — jamais silencieux

---

## Phase 7: User Story 5 — Filtre pertinence minimale (Priority: P3)

**Goal**: Les offres sous le seuil `min_save_score` ne sont pas insérées en DB. L'utilisateur peut configurer le seuil et purger les offres existantes sous le seuil.

**Independent Test**: Configurer `min_save_score` = 40 → déclencher une collecte → toutes les offres en DB ont score ≥ 40.

- [x] T019 [US5] Ajouter le filtre `min_save_score` dans resume-forge/src/lib/watcher/fetcher.ts — dans la Phase 3 d'insertion (boucle `allProcessed`), ajouter `if (score < settings.minSaveScore) continue;` avant l'INSERT ; le champ `offersFetched` du FetchLog doit compter les offres **avant** ce filtre (totalFetched), `offersNew` compte les INSERT réussis
- [x] T020 [US5] Ajouter le slider `minSaveScore` dans resume-forge/src/components/job-watch/JobWatchConfigView.tsx — section "Options avancées" (créer la section si absente), Slider shadcn/ui min=0 max=60 step=1 valeur=`settings.minSaveScore`, label "Score minimum de sauvegarde", description "Les offres sous ce seuil ne seront pas enregistrées lors de la collecte", onValueCommit → `store.saveSettings({ ...settings, minSaveScore: value })`
- [x] T021 [US5] Ajouter le bouton "Purger les offres non pertinentes" dans resume-forge/src/components/job-watch/JobOffersView.tsx — dans la toolbar, Dialog de confirmation shadcn/ui affichant "Supprimer les offres avec score < {minSaveScore} pts ?", confirmation → `store.purgeOffers(settings.minSaveScore)`, toast résultat "{n} offres supprimées"

**Checkpoint**: Filtre actif en collecte + slider configurable + purge manuelle disponible

---

## Phase 8: Polish & Validation transversale

**Purpose**: Tests, vérification de types, validation des scénarios d'intégration

- [x] T022 Lancer `bun test` dans resume-forge/ — vérifier que les 4 cas de scorer.test.ts passent ; corriger toute régression dans scorer.ts
- [x] T023 [P] Lancer `tsc --noEmit` dans resume-forge/ — corriger toutes les erreurs TypeScript introduites par les nouveaux types (FetchLog, FetchResult enrichi, minSaveScore)
- [ ] T024 [P] Valider quickstart.md scénarios 1-3 en build dev — collecte avec log, source en erreur, min_save_score filtrage ; vérifier les assertions des scénarios

---

## Dépendances & Ordre d'exécution

### Dépendances entre phases

- **Setup (Phase 1)** : aucune dépendance — démarrer immédiatement
- **Foundational (Phase 2)** : dépend de Phase 1 (types disponibles) — bloque US1, US3, US4, US5
- **US1 (Phase 3)** : dépend de Phase 2 (T006 écrit les logs, T007 loadFetchLogs)
- **US2 (Phase 4)** : dépend de Phase 1 uniquement — **peut démarrer en parallèle de Phase 2**
- **US3 (Phase 5)** : dépend de Phase 2 (T005 json-ld-utils disponible)
- **US4 (Phase 6)** : dépend de Phase 5 (T015 wttj.ts refactoré valide json-ld-utils.ts)
- **US5 (Phase 7)** : dépend de Phase 2 (T006 fetcher enrichi) + Phase 1 (T003 minSaveScore type)
- **Polish (Phase 8)** : dépend de toutes les phases précédentes

### Dépendances entre user stories

- **US1 (P1)** : dépend de Phase 2 — nécessite logs écrits par fetcher
- **US2 (P2)** : indépendante — peut démarrer dès Phase 1 complète
- **US3 (P2)** : infrastructure dans Phase 1+2, T015 dans Phase 5 est prérequis pour US4
- **US4 (P3)** : dépend de US3 (T015 wttj.ts refactoré)
- **US5 (P3)** : dépend de Phase 2 (fetcher enrichi) — peut démarrer en parallèle de US1

### Au sein de chaque user story

- Modèles/types avant services
- Services avant UI
- Tests scorer (T014) : écrire avant ou immédiatement après T013 (scorer v3)

### Opportunités de parallélisation

- T003 ∥ T004 (Phase 1 — fichiers différents)
- T005 ∥ T013/T014 (json-ld-utils + scorer sont totalement indépendants)
- T007 ∥ T008 (une fois T006 terminé — store et composant indépendants)
- T009 ∥ T010 ∥ T011 ∥ T012 (toutes dans HealthDashboard.tsx mais sections séparées — séquentiel recommandé pour éviter les conflits)
- T013 ∥ T014 (scorer.ts et scorer.test.ts — peuvent s'écrire en parallèle)
- T016 ∥ T017 (signatures différentes, même résultat attendu)
- T022 ∥ T023 ∥ T024 (Phase 8 — tous indépendants)

---

## Exemple de parallélisation : Phase 4 (US2)

```bash
# T013 et T014 peuvent s'écrire en parallèle :
Task: "Refactorer scorer.ts v3 dans resume-forge/src/lib/watcher/scorer.ts"
Task: "Créer scorer.test.ts avec 4 cas dans resume-forge/src/lib/watcher/scorer.test.ts"

# Validation après les deux :
bun test resume-forge/src/lib/watcher/scorer.test.ts
```

---

## Stratégie d'implémentation

### MVP — User Story 1 uniquement

1. Compléter Phase 1 (Setup)
2. Compléter Phase 2 (Foundational)
3. Compléter Phase 3 (US1 — HealthDashboard)
4. **STOP et VALIDER** : le tableau "Dernières collectes" fonctionne en build dev
5. Passer à US2 ou livrer en l'état

### Livraison incrémentale

1. Phase 1 + Phase 2 → fondation prête
2. + Phase 3 (US1) → transparence du dashboard ✓ *(démo possible)*
3. + Phase 4 (US2) → scoring plus pertinent ✓
4. + Phase 5 (US3) → persistence validée ✓
5. + Phase 6 (US4) → LinkedIn sans RSS ✓
6. + Phase 7 (US5) → filtre + purge ✓
7. + Phase 8 → validation complète ✓

### Ordre optimal pour un développeur seul

Recommandation : T001 → T002 → T003 → T004 → T005 → T013 → T014 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024

*(scorer.ts + tests en amont car indépendant et rapide à valider ; fetcher en dernier car intègre tout)*

---

## Notes

- `[P]` = fichiers différents, pas de dépendances incomplètes
- `[USn]` = user story correspondante pour traçabilité
- Valider `bun test` après T013+T014 avant de continuer
- Respecter le pattern fallback `db.ts` — tous les `ALTER TABLE` et `CREATE TABLE` doivent avoir un `.catch(() => {})`
- Committer après chaque phase ou groupe logique
- La signature `computeScoreWithBreakdown(offer, profile, learned)` ne doit pas changer (aucun appelant à modifier)
- Offres existantes en DB : jamais re-scorées — séparation temporelle assumée
