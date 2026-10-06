# Plan 006

## Données

Migration 021 (`src-tauri/migrations/021_watch_sources_health.sql`, repli `db.ts`), purement additive :

- `job_watch_fetch_log` : `source_status`, `http_status`, `error_url` (la colonne `status` garde son CHECK).
- `job_offers.score_version`, `job_offer_alerts.score_version` (défaut 1 = échelle antérieure).
- `job_watch_alerts.titles_updated_at` (daté par `updateAlert` quand les intitulés changent).
- Table `job_watch_source_cooldown` (pause 24 h après un refus).
- Pas de colonne `enabled_sources` : `job_watch_config(alert_id, source, enabled)` couvre déjà « sources par piste ».

## Modules (`src/lib/watcher/`)

| Module | Rôle |
|---|---|
| `source-status.ts` | statuts, `SourceError`, détection de pages de pare-feu, classification, conseils |
| `source-cooldown.ts` | pause persistée après 403/429/pare-feu (APEC, Emploi Territorial : 24 h) |
| `french-titles.ts` | intitulés exploitables par les sources francophones |
| `offer-dedup.ts` | regroupement d'une même annonce, dédoublonnage de jointures |
| `alert-similarity.ts` | pistes quasi identiques (Jaccard des intitulés ≥ 0,8) |
| `score-recalc.ts` | recalcul par lots des 60 derniers jours, progression |
| `threshold-analysis.ts` | offres masquées, seuil suggéré |
| `blacklist-suggestions.ts`, `title-exclusion.ts` | suggestions et exclusion « type de poste chez elle » |
| `source-coverage.ts` | couverture par source pour les prompts |

Rust : `fetch_apec_api` ouvre la page de recherche (cookies de session, cache 10 min), puis POST avec `Origin`, `Referer`, `Accept`, `Accept-Language`, `Content-Type`, `User-Agent` et cookies. Aucun retry sur 4xx.

## Décisions

- `SCORER_VERSION = 2` : entiers 0-100. Une offre d'une version antérieure n'est ni masquée par le seuil, ni comptée comme masquée, ni utilisée par les métriques et prompts tant qu'elle n'est pas recalculée.
- Regroupement des doublons à l'affichage (non destructif) + rattachement à la collecte via empreinte source/entreprise/intitulé/lieu.
- Emploi Territorial : source **indisponible** (migration 022, `UNAVAILABLE_SOURCES`) ; l'API officielle (OpenAPI v5.3) est authentifiée et n'expose aucune recherche d'offres publiées, aucun parser API. Parser RSS conservé (voir AUDIT.md).
