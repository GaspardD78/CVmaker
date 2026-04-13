<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Modified principles: N/A
Added sections:
  - Core Principles: added Principle VI (Documentation Language — French Only)
Removed sections: N/A
Templates reviewed:
  - .specify/templates/plan-template.md ✅ (Constitution Check is generic — will include VI automatically on next /speckit-plan run)
  - .specify/templates/spec-template.md ✅ (no constitution reference — no change needed)
  - .specify/templates/tasks-template.md ✅ (no constitution reference — no change needed)
  - .specify/templates/checklist-template.md ✅ (no constitution reference — no change needed)
  - .specify/templates/constitution-template.md ✅ (generic structure — no change needed)
Follow-up TODOs:
  - TODO(LICENSE): License section in resume-forge/README.md is marked "À définir" — define before v1 public release.
  - TODO(BACKFILL): specs/001-markdown-resume-editor/ (spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/) were generated before this amendment and are in English — translate on next revision if needed.
-->

# ResumeForge Constitution

## Core Principles

### I. Local-First, Privacy by Design

All user data MUST be stored locally in the embedded SQLite database. No user data
may be transmitted to any server without explicit user action. Cloud features
(Google Drive sync) MUST remain strictly opt-in and MUST use only the user's own
storage. The application MUST function fully offline with zero mandatory accounts.

**Rationale**: Users trust ResumeForge with sensitive career data. A mandatory cloud
dependency would violate that trust and create a single point of failure.

### II. Cross-Platform Consistency

The application MUST behave identically on Windows, macOS, Linux, and Android.
Platform-specific code MUST be isolated in Tauri capabilities files or clearly
documented Rust/plugin branches. UI layouts MUST adapt responsively (sidebar on
desktop, bottom bar on mobile) without duplicating business logic.

**Rationale**: The promise "available on all platforms" is only meaningful if the
feature set is consistent. Divergence erodes user trust and doubles QA burden.

### III. TypeScript Strict — No Escape Hatches

All frontend code MUST be written in TypeScript with `strict: true`. The use of
`any`, `@ts-ignore`, and `@ts-expect-error` is PROHIBITED except in explicitly
documented interop boundaries (e.g., raw SQLite row types). Every public
interface MUST have a corresponding TypeScript type in `src/types/`.

**Rationale**: The codebase handles structured career data with complex relational
schemas. Type safety is the primary defence against data corruption bugs.

### IV. ATS-Compliant Export (NON-NEGOTIABLE)

DOCX exports MUST NOT use tables, multi-column layouts, text boxes, or headers/
footers. PDF exports MUST use the optimised rendering engine (`export-pdf.ts`).
Every change to export logic MUST be validated against at least one ATS parser
before merge. The four official templates (`ats-classic`, `ats-modern`,
`elegant`, `minimalist`) are the only supported output formats.

**Rationale**: The application's core value proposition is ATS-ready CVs.
Any regression in export compliance directly harms users' job prospects.

### V. Simplicity & YAGNI

Features MUST solve documented user needs. Speculative abstractions, premature
optimisations, and "future-proof" layers are PROHIBITED. Every new dependency
MUST be justified by a concrete, present need recorded in the relevant spec.
The data model (see `resume-forge/README.md`) is the source of truth; schema
changes MUST include a corresponding SQLite migration in `src-tauri/migrations/`.

**Rationale**: A lean codebase is easier to maintain across four platforms and
keeps Tauri build times acceptable.

### VI. Documentation Language — French Only

Tous les documents de spécification, plans d'implémentation et checklists DOIVENT
être rédigés exclusivement en français. Cela couvre :

- Les spécifications de fonctionnalité (`spec.md`)
- Les plans d'implémentation (`plan.md`)
- Les documents de recherche (`research.md`)
- Les modèles de données (`data-model.md`)
- Les contrats d'interface (`contracts/`)
- Les guides de démarrage (`quickstart.md`)
- Les listes de tâches (`tasks.md`)
- Les checklists

**Exception** : les identifiants de code source, commentaires techniques,
noms de fichiers, messages de commit et configurations suivent les conventions
industrielles standard (anglais). Seuls les documents de spécification lisibles
par l'équipe sont couverts par ce principe.

**Rationale** : L'équipe ResumeForge travaille en français. L'utilisation
cohérente du français dans toute la documentation élimine la friction liée à la
traduction, garantit que tous les membres de l'équipe peuvent lire et contribuer
aux specs sans ambiguïté, et évite le coût cognitif du changement de langue.

## Technology Stack

The following technology choices are load-bearing and MUST NOT be replaced without
a constitution amendment:

| Layer | Technology | Version Constraint |
|---|---|---|
| Native shell | Tauri 2 (Rust) | ≥ 2.0 |
| Frontend framework | React | 19.x |
| Language | TypeScript strict | ≥ 5.x |
| Build tool | Vite | 7.x |
| UI system | Tailwind CSS 4 + shadcn/ui + Radix UI | as declared in package.json |
| State management | Zustand | 5.x |
| Database | SQLite via `tauri-plugin-sql` | plugin version per Cargo.toml |
| DOCX export | `docx` (client-side) | as declared in package.json |
| PDF export | `html2canvas` + `jsPDF` | as declared in package.json |
| Testing | Bun test runner | as declared in package.json |

New runtime dependencies MUST be proposed via a spec before being added to
`package.json` or `Cargo.toml`.

## Development Workflow

1. **Branch**: every change starts on a feature branch created via `/speckit.specify`.
2. **Spec first**: a spec MUST exist (`.specify/specs/`) before implementation begins.
3. **Plan**: an implementation plan MUST be produced via `/speckit.plan`.
4. **Tasks**: implementation is broken into discrete tasks via `/speckit.tasks`.
5. **Migration discipline**: any SQLite schema change MUST include a versioned
   migration file (`src-tauri/migrations/NNN_description.sql`).
6. **Export validation**: any change touching `export-docx.ts` or `export-pdf.ts`
   MUST include a manual ATS validation step in the task checklist.
7. **PR gate**: all PRs MUST pass TypeScript type-check (`npm run build`) and
   Bun tests (`bun test`) before merge.

## Governance

- This constitution supersedes all other documented practices. When a conflict
  arises between this document and any other guideline, this document prevails.
- Amendments require: (a) a written rationale, (b) an updated version number
  following semantic versioning, and (c) a propagation check across all templates
  in `.specify/templates/`.
- **MAJOR** bump: removal or fundamental redefinition of a principle or mandatory
  technology.
- **MINOR** bump: addition of a new principle, section, or materially expanded
  guidance.
- **PATCH** bump: clarifications, wording, and non-semantic refinements.
- All PRs MUST include a "Constitution Check" section in the implementation plan
  confirming compliance with the five core principles.
- Complexity violations (e.g., introducing a table in DOCX export, adding a
  mandatory cloud dependency) MUST be tracked in the plan's Complexity Tracking
  table with explicit justification.

**Version**: 1.1.0 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-04-13
