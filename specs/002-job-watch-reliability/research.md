# Recherche technique : Refonte Veille Emploi

**Branche** : `002-job-watch-reliability` | **Date** : 2026-04-15

---

## 1. Scoring — état actuel vs cible

### Décision : refonte base + pondération dans `scorer.ts`

**État actuel** (scorer.ts v2) :
- `base = 50` (fixe, toujours)
- Title high → +35, medium → +25, description → +10
- Mode strict, no title → cap à 30
- Mode balanced, no title → `-15` pts (pénalité)
- Skills : +5 titre, +3 description, max +20
- Contrat ok → +10, mauvais balanced → -20

**Cible** (spec clarifiée) :
- `base = 0` si `jobTitles.length > 0`, sinon `base = 50`
- Title high → +40, medium → +30, description → +15
- Mode balanced, no title (et jobTitles non vide) → plafond à 25 (pas de pénalité, mais cap)
- Terme exclu (titre OU description) → score = 0 (déjà vrai dans l'existant pour le texte complet)
- Skills : +6 titre (max +24), +3 description (max +12)
- Contrat ok → +10, mauvais balanced → -15 (au lieu de -20)
- Suppression du cap strict explicite à 30

**Rationale** : La base 50 rendait les offres hors-cible trop compétitives. Base 0 + score gagné = signal plus fiable. Le plafond 25 en balanced sans match jobTitle remplace la pénalité -15 sur base 50 (effet similaire mais sémantique plus claire).

**Compatibilité** : `computeScoreWithBreakdown(offer, profile, learned)` — signature inchangée. `ScoreBreakdown` étendu avec le champ `basePenalty` (optionnel, pour diagnostic) mais rétrocompatible.

**Scores existants** : pas de recalcul. Séparation temporelle assumée.

---

## 2. Table `job_watch_fetch_log` — schéma retenu

### Décision : CREATE TABLE IF NOT EXISTS dans `db.ts`

```sql
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
CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON job_watch_fetch_log(source, fetched_at DESC);
```

**Rétention** : après chaque INSERT, purge automatique :
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

**Rationale** : Pattern `CREATE TABLE IF NOT EXISTS` dans `db.ts` est déjà établi pour toutes les migrations fragiles. Cohérence et résilience maximales.

---

## 3. Score minimum de sauvegarde

### Décision : clé `min_save_score` dans `job_watch_settings`

- Clé : `'min_save_score'`, valeur par défaut : `'20'`
- Ajoutée dans `DEFAULT_JOB_WATCH_SETTINGS` et dans la liste des clés initiales de `db.ts`
- Exposée dans `JobWatchSettings` (TypeScript) comme `minSaveScore: number`
- Filtre appliqué dans `fetcher.ts` avant INSERT : `if (score < settings.minSaveScore) continue`
- UI : slider dans `JobWatchConfigView` (section "Options avancées") + bouton "Purger" dans `JobOffersView`

**Rationale** : `job_watch_settings` est déjà la table de persistance des paramètres scalaires. Pas de nouveau schéma nécessaire.

---

## 4. LinkedIn sans RSS — stratégie de scraping

### Décision : tauriFetch + DOMParser + JSON-LD, fallback CSS

**Endpoint cible** :
```
https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
  ?keywords=<query>&location=France&start=0
```
Cet endpoint retourne du HTML sans authentification. Il peut renvoyer statut 999 si le User-Agent est détecté.

**Transport** : `tauriFetch` (plugin HTTP Tauri, bypass CORS natif — déjà utilisé dans `wttj.ts`). Headers identiques : `BROWSER_USER_AGENT`.

**Parsing** :
1. DOMParser sur le HTML reçu
2. Extraction JSON-LD `<script type="application/ld+json">` contenant `@type: "JobPosting"`
3. Fallback : sélecteurs CSS `[data-job-id]` si JSON-LD absent
4. Fonctions partagées dans `src/lib/watcher/json-ld-utils.ts`

**Rétrocompatibilité** : si `config.rssUrl` est défini → comportement RSS existant inchangé. Si vide → scraping.

**Gestion d'échec** : statut non-2xx ou HTML vide → FetchLog `status: 'error'`, `error_message: "Scraping LinkedIn échoué — essayez rss.app comme alternative."`, 0 offres, pas de crash.

**Rationale** : `tauriFetch` + DOMParser est déjà le pattern établi de `wttj.ts`. Aucune nouvelle dépendance. La gestion d'échec explicite répond à FR-029.

---

## 5. Extraction JSON-LD — utilitaires partagés

### Décision : `json-ld-utils.ts` (nouveau fichier)

Fonctions à extraire/créer :
- `extractJsonLdJobs(html: string): WttjJsonLdJob[]` — parse `<script type="application/ld+json">` depuis un DOMParser document
- `parseJobLocation(job: WttjJsonLdJob): string | null`
- `parseJobDate(job: WttjJsonLdJob): string | null`

`wttj.ts` les utilisera en remplacement de son code inline. `linkedin-rss.ts` les réutilisera pour son scraping direct.

---

## 6. HealthDashboard — intégration fetch log

### Décision : tableau dans le body existant du HealthDashboard

- Chargement via `jobWatchStore.loadFetchLogs()` au montage
- Affichage : tableau avec 1 ligne par source (dernière collecte)
- Colonnes : Source | Statut (badge coloré) | Récupérées | Nouvelles | Date
- "Voir l'historique" : expand inline montrant les 10 dernières par source (état local)
- Warning `jobTitles` vide : bannière en haut du dashboard, conditional sur `settings.searchProfile.jobTitles.length === 0`
- Info-bulle scoring : affichée une fois, dismissable, stockée en `localStorage`

---

## 7. Tests — scorer.test.ts

### Décision : Bun test runner (déjà configuré dans le projet)

Cas obligatoires (FR-023) :
```ts
// Cas 1 : terme exclu → 0
// Cas 2 : aucun jobTitle match + balanced → ≤ 25
// Cas 3 : jobTitle exact dans titre (high) → ≥ 40
// Cas 4 : jobTitles vide → base ≥ 50
```

Structure : `import { computeScoreWithBreakdown } from './scorer'` — pas de mock.

**Rationale** : mapping.test.ts est déjà avec Bun. Cohérence du runner.
