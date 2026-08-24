# Plan technique — Portefeuille multi-alertes

## 1. Contexte technique

| Élément | Valeur |
|---|---|
| Frontend | TypeScript strict ≥ 5.x, React 19, Zustand 5, Tailwind 4, shadcn/ui |
| Backend | Rust edition 2021, Tauri 2, `tauri-plugin-sql` (SQLite via sqlx) |
| Tests | Bun (`bun test`), `bunx tsc --noEmit`, `cargo clippy -- -D warnings` |
| Migration | `019_job_watch_alerts.sql` + repli TypeScript dans `src/lib/db.ts` |
| Nouvelle dépendance | **aucune** |

---

## 2. Le cœur du sujet : le pipeline de collecte

C'est la partie la plus délicate. Aujourd'hui `runFetch(configs, settings, …)` boucle
sur les sources et applique le profil unique. Demain, la même collecte doit servir
jusqu'à 4 profils sans quadrupler les requêtes réseau.

### Nouvelle signature

```ts
export async function runFetch(
  alerts:     JobWatchAlert[],      // remplace `configs`
  settings:   JobWatchSettings,     // ne porte plus searchProfile
  onProgress?: (p: FetchProgress) => void,
  profileId?: string | null,
): Promise<FetchResult[]>
```

`FetchResult` gagne `alertId: string`. `FetchProgress` gagne `alertName: string`.

### Algorithme

**Étape A — Construction du plan de collecte.**
Pour chaque alerte active × chacune de ses sources actives, on produit une tâche
`{ alertId, source, queryKey }`. La `queryKey` est une empreinte stable des paramètres
de requête réellement envoyés à la source, dérivés du `SearchProfile` de l'alerte :

```ts
function computeQueryKey(source: JobSource, profile: SearchProfile): string
```

Elle ne retient que ce qui influence la requête réseau — mots-clés, ville / code INSEE /
départements, rayon, types de contrat, filtres APEC — après normalisation (minuscules,
trim, tri alphabétique des tableaux). Elle ignore délibérément tout ce qui ne sert qu'au
scoring local (compétences, domaines, exclusions, salaire, blacklist, mode de scoring) :
deux pistes qui interrogent la même chose mais notent différemment doivent partager
la requête.

**Étape B — Regroupement.**
Les tâches sont regroupées par `(source, queryKey)`. Chaque groupe = **une** requête
réseau, dont le résultat brut est partagé par toutes les alertes du groupe.

**Étape C — Exécution séquencée.**
Les groupes sont exécutés séquentiellement. Avant chaque requête visant une source déjà
sollicitée dans le cycle, on attend le throttle de cette source :

```ts
const SOURCE_THROTTLE_MS: Record<JobSource, number> = {
  linkedin: 4000, indeed: 4000, hellowork: 4000,   // scraping WebView — les plus exposées
  wttj: 2000, apec: 1000, emploi_territorial: 1000,
  france_travail: 500, jobicy: 500,                 // APIs officielles
  linkedin_rss: 500, mantiks: 500,
};
```

**Étape D — Scoring par alerte.**
Pour chaque offre brute du groupe et chaque alerte du groupe :

1. filtre géographique avec la zone de **cette** alerte (`resolveProfileGeo` est déjà
   appelé une fois par run aujourd'hui ; il devient une résolution mise en cache par
   `queryKey` de localisation, pas par alerte — plusieurs alertes partagent souvent la
   même ville) ;
2. `computeScore(raw, alert.searchProfile, signalsOf(alert))` où `signalsOf` assemble
   `{ learnedDict, companyReputation, aiFilterRule }` **de l'alerte**.

**Étape E — Agrégation par hash.**
Toutes les évaluations d'une même offre (même `hash`) sont regroupées :

```
bestScore     = max(scores)
matchedAlerts = alertes dont le score ≥ minSaveScore ET non disqualifiées
```

- Si `matchedAlerts` est vide → l'offre est **écartée**, comptée dans `offersFiltered`.
- Sinon → l'offre est sauvegardée avec `score = bestScore`, et une ligne
  `job_offer_alerts` est écrite par alerte retenue.

Ce point mérite d'être explicite : **le seuil décide de la sauvegarde sur le meilleur
score, et du rattachement piste par piste**. Sans cette distinction, soit on perd les
bonnes offres d'une piste secondaire, soit on rattache tout à tout.

**Étape F — Offres déjà connues.**
Le pré-filtrage actuel par `existingHashes` écarte les offres déjà en base. Il doit
désormais distinguer deux cas :

| Cas | Action |
|---|---|
| Hash connu **et** déjà lié à toutes les alertes qui la matchent | doublon, ignoré (comportement actuel) |
| Hash connu **mais** une alerte la matche sans être liée | **liaison créée**, `job_offers.score` relevé si le nouveau score est meilleur, statut lu/archivé **inchangé** |

C'est indispensable : sans cela, créer une nouvelle piste ne remonterait jamais les
offres déjà présentes en base, et la piste paraîtrait vide pendant des jours.

**Étape G — Journalisation.**
`writeFetchLog` est appelé par couple (alerte, source), avec `alert_id`. La purge passe
à « 50 derniers par (alerte, source) ».

### Charge de collecte

Estimation affichée dans la Configuration :

```
requêtes = nombre de groupes (source, queryKey) distincts
mutualisées = (nombre de tâches) − (nombre de groupes)
durée estimée ≈ Σ throttle des groupes par source
```

---

## 3. Fichiers impactés

### Créés

| Fichier | Rôle |
|---|---|
| `src-tauri/migrations/019_job_watch_alerts.sql` | Migration |
| `src/lib/watcher/alerts.ts` | CRUD des alertes, invariants (cap 4, positions), duplication, mapping SQL ↔ `JobWatchAlert` |
| `src/lib/watcher/alerts.test.ts` | Tests des invariants |
| `src/lib/watcher/query-key.ts` | `computeQueryKey`, normalisation des paramètres de requête |
| `src/lib/watcher/query-key.test.ts` | Tests de mutualisation |
| `src/lib/watcher/portfolio-metrics.ts` | Recouvrement, volumes, taux de lecture / import / archivage par piste |
| `src/lib/watcher/portfolio-metrics.test.ts` | Tests des métriques |
| `src/lib/watcher/ai-portfolio.ts` | Prompt stratège, prompt de revue, validation des JSON importés |
| `src/lib/watcher/ai-portfolio.test.ts` | Tests de validation |
| `src/lib/watcher/fetcher.test.ts` | Tests du pipeline multi-alertes |
| `src/components/job-watch/AlertList.tsx` | Liste et gestion des pistes |
| `src/components/job-watch/AlertEditor.tsx` | Éditeur d'une piste (sections existantes réagencées) |
| `src/components/job-watch/AlertBar.tsx` | Barre de pistes de la vue Offres |
| `src/components/job-watch/PortfolioStrategyPanel.tsx` | Prompt stratège + aperçu d'import |
| `src/components/job-watch/PortfolioReviewPanel.tsx` | Recouvrement, angles morts, recommandations |

### Modifiés

| Fichier | Nature du changement |
|---|---|
| `src/types/job-watch.ts` | `JobWatchAlert`, `AlertKind`, `OfferAlertLink`, `JobOfferWithAlerts`, `MAX_ALERTS`, `filters.alertId` ; retrait de `searchProfile` de `JobWatchSettings` |
| `src/lib/db.ts` | Repli des `CREATE TABLE` / `ALTER TABLE` de la migration 019, rattrapage FR-054, index unique `(alert_id, source)` |
| `src/stores/jobWatchStore.ts` | État `alerts` + `activeAlertId`, actions CRUD, chargement des offres avec leurs liaisons, `submitFeedback` porteur d'`alertId`, retrait de la gestion globale de `searchProfile` / `aiFilterRule` / dictionnaires |
| `src/lib/watcher/fetcher.ts` | Réécriture du pipeline (§2) |
| `src/hooks/useJobWatcher.ts` | Décroissance du dictionnaire par alerte, appel de `runFetch` avec les alertes, mise à jour de `last_fetched_at` par alerte |
| `src/lib/watcher/learning-engine.ts` | `analyzeFeedback(alertId)`, décroissance et réputation par alerte |
| `src/lib/watcher/email-digest.ts` | `buildEmailHtml(sections, date)` — sections par piste, dédoublonnage inter-sections |
| `src/lib/watcher/ai-filter.ts` | `buildAIFilterPrompt(intent, context)` contextualisé par l'alerte et le portefeuille |
| `src/lib/prompt-templates.ts` | `generateDiagnosticPrompt` et `generatePerformanceOptimizationPrompt` prennent une alerte |
| `src/components/job-watch/JobWatchPage.tsx` | Intégration de la barre de pistes |
| `src/components/job-watch/JobWatchConfig.tsx` | Passage à liste + éditeur, séparation des réglages globaux |
| `src/components/job-watch/JobOffersView.tsx` | Filtre de piste, score contextuel |
| `src/components/job-watch/JobOfferCard.tsx` | Badges de pistes, score contextuel |
| `src/components/job-watch/AIFilterGenerator.tsx` | Rattachement à une alerte |
| `src/components/job-watch/HealthDashboard.tsx` | Vues par alerte et portefeuille |
| `src/components/job-watch/SetupWizard.tsx` | Crée la première alerte au lieu d'écrire le profil global |
| `src/components/job-watch/CvGeneratorDrawer.tsx` | Lit le `SearchProfile` de la piste de l'offre |
| `src/lib/watcher/parsers/*.ts` | Signature `(config, profile, profileId)` : le `SearchProfile` est passé explicitement au lieu d'être lu dans `settings.searchProfile` |
| `src-tauri/src/lib.rs` | Enregistrement de la migration 19 |

Le changement de signature des parsers est mécanique mais touche 8 fichiers : c'est la
conséquence directe du retrait de `searchProfile` de `JobWatchSettings`, et le
compilateur les désigne tous.

---

## 4. Jalons

Chaque jalon est un commit autonome qui laisse l'application compilable, testée et
fonctionnelle.

### J1 — Modèle et migration
Migration 019, repli `db.ts`, enregistrement Rust, types, `alerts.ts` + tests, store
étendu (lecture des alertes, sélection de l'alerte active).
*Résultat attendu* : aucun changement visible pour l'utilisateur ; l'app fonctionne
exactement comme avant, sur une alerte unique issue de la migration.
*Vérification* : sur une base existante, les offres, scores et réglages sont intacts ;
`job_watch_alerts` contient une ligne par profil ; `job_offer_alerts` contient une
ligne par offre.

### J2 — Pipeline de collecte multi-alertes
`query-key.ts`, réécriture de `fetcher.ts`, `useJobWatcher`, parsers, log par alerte.
*Résultat attendu* : une collecte sur 2 alertes mutualise ce qui peut l'être et
rattache correctement les offres.
*Vérification* : `fetcher.test.ts` couvre mutualisation, seuil, disqualification,
rattachement d'une offre préexistante.

### J3 — Apprentissage par piste et digest
`learning-engine.ts` par alerte, `submitFeedback` porteur d'`alertId`, choix de portée
de la blacklist, digest sectionné.
*Vérification* : un feedback sur la piste A ne modifie que le dictionnaire de A ; le
digest ne répète jamais une offre.

### J4 — Interface
`AlertList`, `AlertEditor`, `AlertBar`, badges, filtre de piste, score contextuel,
séparation des réglages globaux, estimation de charge, `SetupWizard`.
*Vérification* : les scénarios d'acceptation US1 et US2 passent manuellement.

### J5 — Couche IA
`ai-portfolio.ts` (prompt stratège, validation, import transactionnel avec aperçu),
`PortfolioStrategyPanel`, filtre IA contextualisé, `portfolio-metrics.ts`,
`PortfolioReviewPanel`, prompts Santé scopés.
*Vérification* : un JSON de portefeuille valide crée 3-4 pistes ; un JSON invalide ne
modifie rien ; le recouvrement s'affiche sans IA.

---

## 5. Stratégie de test

**Tests unitaires ajoutés**

| Fichier | Couverture |
|---|---|
| `alerts.test.ts` | cap à 4, refus de supprimer la dernière alerte, positions contiguës, duplication sans apprentissage |
| `query-key.test.ts` | profils identiques → même clé ; ville différente → clés différentes ; compétences différentes → **même** clé (le scoring ne change pas la requête) ; ordre des tableaux indifférent |
| `fetcher.test.ts` | mutualisation, seuil sur le meilleur score, rattachement partiel, disqualification, offre préexistante nouvellement matchée, statut lu préservé |
| `portfolio-metrics.test.ts` | recouvrement 0 %, 100 %, inclusion d'une petite piste dans une grande |
| `ai-portfolio.test.ts` | JSON valide, version inconnue, 0 alerte, 5 alertes, `kind` invalide, `jobTitles` vide, source inconnue |
| `email-digest.test.ts` | sections ordonnées, offre multi-pistes non répétée, section vide affichée |

**Tests existants à faire évoluer** : `scorer.test.ts` (signaux appris fournis par
alerte), `ai-filter.test.ts` (prompt contextualisé).

**Non-régression obligatoire avant chaque commit** :

```
bunx tsc --noEmit
bun test
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

**Vérification manuelle de migration** : ouvrir l'app sur une base contenant des offres
et une configuration existantes, confirmer que rien n'a bougé, puis créer une deuxième
alerte et déclencher une collecte.
