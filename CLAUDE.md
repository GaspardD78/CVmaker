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
- lot 3 (branche claude/pensive-turing-82lmks-lot3) : `cvSkillLines` (lignes de compétences reformulées, sources obligatoires) : garde-fou (`skill-line-no-source`, `skill-line-unsourced`, `skill-lines-too-few`), blocs `custom_text` marqués `aiSkillLine` sous « Compétences » (`applySkillLines`, idempotent, catégories masquées via `hiddenBySkillLines`), rendu via `isSkillLineBlock` / `buildBadgeRows` (`plain`), revue des `suggestedEntries` partagée (`SuggestedEntriesReview`, `lib/suggested-entries.ts`).
- lot 4 (branche claude/pensive-turing-82lmks-lot4) : réglage `cv_verb_tense:{profileId}` (`infinitif` par défaut / `passe-present` / `nominal`) composé avec l'orientation dans `lib/cv-focus-rules.ts` (`bulletForm`, `tenseRule`), contrôle `tense` du garde-fou adapté (`bulletLead`), titre libre manuel (`TargetChoice.titleRule = 'free'`, prioritaire sur l'angle), avertissement `summary-starts-with-title`, bouton « Copier le nouveau prompt ».
- ciblage du CV, étape 5 (branche claude/pensive-turing-82lmks-targeting-5) : interface (`TargetPanel`, `TargetStatusLine`, `useCvTarget`, écran `TargetSheetsSettings`), champs lecteur dédiés (`readerName`, `readerRole`, `referrerName`, jamais dans le prompt ni l'export, retirés de la sauvegarde Drive via `redactTargetPeople`). Voir `specs/008-cv-targeting/`.
- ciblage du CV, étape 4 (branche claude/pensive-turing-82lmks-targeting-4) : garde-fou de ciblage (`lib/cv-target-guard.ts`) : `target-forbidden-term`, `target-equivalence-applied`, `target-photo`, `target-reader-mentioned` (avertissements, `GuardContext.target`). Voir `specs/008-cv-targeting/`.
- ciblage du CV, étape 3 (branche claude/pensive-turing-82lmks-targeting-3) : détection (`lib/cv-target-detect.ts`), champ IA `analyse.cible`, `reconcileAiTarget` (jamais de remplacement silencieux), instantané `cv.settings.target` (`lib/cv-target-snapshot.ts`). Voir `specs/008-cv-targeting/`.
- ciblage du CV, étape 2 (branche claude/pensive-turing-82lmks-targeting-2) : section « Cible et intention » (`lib/cv-target-prompt.ts`), ATS à trois niveaux (`atsLevelFor` : strict / leger / off), dictionnaire annonce/cible (`lib/cv-wording.ts`), règle de titre `equivalence`, orientation par défaut de la fiche. Tout en `auto` = prompt inchangé. Voir `specs/008-cv-targeting/`.
- ciblage du CV, étape 1 (branche claude/pensive-turing-82lmks-targeting-1) : `lib/cv-targets.ts` (types, sept fiches `DEFAULT_TARGET_SHEETS`, `resolveTarget`, `atsEnabledFor`, `titleRuleFor`, `defaultFocusFor`), fiches par profil `cv_target_sheets:{profileId}`. Pas encore branché au prompt. Voir `specs/008-cv-targeting/`.
- orientation du CV (branche claude/pensive-turing-82lmks-bullet-focus) : réglage `cv_bullet_focus:{profileId}` (`missions` par défaut / `resultats`), surcharge `cv.settings.bulletFocus`, `resolveBulletFocus` (CV > profil > défaut de la cible > missions). Tout le texte de prompt dépendant de l'orientation est dans `lib/cv-focus-rules.ts` (jamais en dur ailleurs, test de garde). Garde-fou `too-many-numbers` / `bold-in-missions-mode` / `summary-has-numbers`. Helper commun `lib/profile-settings.ts`.
- 007-cv-engine-evolutions lot 1 (branche claude/pensive-turing-82lmks) : mentions d'en-tête du profil (migration 025 `driving_license` / `header_extras`, `lib/header-extras.ts`), réglages par CV `showDrivingLicense` / `hiddenHeaderExtras`, champ IA optionnel `header` filtré par le garde-fou. Rendu via `profileForHeader` (PrintableCV et export DOCX).
- 005-watch-ai-analysis (branche claude/youthful-mendel-v8v1sf) : analyse IA de la Veille refondue. Pipeline `analysis-loader` -> `analysis-context` -> `analysis-prompt`, retour `watch-analysis/v1` lu par `analysis-patch` (garde-fous, simulation, annulation). Portée des exclusions par terme (`exclusions.ts`, `SearchProfile.excludeScopes`), `requiredDomains`, poids du scorer exportés (`SCORING_WEIGHTS`), apprentissage protégé par le vocabulaire de la piste. Voir `specs/005-watch-ai-analysis/` et `ARCHITECTURE.md` §9.

- 006-watch-sources-health : statuts de source (`lib/watcher/source-status.ts`), pause après refus (`source-cooldown.ts`, migration 021), intitulés français (`french-titles.ts`), doublons (`offer-dedup.ts`), version du scorer et recalcul (`SCORER_VERSION`, `score-recalc.ts`, `stores/scoreRecalcStore.ts`), seuil (`threshold-analysis.ts`), suggestions de blacklist (`blacklist-suggestions.ts`), couverture par source des prompts (`source-coverage.ts`). Jamais de contournement d'anti-robot. Voir `specs/006-watch-sources-health/`.
- 005-cv-angles (branche claude/bold-newton-olmacn) : catégories de compétences rendues en lignes (`lib/skill-lines.ts`), titre sans employeur en double (`lib/entry-display.ts`), règles personnelles par profil (`settings`, clé `cv_personal_rules:{profileId}`), angles de CV (migration 020 `cv_angles`, `lib/cv-angles.ts`, `lib/cv-angle-prompt.ts`, `lib/ai-angle-response.ts`, `stores/angleStore.ts`, tags `angle:<slug>` / `hide:<slug>`). Aucune donnée personnelle dans le dépôt : `docs/angles-affinities.json` est ignoré par git.
- 004-cv-engine-optimization: moteur de CV IA v2 : prompt composable (`lib/cv-prompt.ts`), schéma JSON v2 additif, garde-fou post-LLM (`lib/ai-cv-guard.ts`), compétences en sous-en-têtes, sections vides masquées au rendu (`lib/cv-sections.ts`), langue du CV (`cv.settings.cvLanguage`). Voir `specs/004-cv-engine-optimization/`.
- 002-job-watch-reliability: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner)

- main: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (new), `remark-gfm` ^4.x (new), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existing)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
