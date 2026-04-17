# Data Model: Refonte Veille Emploi — Fiabilité, Pertinence et Transparence

**Feature**: `002-job-watch-reliability` | **Date**: 2026-04-15

---

## Entities

### 1. `job_watch_fetch_log` (nouvelle table)

Logs de collecte par source — 1 ligne par exécution de `runFetch` par source.

| Colonne         | Type     | Contraintes                                      | Description                               |
|-----------------|----------|--------------------------------------------------|-------------------------------------------|
| `id`            | TEXT PK  | `DEFAULT (lower(hex(randomblob(16))))`           | UUID aléatoire                            |
| `source`        | TEXT     | NOT NULL                                         | Valeur de `JobSource`                     |
| `fetched_at`    | TEXT     | NOT NULL, `DEFAULT (datetime('now'))`            | Timestamp ISO 8601 UTC                    |
| `offers_fetched`| INTEGER  | NOT NULL, DEFAULT 0                              | Nombre total d'offres parsées             |
| `offers_new`    | INTEGER  | NOT NULL, DEFAULT 0                              | Offres nouvellement insérées en DB        |
| `status`        | TEXT     | NOT NULL, CHECK IN ('success','error','empty')   | Résultat global de la collecte            |
| `error_message` | TEXT     | NULL                                             | Message d'erreur si status='error'        |
| `duration_ms`   | INTEGER  | NOT NULL, DEFAULT 0                              | Durée de collecte (parsing uniquement)    |

**Index** :
```sql
CREATE INDEX IF NOT EXISTS idx_fetch_log_source
  ON job_watch_fetch_log(source, fetched_at DESC);
```

**Rétention** : 50 entrées max par source. Purge automatique après chaque INSERT.

**Statut** :
- `success` — au moins 1 offre parsée, pas d'erreur bloquante
- `error` — exception levée pendant le parsing ou HTTP non-2xx
- `empty` — parsing OK mais 0 offres retournées

---

### 2. `job_watch_settings` — clé ajoutée

Table existante de persistance des paramètres scalaires. Une nouvelle clé est ajoutée.

| Clé              | Type de valeur | Défaut | Description                                      |
|------------------|---------------|--------|--------------------------------------------------|
| `min_save_score` | number (string JSON) | `'20'` | Score minimum pour sauvegarder une offre en DB |

---

### 3. `JobWatchSettings` — champ TypeScript ajouté

Interface TypeScript mise à jour (src/types/job-watch.ts) :

```typescript
export interface JobWatchSettings {
  // ... champs existants inchangés ...
  
  /** Score minimum en dessous duquel une offre n'est pas sauvegardée en DB */
  minSaveScore: number;
}
```

`DEFAULT_JOB_WATCH_SETTINGS.minSaveScore = 20`

---

### 4. `FetchLog` — nouveau type TypeScript

```typescript
/** Log d'une collecte pour une source donnée */
export interface FetchLog {
  id: string;
  source: JobSource;
  fetchedAt: string;       // ISO 8601 UTC
  offersFetched: number;
  offersNew: number;
  status: 'success' | 'error' | 'empty';
  errorMessage: string | null;
  durationMs: number;
}
```

---

### 5. `FetchResult` — enrichi (fetcher.ts)

```typescript
export interface FetchResult {
  source: JobSource;
  newOffers: number;
  totalFetched: number;    // NOUVEAU — offres parsées avant dédup/filtrage
  errors: string[];
  durationMs: number;      // NOUVEAU — durée de collecte de cette source
  status: 'success' | 'error' | 'empty'; // NOUVEAU — statut calculé
}
```

---

## Relations

```
job_watch_fetch_log
  ├── source → JobSource (enum string, pas de FK)
  └── fetched_at → tri DESC pour affichage

job_watch_settings (clé-valeur)
  └── 'min_save_score' → number (filtre fetcher.ts avant INSERT)

job_offers (existant)
  └── score (calculé par scorer.ts v3, nouveau barème)
```

---

## Scoring — delta de valeurs

Le scorer.ts est mis à jour sans changement de signature. Voici les valeurs delta :

| Paramètre                    | Avant (v2)       | Après (v3)                     |
|------------------------------|------------------|--------------------------------|
| `base`                       | 50               | 0 si jobTitles.length>0, sinon 50 |
| Title match — high           | +35              | +40                            |
| Title match — medium/low     | +25              | +30                            |
| Title match — description    | +10              | +15                            |
| Balanced no-match penalty    | -15 pts          | cap à 25 (pas de pénalité)     |
| Strict no-match cap          | plafonné à 30    | supprimé                       |
| Skills titre (max)           | +5 / max +20     | +6 / max +24                   |
| Skills snippet (max)         | +3 / max +20     | +3 / max +12                   |
| Contract bad (balanced)      | -20              | -15                            |

**Compatibilité** : signature `computeScoreWithBreakdown(offer, profile, learned)` inchangée. Tous les scores existants en DB ne sont pas recalculés.

---

## Migrations SQL

### Migration 013 — `job_watch_fetch_log`

```sql
-- Fichier : src-tauri/migrations/013_job_watch_fetch_log.sql
CREATE TABLE IF NOT EXISTS job_watch_fetch_log (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source         TEXT NOT NULL,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  offers_fetched INTEGER NOT NULL DEFAULT 0,
  offers_new     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL CHECK (status IN ('success', 'error', 'empty')),
  error_message  TEXT,
  duration_ms    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_source
  ON job_watch_fetch_log(source, fetched_at DESC);
```

**Pattern de fallback** dans `db.ts` (pour DBs existantes ayant sauté la migration) :
```typescript
await db.execute(`CREATE TABLE IF NOT EXISTS job_watch_fetch_log (...)`)
  .catch(() => {/* already exists */});
```

### Clé `min_save_score` dans `job_watch_settings`

Pas de migration SQL. Insérée via `DEFAULT_JOB_WATCH_SETTINGS` au premier chargement, avec `INSERT OR IGNORE`.

```typescript
// Dans db.ts, section initialisation des clés par défaut :
await db.execute(
  `INSERT OR IGNORE INTO job_watch_settings (key, value) VALUES ('min_save_score', '20')`
);
```
