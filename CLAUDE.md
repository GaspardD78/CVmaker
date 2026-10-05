# ResumeForge Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Technologies
- TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner) (002-job-watch-reliability)
- SQLite via tauri-plugin-sql — migrations versionnées via sqlx dans lib.rs + fallbacks ALTER TABLE dans db.ts (002-job-watch-reliability)

- TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (new), `remark-gfm` ^4.x (new), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existing) (main)

## Project Structure

```text
src/
tests/
```

## Commands

Depuis `resume-forge/` (bun est le gestionnaire de paquets unique — pas de package-lock.json) :

- `bun install` — dépendances frontend
- `bunx tsc --noEmit` — type-check
- `bun test` — tests frontend (Bun)
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` — lint Rust

La CI (`.github/workflows/ci.yml`) exécute ces commandes sur chaque PR. Plan d'amélioration en cours : voir `AUDIT-PLAN-AMELIORATION.md`.

## Code Style

TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend): Follow standard conventions

## Recent Changes
- 005-watch-ai-analysis (branche claude/youthful-mendel-v8v1sf) : analyse IA de la Veille refondue. Pipeline `analysis-loader` -> `analysis-context` -> `analysis-prompt`, retour `watch-analysis/v1` lu par `analysis-patch` (garde-fous, simulation, annulation). Portée des exclusions par terme (`exclusions.ts`, `SearchProfile.excludeScopes`), `requiredDomains`, poids du scorer exportés (`SCORING_WEIGHTS`), apprentissage protégé par le vocabulaire de la piste. Voir `specs/005-watch-ai-analysis/` et `ARCHITECTURE.md` §9.
- 005-cv-angles (branche claude/bold-newton-olmacn) : catégories de compétences rendues en lignes (`lib/skill-lines.ts`), titre sans employeur en double (`lib/entry-display.ts`), règles personnelles par profil (`settings`, clé `cv_personal_rules:{profileId}`), angles de CV (migration 020 `cv_angles`, `lib/cv-angles.ts`, `lib/cv-angle-prompt.ts`, `lib/ai-angle-response.ts`, `stores/angleStore.ts`, tags `angle:<slug>` / `hide:<slug>`). Aucune donnée personnelle dans le dépôt : `docs/angles-affinities.json` est ignoré par git.
- 004-cv-engine-optimization: moteur de CV IA v2 : prompt composable (`lib/cv-prompt.ts`), schéma JSON v2 additif, garde-fou post-LLM (`lib/ai-cv-guard.ts`), compétences en sous-en-têtes, sections vides masquées au rendu (`lib/cv-sections.ts`), langue du CV (`cv.settings.cvLanguage`). Voir `specs/004-cv-engine-optimization/`.
- 002-job-watch-reliability: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner)

- main: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (new), `remark-gfm` ^4.x (new), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existing)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
