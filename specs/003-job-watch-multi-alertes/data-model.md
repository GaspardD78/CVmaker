# Modèle de données — Portefeuille multi-alertes

## 1. Vue d'ensemble

Le changement tient en trois idées :

1. Une nouvelle table **`job_watch_alerts`** porte tout ce qui définit une piste :
   son `SearchProfile`, sa règle de filtre IA et son apprentissage. Ce sont exactement
   les données qui vivaient jusqu'ici sous forme de clés globales dans
   `job_watch_settings` (`search_profile`, `ai_filter_rule`, `learned_dict_*`,
   `company_reputation`).
2. **`job_watch_config`** — qui n'a jamais été une « alerte » mais une ligne par source —
   devient rattachée à une alerte. Une source activée l'est *pour une piste donnée*.
3. Une table de liaison **`job_offer_alerts`** porte la multiplicité et le score par
   piste. `job_offers` reste inchangée dans sa structure : la contrainte
   `UNIQUE(hash)` est **conservée**, ce qui garantit qu'une offre reste une ligne
   unique quel que soit le nombre de pistes qui la captent.

```
profiles (utilisateur)
   └── job_watch_alerts (1..4)          ← SearchProfile, filtre IA, apprentissage
         ├── job_watch_config (0..n)    ← une ligne par source activée
         ├── job_watch_fetch_log (n)    ← une ligne par (alerte, source, collecte)
         └── job_offer_alerts (n) ──── job_offers (unique par hash)
                                             └── job_offer_feedback (porte alert_id)
```

---

## 2. Table `job_watch_alerts` (nouvelle)

```sql
CREATE TABLE IF NOT EXISTS job_watch_alerts (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id         TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  color              TEXT NOT NULL DEFAULT '#6366f1',
  kind               TEXT NOT NULL DEFAULT 'core',
  position           INTEGER NOT NULL DEFAULT 0,
  enabled            INTEGER NOT NULL DEFAULT 1,
  search_profile     TEXT NOT NULL,
  ai_filter_rule     TEXT,
  learned_dict       TEXT NOT NULL DEFAULT '{"positive":{},"negative":{}}',
  company_reputation TEXT NOT NULL DEFAULT '{}',
  learned_decayed_at TEXT,
  last_fetched_at    TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);
```

| Colonne | Rôle |
|---|---|
| `profile_id` | Utilisateur propriétaire. `''` = configuration héritée d'avant l'isolation par profil, conservé pour cohérence avec `job_watch_settings` |
| `name` | Nom de la piste affiché partout (barre de pistes, badges, digest) |
| `color` | Couleur du badge. Palette de 4 valeurs par défaut, une par type |
| `kind` | `core` \| `adjacent` \| `exploratory` \| `opportunistic`. Purement descriptif : n'influence **pas** le scoring, sert à la lecture du portefeuille et guide le prompt stratège |
| `position` | Ordre d'affichage et ordre des sections du digest |
| `enabled` | `0` = piste conservée mais non collectée ; ses offres restent consultables |
| `search_profile` | JSON `SearchProfile` complet — le même type qu'aujourd'hui, aucune modification de forme |
| `ai_filter_rule` | JSON `AIFilterRule` ou `NULL` |
| `learned_dict` | JSON `{ positive: Record<string, number>, negative: Record<string, number> }` |
| `company_reputation` | JSON `Record<string, number>` |
| `learned_decayed_at` | Horodatage ISO de la dernière décroissance appliquée |
| `last_fetched_at` | Dernière collecte réussie, toutes sources confondues |

```sql
CREATE INDEX IF NOT EXISTS idx_job_watch_alerts_profile
  ON job_watch_alerts(profile_id, position);
```

**Invariants applicatifs** (non exprimables en SQLite sans trigger, donc garantis par le store) :
- au plus `MAX_ALERTS = 4` lignes par `profile_id` ;
- au moins 1 ligne par `profile_id` dès lors que la veille a été configurée ;
- `position` contiguë de 0 à n-1 après toute création, suppression ou réordonnancement.

---

## 3. Table `job_offer_alerts` (nouvelle)

```sql
CREATE TABLE IF NOT EXISTS job_offer_alerts (
  offer_id   TEXT NOT NULL REFERENCES job_offers(id)       ON DELETE CASCADE,
  alert_id   TEXT NOT NULL REFERENCES job_watch_alerts(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL DEFAULT 0,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (offer_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_alert ON job_offer_alerts(alert_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_offer ON job_offer_alerts(offer_id);
```

- `score` — score calculé **pour cette piste**. C'est lui qu'affiche la vue filtrée par piste.
- `matched_at` — première fois que cette piste a capté cette offre. Sert au digest
  (« nouvelles offres de la piste depuis hier ») et aux métriques de recouvrement.
- Pas de statut lu/archivé ici : **délibérément**. Le statut est porté par l'offre
  (FR-033) ; le dupliquer par liaison créerait des états incohérents pour une même
  offre selon la piste consultée.

### Requête de recouvrement (calcul local, sans IA)

```sql
SELECT a.alert_id AS alert_a,
       b.alert_id AS alert_b,
       COUNT(*)   AS shared
FROM job_offer_alerts a
JOIN job_offer_alerts b
  ON a.offer_id = b.offer_id AND a.alert_id < b.alert_id
JOIN job_offers o ON o.id = a.offer_id
WHERE o.fetched_at >= datetime('now', '-30 days')
GROUP BY a.alert_id, b.alert_id;
```

Le pourcentage de recouvrement d'une paire est `shared / MIN(total_a, total_b)` : on
rapporte au plus petit des deux volumes, sinon une petite piste entièrement incluse
dans une grosse afficherait un recouvrement trompeusement faible.

---

## 4. Tables modifiées

### `job_watch_config`

```sql
ALTER TABLE job_watch_config ADD COLUMN alert_id TEXT REFERENCES job_watch_alerts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_job_watch_config_alert ON job_watch_config(alert_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_watch_config_alert_source ON job_watch_config(alert_id, source);
```

Une source ne peut être configurée qu'une fois par alerte. Les colonnes héritées
(`keywords`, `location`, `radius_km`, `contract_types`, `exclude_keywords`) restent
inutilisées, comme depuis la migration 010.

### `job_offer_feedback`

```sql
ALTER TABLE job_offer_feedback ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_alert ON job_offer_feedback(alert_id);
```

`NULL` pour les feedbacks antérieurs à la migration : ils restent exploitables pour
les statistiques globales mais ne sont attribués à aucune piste, donc n'entraînent
aucun apprentissage rétroactif.

### `job_watch_fetch_log`

```sql
ALTER TABLE job_watch_fetch_log ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_fetch_log_alert ON job_watch_fetch_log(alert_id, fetched_at DESC);
```

La purge existante (50 derniers logs par source) devient **50 derniers par couple
(alerte, source)**, sinon 4 alertes se disputeraient le même quota et l'historique
deviendrait inexploitable.

### `job_offers`

**Aucune modification de schéma.** `score` conserve son sens de score affiché, mais
prend désormais la valeur du **meilleur score toutes pistes confondues**. C'est une
dénormalisation assumée : elle permet aux filtres, tris et purges existants
(`purgeOffers(minScore)`, `filters.minScore`, `sortBy: 'score_desc'`) de continuer à
fonctionner sans jointure.

---

## 5. Clés retirées de `job_watch_settings`

Après migration, ces clés ne sont plus **lues** par l'application (elles restent en
base, conformément à la pratique du projet depuis la migration 010) :

| Clé | Devient |
|---|---|
| `search_profile` | `job_watch_alerts.search_profile` |
| `ai_filter_rule` | `job_watch_alerts.ai_filter_rule` |
| `learned_dict_positive` / `learned_dict_negative` | `job_watch_alerts.learned_dict` |
| `learned_dict_decayed_at` | `job_watch_alerts.learned_decayed_at` |
| `company_reputation` | `job_watch_alerts.company_reputation` |

Toutes les autres clés (SMTP, Navitia, France Travail, `min_save_score`,
`fetch_interval_hours`, `expired_max_age_days`, `selector_override_*`…) restent
globales et inchangées.

---

## 6. Migration `019_job_watch_alerts.sql`

Migration **purement additive** : aucune colonne supprimée, aucune donnée écrasée.

```sql
-- Migration 019: Portefeuille multi-alertes pour la veille emploi
--
-- Introduit job_watch_alerts (une piste de recherche = un SearchProfile autonome,
-- son filtre IA et son apprentissage) et job_offer_alerts (liaison N-N offre↔piste
-- portant le score par piste).
--
-- La configuration existante devient l'alerte « Recherche principale ».
-- Purement additive : rien n'est supprimé, les anciennes clés de job_watch_settings
-- restent en base pour archivage (même convention que la migration 010).

CREATE TABLE IF NOT EXISTS job_watch_alerts (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id         TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  color              TEXT NOT NULL DEFAULT '#6366f1',
  kind               TEXT NOT NULL DEFAULT 'core',
  position           INTEGER NOT NULL DEFAULT 0,
  enabled            INTEGER NOT NULL DEFAULT 1,
  search_profile     TEXT NOT NULL,
  ai_filter_rule     TEXT,
  learned_dict       TEXT NOT NULL DEFAULT '{"positive":{},"negative":{}}',
  company_reputation TEXT NOT NULL DEFAULT '{}',
  learned_decayed_at TEXT,
  last_fetched_at    TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_watch_alerts_profile ON job_watch_alerts(profile_id, position);

CREATE TABLE IF NOT EXISTS job_offer_alerts (
  offer_id   TEXT NOT NULL REFERENCES job_offers(id)       ON DELETE CASCADE,
  alert_id   TEXT NOT NULL REFERENCES job_watch_alerts(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL DEFAULT 0,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (offer_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_alert ON job_offer_alerts(alert_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_job_offer_alerts_offer ON job_offer_alerts(offer_id);

-- ── Étape 1 : une alerte par profil ayant un search_profile ──────────────────
INSERT INTO job_watch_alerts (
  profile_id, name, color, kind, position, enabled,
  search_profile, ai_filter_rule, learned_dict, company_reputation, learned_decayed_at
)
SELECT
  s.profile_id,
  'Recherche principale',
  '#6366f1',
  'core',
  0,
  1,
  s.value,
  (SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'ai_filter_rule' AND v.profile_id = s.profile_id),
  -- Concaténation plutôt que json_object() : pas de dépendance à l'extension JSON1
  '{"positive":'
    || COALESCE((SELECT v.value FROM job_watch_settings v
         WHERE v.key = 'learned_dict_positive' AND v.profile_id = s.profile_id), '{}')
    || ',"negative":'
    || COALESCE((SELECT v.value FROM job_watch_settings v
         WHERE v.key = 'learned_dict_negative' AND v.profile_id = s.profile_id), '{}')
    || '}',
  COALESCE((SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'company_reputation' AND v.profile_id = s.profile_id), '{}'),
  (SELECT v.value FROM job_watch_settings v
    WHERE v.key = 'learned_dict_decayed_at' AND v.profile_id = s.profile_id)
FROM job_watch_settings s
WHERE s.key = 'search_profile';

-- ── Étape 2 : rattachement des sources configurées ───────────────────────────
ALTER TABLE job_watch_config ADD COLUMN alert_id TEXT REFERENCES job_watch_alerts(id) ON DELETE CASCADE;

UPDATE job_watch_config
SET alert_id = (
  SELECT a.id FROM job_watch_alerts a
  WHERE a.profile_id = COALESCE(job_watch_config.profile_id, '')
  ORDER BY a.position LIMIT 1
)
WHERE alert_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_watch_config_alert ON job_watch_config(alert_id);

-- ── Étape 3 : rattachement des offres existantes ─────────────────────────────
INSERT OR IGNORE INTO job_offer_alerts (offer_id, alert_id, score, matched_at)
SELECT o.id, a.id, COALESCE(o.score, 0), COALESCE(o.fetched_at, datetime('now'))
FROM job_offers o
JOIN job_watch_alerts a ON a.profile_id = COALESCE(o.profile_id, '');

-- ── Étape 4 : traçabilité du feedback et des logs ────────────────────────────
ALTER TABLE job_offer_feedback ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_alert ON job_offer_feedback(alert_id);

ALTER TABLE job_watch_fetch_log ADD COLUMN alert_id TEXT;
CREATE INDEX IF NOT EXISTS idx_fetch_log_alert ON job_watch_fetch_log(alert_id, fetched_at DESC);
```

### Points d'attention de la migration

- **`profile_id` non aligné** : `job_watch_config.profile_id` et `job_offers.profile_id`
  ont été ajoutés par `ALTER TABLE` sans `NOT NULL` (migration 009) et peuvent donc
  valoir `NULL`, alors que `job_watch_alerts.profile_id` vaut `''` par défaut. D'où le
  `COALESCE(..., '')` systématique dans les jointures. C'est le principal piège de cette
  migration.
- **Index unique `(alert_id, source)`** volontairement **non créé dans la migration** :
  d'anciennes bases peuvent contenir des doublons de sources qui feraient échouer la
  migration entière. Il est créé par la couche de repli TypeScript, en `CREATE UNIQUE
  INDEX IF NOT EXISTS` dans un `.catch()`, après déduplication.
- **Cas sans `search_profile`** : un utilisateur ayant des sources mais aucun profil
  enregistré ne produit aucune alerte à l'étape 1, et ses sources restent orphelines.
  Ce cas est rattrapé par la couche de repli (FR-054), qui crée une alerte au profil
  par défaut et y rattache les `job_watch_config` orphelins.
- **Repli `db.ts`** : conformément à la convention du projet, `initDb()` reproduit
  chaque `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … .catch()` de cette migration,
  afin que les bases existantes n'ayant pas rejoué les migrations soient rattrapées.
- **Enregistrement Rust** : ajouter l'entrée `Migration { version: 19, … }` dans le
  `vec![]` de `src-tauri/src/lib.rs`.

---

## 7. Types TypeScript

Ajouts dans `src/types/job-watch.ts` — le type `SearchProfile` est **inchangé**.

```ts
export const MAX_ALERTS = 4;

export type AlertKind = 'core' | 'adjacent' | 'exploratory' | 'opportunistic';

export interface JobWatchAlert {
  id: string;
  name: string;
  color: string;
  kind: AlertKind;
  position: number;
  enabled: number;              // 0 | 1
  searchProfile: SearchProfile;
  aiFilterRule: AIFilterRule | null;
  learnedDict: LearnedDictionary;
  companyReputation: Record<string, number>;
  learnedDecayedAt: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  /** Sources actives, dérivées des lignes job_watch_config rattachées. */
  sources: JobSource[];
}

/** Rattachement d'une offre à une piste, avec le score propre à cette piste. */
export interface OfferAlertLink {
  alertId: string;
  score: number;
  matchedAt: string;
}

/** Offre enrichie des pistes qui l'ont captée — ce que consomme l'UI. */
export interface JobOfferWithAlerts extends JobOffer {
  alerts: OfferAlertLink[];
}
```

`JobWatchFilters` reçoit un champ supplémentaire :

```ts
export interface JobWatchFilters {
  // … champs existants inchangés
  /** null = toutes les pistes ; 'unlinked' = offres orphelines. */
  alertId: string | null | 'unlinked';
}
```

`JobWatchSettings` **perd** `searchProfile` (déplacé dans l'alerte) et conserve tout
le reste. C'est le seul changement de rupture sur un type existant ; il est mécanique
et le compilateur désigne exhaustivement les points d'appel à corriger.

### Palette par défaut

| Type | Couleur | Intention |
|---|---|---|
| `core` | `#6366f1` (indigo) | Cœur de cible |
| `adjacent` | `#0ea5e9` (ciel) | Métier voisin |
| `exploratory` | `#10b981` (émeraude) | Ouverture |
| `opportunistic` | `#f59e0b` (ambre) | Angle étroit |
