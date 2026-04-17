# Implementation Plan: Refonte Veille Emploi — Fiabilité, Pertinence et Transparence

**Branch**: `002-job-watch-reliability` | **Date**: 2026-04-15 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/002-job-watch-reliability/spec.md`

---

## Summary

Refonte de la veille emploi en 5 axes : (1) journalisation persistante des collectes par source dans `job_watch_fetch_log`, (2) mise à jour du scoring field-aware v3 (base dynamique, nouveaux poids, cap balanced), (3) scraping LinkedIn natif via tauriFetch + JSON-LD sans RSS, (4) score minimum de sauvegarde configurable via `min_save_score`, et (5) affichage des logs dans le HealthDashboard avec warning profil incomplet. Approche conservative : pas de nouvelle dépendance, tout s'appuie sur les patterns existants (`tauriFetch`, `CREATE TABLE IF NOT EXISTS`, `job_watch_settings`, `computeScoreWithBreakdown`).

---

## Technical Context

**Language/Version**: TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend)  
**Primary Dependencies**: React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner)  
**Storage**: SQLite via tauri-plugin-sql — migrations versionnées via sqlx dans lib.rs + fallbacks ALTER TABLE dans db.ts  
**Testing**: Bun test runner (`bun test`) — fichier `scorer.test.ts` à créer  
**Target Platform**: Desktop (Windows/macOS/Linux) via Tauri 2  
**Project Type**: Desktop app — module veille emploi (sous-système de resume-forge)  
**Performance Goals**: Collecte complète (6 sources) < 30 s ; affichage HealthDashboard < 100 ms  
**Constraints**: Offline-first SQLite ; pas de nouvelle dépendance npm/cargo ; rétrocompatibilité totale des DBs existantes  
**Scale/Scope**: ~6 sources, ~200 offres/collecte, ~50 logs par source retenus

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe                  | Statut | Justification                                                                 |
|---------------------------|--------|-------------------------------------------------------------------------------|
| Pas de régression         | ✅ PASS | LinkedIn RSS conservé si `rssUrl` défini ; signature scorer inchangée ; scores existants non recalculés |
| Offline-first             | ✅ PASS | Toutes les nouvelles données sont SQLite local ; pas de service externe requis |
| Pas de nouvelle dépendance| ✅ PASS | tauriFetch déjà utilisé ; DOMParser natif ; Bun déjà configuré               |
| Migrations résilientes    | ✅ PASS | Pattern `CREATE TABLE IF NOT EXISTS` + fallback db.ts pour toute migration fragile |
| Sécurité SQL              | ✅ PASS | Requêtes paramétrées uniquement ; purge avec `id NOT IN (SELECT ...)` safe    |
| UX non bloquante          | ✅ PASS | Erreur de scraping → log error + [] retourné, pas de throw ; autres sources poursuivent |

**Post-Phase 1 re-check** : identique — aucun design Phase 1 ne viole les principes.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-job-watch-reliability/
├── plan.md           ← ce fichier
├── research.md       ← Phase 0 (décisions techniques)
├── data-model.md     ← Phase 1 (entités, migrations, types)
├── quickstart.md     ← Phase 1 (scénarios d'intégration)
├── contracts/
│   ├── scorer-v3.ts        ← contrat scorer v3
│   ├── fetch-log.ts        ← contrat FetchLog + FetchResult enrichi
│   └── linkedin-scraper.ts ← contrat parseLinkedinRss + json-ld-utils
└── tasks.md          ← Phase 2 (/speckit.tasks — non créé par /speckit.plan)
```

### Source Code (repository root)

```text
resume-forge/
├── src/
│   ├── lib/
│   │   └── watcher/
│   │       ├── scorer.ts                    ← MODIFIER : v2 → v3 (nouveaux poids)
│   │       ├── scorer.test.ts               ← CRÉER : 4 cas de test obligatoires
│   │       ├── fetcher.ts                   ← MODIFIER : timing, FetchLog insert, min_save_score filter
│   │       ├── json-ld-utils.ts             ← CRÉER : extractJsonLdJobs, parseJobLocation, parseJobDate
│   │       └── parsers/
│   │           ├── wttj.ts                  ← MODIFIER : utiliser json-ld-utils.ts (refactor inline)
│   │           └── linkedin-rss.ts          ← MODIFIER : scraping si rssUrl absent
│   ├── stores/
│   │   └── jobWatchStore.ts                 ← MODIFIER : loadFetchLogs(), purgeOffers()
│   ├── types/
│   │   └── job-watch.ts                     ← MODIFIER : FetchLog, FetchResult enrichi, JobWatchSettings.minSaveScore
│   ├── lib/
│   │   └── db.ts                            ← MODIFIER : CREATE TABLE fetch_log + fallback, min_save_score default
│   └── components/
│       └── job-watch/
│           ├── HealthDashboard.tsx           ← MODIFIER : table collectes, warning jobTitles, info-bulle
│           ├── JobWatchConfigView.tsx        ← MODIFIER : slider min_save_score (section "Options avancées")
│           └── JobOffersView.tsx             ← MODIFIER : bouton "Purger les offres non pertinentes"
└── src-tauri/
    └── migrations/
        └── 013_job_watch_fetch_log.sql      ← CRÉER : CREATE TABLE + index
```

---

## Phase 0 — Research

Voir [research.md](./research.md) — complété.

Décisions clés :
1. **Scoring v3** : base dynamique (0 si jobTitles, 50 sinon), nouveaux poids (+40/+30/+15), cap balanced à 25
2. **fetch_log** : `CREATE TABLE IF NOT EXISTS` dans migration 013 + fallback db.ts
3. **min_save_score** : clé dans `job_watch_settings`, valeur par défaut `'20'`
4. **LinkedIn** : tauriFetch + DOMParser + JSON-LD, fallback CSS `[data-job-id]`
5. **json-ld-utils** : nouveau fichier mutualisé entre wttj.ts et linkedin-rss.ts
6. **Tests** : Bun test runner, 4 cas obligatoires dans scorer.test.ts

---

## Phase 1 — Design & Contracts

Voir [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) — complétés.

---

## Implementation Notes

### Ordre d'implémentation recommandé

1. **Migration + db.ts** — fondation (table fetch_log + clé min_save_score)
2. **job-watch.ts types** — FetchLog, FetchResult enrichi, minSaveScore
3. **json-ld-utils.ts** — extraction partagée (débloque wttj.ts et linkedin-rss.ts)
4. **scorer.ts v3** — nouveaux poids (isolé, testable seul)
5. **scorer.test.ts** — 4 cas de test obligatoires (TDD : écrire avant ou immédiatement après)
6. **fetcher.ts** — timing + FetchLog insert + min_save_score filter
7. **linkedin-rss.ts** — scraping conditionnel (utilise json-ld-utils.ts)
8. **wttj.ts** — refactor pour utiliser json-ld-utils.ts (comportement inchangé)
9. **jobWatchStore.ts** — loadFetchLogs() + purgeOffers()
10. **HealthDashboard.tsx** — table collectes + warning + info-bulle
11. **JobWatchConfigView.tsx** — slider min_save_score
12. **JobOffersView.tsx** — bouton "Purger"

### Règles de non-régression

- **LinkedIn RSS** : `if (config.rssUrl) { /* comportement existant */ } else { /* nouveau scraping */ }`
- **Scorer** : signature `computeScoreWithBreakdown(offer, profile, learned)` inchangée
- **Scores en DB** : pas de recalcul — séparation temporelle assumée (scores existants valides jusqu'à leur expiration naturelle)
- **Tous les hard disqualifiers** (blacklist, excludeTitles/Domains, strict contract) : comportement inchangé

### Filtre min_save_score dans fetcher.ts

```typescript
// Dans la boucle d'insertion (Phase 3 de runFetch) :
if (score < settings.minSaveScore) continue; // Ne pas sauvegarder
```

Doit être appliqué APRÈS le calcul du score, AVANT l'INSERT, mais le compte `offersFetched` doit inclure toutes les offres parsées (avant filtrage).

### FetchLog — calcul du statut

```typescript
function computeStatus(errors: string[], offersFetched: number): 'success' | 'error' | 'empty' {
  if (errors.length > 0) return 'error';
  if (offersFetched === 0) return 'empty';
  return 'success';
}
```

### Purge automatique fetch_log

Après chaque INSERT dans `job_watch_fetch_log` :
```sql
DELETE FROM job_watch_fetch_log
WHERE source = ?1
AND id NOT IN (
  SELECT id FROM job_watch_fetch_log
  WHERE source = ?1
  ORDER BY fetched_at DESC
  LIMIT 50
)
```

### HealthDashboard — state local pour historique

```typescript
// État local (pas dans le store — éphémère)
const [expandedSource, setExpandedSource] = useState<JobSource | null>(null);

// Pour chaque source : afficher 1 ligne (dernière collecte)
// Au clic "Voir l'historique" : expand inline les 10 derniers logs de cette source
```

### Info-bulle scoring — persistance localStorage

```typescript
const [scoringInfoDismissed, setScoringInfoDismissed] = useState(
  () => localStorage.getItem('scoring_info_dismissed') === '1'
);
```

---

## Complexity Tracking

| Tâche                         | Complexité | Risque       | Notes                                     |
|-------------------------------|-----------|--------------|-------------------------------------------|
| Migration 013 + db.ts         | Faible    | Faible       | Pattern établi dans le projet             |
| Types job-watch.ts            | Faible    | Faible       | Ajouts additifs uniquement                |
| json-ld-utils.ts              | Moyenne   | Faible       | Extraction de code inline de wttj.ts      |
| scorer.ts v3                  | Moyenne   | Moyen        | Changement de valeurs + logique cap balanced |
| scorer.test.ts                | Faible    | Faible       | 4 cas précis définis dans quickstart.md   |
| fetcher.ts enrichi            | Moyenne   | Faible       | Timing + log insert + filter              |
| linkedin-rss.ts scraping      | Haute     | Élevé        | Anti-bot 999 possible, parsing incertain  |
| wttj.ts refactor              | Faible    | Faible       | Comportement identique, juste factorisation |
| jobWatchStore enrichi         | Faible    | Faible       | Deux nouvelles méthodes simples           |
| HealthDashboard table + UI    | Moyenne   | Faible       | Logique expand inline = état local simple |
| JobWatchConfigView slider     | Faible    | Faible       | Composant shadcn/ui Slider existant       |
| JobOffersView bouton purge    | Faible    | Faible       | Dialog confirm + store.purgeOffers()      |

**Risque principal** : scraping LinkedIn (statut 999 anti-bot). Mitigé par gestion d'erreur explicite → log 'error' + [] retourné.
