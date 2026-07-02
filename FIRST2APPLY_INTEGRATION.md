# First2Apply → ResumeForge — Suivi d'intégration

**Branche :** `claude/integrate-first2apply-c0YIy`  
**Dernière mise à jour :** 2026-04-23

---

## Phase 1 — Stabilisation ✅ COMPLÈTE

### Lot 1.1 — Corrections critiques
| ID | Description | Statut |
|----|-------------|--------|
| C1 | `fetcher.ts` : comptage transparent (totalFetched / offersFiltered / offersDuplicate), migration 014 colonnes log | ✅ |
| C2 | Digest email : sessionStorage → localStorage + pruning 7j | ✅ |
| I1 | Dédup cross-source O(n²) → O(n) buckets Levenshtein par company | ✅ |

### Lot 1.2 — HTTP industrielle
| ID | Description | Statut |
|----|-------------|--------|
| H1 | `http-client.ts` : retry backoff, circuit-breaker par source, timeout AbortController | ✅ |
| H2 | Tous les parseurs HTTP routent via `fetchResilient` | ✅ |

### Lot 1.3 — Tests
| Suite | Couverture | Statut |
|-------|-----------|--------|
| `http-client.test.ts` | retry, circuit-breaker, timeout | ✅ |
| `deduplicator.test.ts` | hash determinism, cross-source dedup | ✅ |
| `jobicy.test.ts` | parsing complet, salary, contract | ✅ |

### Correctifs post-merge (bug-fix)
| ID | Description | Statut |
|----|-------------|--------|
| BF1 | Migration 015 : `job_watch_settings` par profil (`profile_id`) | ✅ |
| BF2 | `useJobWatcher` : scheduler unique (module lock) + guard `isFetching` live | ✅ |

---

## Phase 2 — Unification + WebView scraping 🚧 EN COURS

**Objectif :** scraper LinkedIn/Indeed FR/HelloWork via WebView Tauri cachée avec session utilisateur.

### Lot 2.1 — Architecture BaseParser unifiée
| ID | Description | Statut |
|----|-------------|--------|
| 2.1.1 | `parsers/common/contract-type.ts` — normalisation unifiée des types contrat | 🚧 |
| 2.1.2 | `parsers/common/salary.ts` — normalisation salaire (mensuel → annuel, devise) | 🚧 |
| 2.1.3 | `parsers/common/location.ts` — extraction localisation (regex FR + patterns) | 🚧 |
| 2.1.4 | `parsers/base.ts` — interface `JobSiteParser` (id, requiresAuth, fetch, healthCheck) | 🚧 |
| 2.1.5 | Portage parseurs existants sur les utilitaires communs | 🚧 |

### Lot 2.2 — WebView Tauri cachée
| ID | Description | Statut |
|----|-------------|--------|
| 2.2.1 | Rust : commande `scrape_with_session(site_id, url)` via headless_chrome + user_data_dir | 🚧 |
| 2.2.2 | Rust : commandes `open_login_flow`, `close_login_browser`, `session_exists`, `clear_session` | 🚧 |
| 2.2.3 | TS : `lib/watcher/session-manager.ts` — wrappeurs invoke Tauri | 🚧 |
| 2.2.4 | UI : `SessionManagerPanel.tsx` — boutons "Se connecter" par site | 🚧 |

### Lot 2.3 — Nouveaux parseurs
| Source | Auth | Stratégie | Statut |
|--------|------|-----------|--------|
| LinkedIn | Oui | WebView → remplace `linkedin_rss` | 🚧 |
| Indeed FR | Non* | WebView (anti-bot JS) | 🚧 |
| HelloWork | Non | WebView | 🚧 |
| *(Glassdoor — phase ultérieure)* | Oui | WebView + session | ⏳ |

### Lot 2.4 — Nettoyage
| ID | Description | Statut |
|----|-------------|--------|
| 2.4.1 | `mantiks.ts` → marqué `@deprecated`, désactivé par défaut | 🚧 |
| 2.4.2 | Migration 016 : `job_watch_config` — valeur source `linkedin_rss` → `linkedin` | 🚧 |

---

## Phase 3 — Filtre IA par prompt importable ✅ COMPLÈTE

### Lot 3.1 — Format `AIFilterRule`
| ID | Description | Statut |
|----|-------------|--------|
| 3.1.1 | `lib/watcher/ai-filter.ts` — types `AIFilterRule`, `WeightedPattern`, version schema `1.0` | ✅ |
| 3.1.2 | `validateAIFilterRule()` — parsing défensif avec messages d'erreur explicites | ✅ |
| 3.1.3 | `applyAIFilter()` — match regex/substring, exclusions hard, boost/penalty bornés | ✅ |
| 3.1.4 | Tests unitaires (`ai-filter.test.ts`, 19 cas) | ✅ |

### Lot 3.2 — Générateur de prompt
| ID | Description | Statut |
|----|-------------|--------|
| 3.2.1 | `buildAIFilterPrompt()` — prompt avec schéma + exemple, contraintes strictes | ✅ |
| 3.2.2 | `components/job-watch/AIFilterGenerator.tsx` — 3 étapes : intention → copie prompt → colle JSON | ✅ |
| 3.2.3 | Extraction JSON d'une réponse "bruitée" (détection blocs ```json) | ✅ |
| 3.2.4 | Intégration dans `JobWatchConfig` (section 6 "Filtre IA par prompt") | ✅ |

### Lot 3.3 — Application dans scorer
| ID | Description | Statut |
|----|-------------|--------|
| 3.3.1 | Couche 0.5 dans `scorer.ts` entre Couche 0 et Couche 1 | ✅ |
| 3.3.2 | `ScoreBreakdown.aiFilterDelta` + `aiFilterMatches` pour transparence UI | ✅ |
| 3.3.3 | Persistance per-profile (`ai_filter_rule` dans `PROFILE_SETTINGS_KEYS`) | ✅ |
| 3.3.4 | `jobWatchStore.loadAIFilterRule` / `saveAIFilterRule` + chargement au `initialize` | ✅ |
| 3.3.5 | `fetcher.loadLearnedSignals` propage la règle via `LearnedSignals.aiFilterRule` | ✅ |

---

## Décisions techniques clés

| Sujet | Décision |
|-------|----------|
| Backend | 100% local Tauri/SQLite — pas de Supabase |
| Scraping | `headless_chrome` (déjà en Cargo.toml) + `user_data_dir` par site pour les cookies |
| Session login | Fenêtre Chrome non-headless → user se logue → state Tauri → cookies persistés |
| IA filtre | Prompt importable (pas d'API directe) — zéro coût, zéro backend |
| Marchés F2A | Sources US (Indeed/Dice) non portées — focus FR/EMEA |

---

## Risques identifiés

| Risque | Mitigation |
|--------|-----------|
| Chrome non installé | Vérification `default_executable()` + message d'erreur clair |
| Anti-bot détection | User-Agent réaliste, délai random entre requêtes, pas de scraping parallèle |
| CGU LinkedIn/Indeed | Usage personnel seulement — pas de mass scraping |
| Sélecteurs HTML cassants | Extraire JSON embarqué (`window.__data__`) en priorité sur le HTML |
