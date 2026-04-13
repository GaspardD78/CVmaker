# Plan d'implémentation : Éditeur de CV Markdown en direct

**Branche** : `main` | **Date** : 2026-04-13 | **Spec** : `specs/001-markdown-resume-editor/spec.md`
**Entrée** : Spécification de fonctionnalité depuis `specs/001-markdown-resume-editor/spec.md`

## Résumé

Ajouter un mode d'édition Markdown à ResumeForge : un éditeur à deux volets (textarea à
gauche, aperçu `react-markdown` à droite) avec un aperçu anti-rebond à 300 ms, une
sauvegarde automatique anti-rebond à 2 s vers SQLite, et un export PDF via le pipeline
Rust `headless_chrome` existant. Deux nouvelles colonnes (`markdown_content`,
`markdown_mode`) sont ajoutées à `cv_documents` via la migration 012 ; aucune nouvelle
table n'est créée. Un modèle de départ TypeScript codé en dur est injecté à la création
du document.

## Contexte technique

**Langage/Version** : TypeScript strict ≥ 5.x (frontend) + Rust édition 2021 (backend Tauri 2)
**Dépendances principales** : React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (nouveau), `remark-gfm` ^4.x (nouveau), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existant)
**Stockage** : SQLite via `tauri-plugin-sql` — deux nouvelles colonnes sur `cv_documents`
**Tests** : Bun test runner
**Plateforme cible** : Windows, macOS, Linux, Android (Tauri 2)
**Type de projet** : Application bureau (Tauri 2)
**Objectifs de performance** : Mise à jour de l'aperçu ≤ 1 s après la dernière frappe (300 ms anti-rebond + rendu React 19) ; sauvegarde automatique dans les 5 s après la frappe (anti-rebond 2 s)
**Contraintes** : Local uniquement (pas de réseau pour l'édition/export), TypeScript `strict: true`, PDF mono-colonne compatible ATS, fonctionnement hors ligne
**Échelle/Périmètre** : Mono-utilisateur, toutes les données dans SQLite local ; les documents jusqu'à ~10 pages doivent se rendre sans ralentissement

## Vérification de la constitution

*GATE : Doit être validé avant la recherche Phase 0. À re-vérifier après la conception Phase 1.*

| Principe | Statut | Notes |
|---|---|---|
| I. Local d'abord, vie privée by design | ✅ PASS | Tout le contenu Markdown stocké dans `cv_documents.markdown_content` (SQLite). Export PDF local via Rust `headless_chrome`. Aucun appel réseau dans le flux d'édition ou d'export. |
| II. Cohérence multi-plateforme | ✅ PASS | `react-markdown` + `<textarea>` sont indépendants de la plateforme. Tauri 2 gère les dialogues de fichiers natifs via `plugin-dialog`. Aucun code UI spécifique à une plateforme introduit. |
| III. TypeScript strict — aucune échappatoire | ✅ PASS | Tous les nouveaux fichiers frontend utilisent `strict: true`. Nouveaux champs ajoutés à l'interface `CVDocument` dans `src/types/cv.ts`. L'interopérabilité avec les lignes SQLite utilise le pattern `keysToCamelCase` existant (frontière déjà documentée). |
| IV. Export compatible ATS | ✅ PASS | Export PDF réutilise `export-pdf.ts` (chemin Rust `generate_pdf`). Markdown rendu en HTML sémantique via `react-markdown` ; les classes Tailwind `prose` imposent une mise en page mono-colonne. Aucun tableau ni multi-colonne dans le DOM exporté. |
| V. Simplicité & YAGNI | ✅ PASS | `react-markdown` + `remark-gfm` justifiés par FR-001/FR-002 (proposition de valeur centrale). Schéma étendu avec 2 colonnes (pas de nouvelle table). Modèle de départ en constante TS. Aucune abstraction spéculative. |
| VI. Langue de documentation — français uniquement | ✅ PASS | Ce plan et tous les artefacts associés sont rédigés en français. |

**Résultat des gates** : TOUS PASS — l'implémentation peut commencer.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/001-markdown-resume-editor/
├── plan.md              # Ce fichier
├── research.md          # Sortie Phase 0 ✅
├── data-model.md        # Sortie Phase 1 ✅
├── quickstart.md        # Sortie Phase 1 ✅
├── contracts/
│   ├── ui-components.md # Sortie Phase 1 ✅
│   └── ipc-commands.md  # Sortie Phase 1 ✅
└── tasks.md             # Sortie Phase 2 (/speckit.tasks — non créé ici)
```

### Code source (resume-forge/)

```text
src/
├── components/
│   ├── cv-builder/          # existant — inchangé
│   └── markdown-editor/     # NOUVEAU
│       ├── MarkdownEditorPage.tsx
│       ├── MarkdownEditorPane.tsx
│       ├── MarkdownPreviewPane.tsx
│       └── ExportWarningDialog.tsx
├── lib/
│   ├── export-pdf.ts        # MODIFIÉ — ajout du paramètre sourceElementId
│   └── templates/
│       └── default-markdown.ts   # NOUVEAU — constante DEFAULT_MARKDOWN_TEMPLATE
├── stores/
│   └── cvStore.ts           # MODIFIÉ — ajout de updateMarkdownContent(), setMarkdownMode()
└── types/
    └── cv.ts                # MODIFIÉ — ajout des champs markdownContent, markdownMode

src-tauri/migrations/
└── 012_markdown_resume.sql  # NOUVEAU
```

**Décision de structure** : Projet unique (existant). L'éditeur Markdown est un nouveau
répertoire de composants sous `src/components/markdown-editor/`. Toutes les
modifications sont additives ; aucun fichier existant n'est supprimé.

## Suivi de la complexité

> Aucune violation de constitution — tableau non requis.
