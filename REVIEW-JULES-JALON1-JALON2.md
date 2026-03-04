# Review des commits Jules — Jalon 1 & Jalon 2

**Date :** 2026-03-04
**Reviewer :** Claude (analyse automatisée)
**Branche analysée :** `main` (commits `07caf42` à `0f00f0d`)

---

## Vue d'ensemble

8 commits par `google-labs-jules[bot]`, répartis sur 2 branches de features, tous mergés dans `main`.

| Jalon | Commits | Fichiers modifiés | Lignes ajoutées |
|---|---|---|---|
| **Jalon 1** | 4 commits (`07caf42` → `ed48690`) | ~70 fichiers | ~10 500+ |
| **Jalon 2** | 4 commits (`edbc152` → `0f00f0d`) | ~25 fichiers | ~1 460+ |

**Compilation TypeScript :** `tsc --noEmit` passe avec **0 erreur** (après npm install).

---

## JALON 1 — Fondations

### Commit 1 — `07caf42` — Scaffold Tauri + traduction FR
- Scaffold complet Tauri v2 + React + Vite + TypeScript
- Configuration `lib.rs` avec tous les plugins : sql, fs, dialog, shell, opener
- Traduction initiale de l'UI en français

### Commit 2 — `47464c7` — Types, Stores, Migration SQL
- `001_init.sql` : schéma SQLite complet (6 tables + indexes + settings) — **100% conforme au plan**
- Types TypeScript : `profile.ts`, `cv.ts`, `application.ts`
- Stores Zustand : 3 stores avec state + actions async
- Config shadcn/ui + `db.ts` (singleton SQLite)
- Migration Rust via `include_str!` + `tauri_plugin_sql::Migration`

### Commit 3 — `cc9467f` — CRUD + Mapping DB/TS
- `mapping.ts` : `keysToCamelCase` / `keysToSnakeCase` avec parsing JSON auto
- CRUD SQLite complet dans les 3 stores
- `Layout.tsx` avec sidebar FR + icônes
- `ProfilePage.tsx` initial

### Commit 4 — `ed48690` — Formulaire profil complet + CRUD entries
- Formulaire profil avec tous les champs (13 champs + résumé)
- CRUD complet Master Entries (ajouter, modifier, supprimer)
- Suppression du code Rust résiduel (`greet`)
- Sécurité `db.ts` : détection contexte non-Tauri

### Checklist Jalon 1

| Livrable attendu | Statut | Notes |
|---|---|---|
| App Tauri démarre sans erreur | **OK** | Scaffold correct, TS compile |
| SQLite initialisé avec toutes les tables | **OK** | 6 tables + indexes + settings |
| CRUD Profil fonctionnel | **OK** | Create auto, Update, Read |
| CRUD Master Entries fonctionnel | **OK** | Add, Update, Delete + UI |
| Navigation entre les 4 pages | **OK** | `/`, `/profile`, `/cv`, `/tracker` + `/cv/:id` |
| Store Zustand synchronisé avec SQLite | **OK** | 3 stores, tous avec appels DB async |

---

## JALON 2 — CV Builder

### Commit 5 — `edbc152` — CV Builder initial
- `CVList.tsx` : liste CVs + création, suppression, duplication
- `CVBuilderPage.tsx` : layout éditeur split (gauche + prévisualisation)
- `LeftPanel.tsx` : DnD des blocs via `@dnd-kit/sortable`
- `EntrySelector.tsx` : tiroir latéral pour piocher dans le master
- Store `cvStore.ts` complété avec CRUD blocs + réordonnancement

### Commit 6 — `1c80990` — Correction dette technique
- `RETURNING id` au lieu de `SELECT` fragile pour duplication
- Transaction SQLite (`BEGIN`/`COMMIT`/`ROLLBACK`) pour réordonnancement
- Suppression des `window.confirm()` natifs

### Commit 7 — `1a003ea` — Moteurs d'export DOCX + PDF
- `export-docx.ts` : 275 lignes, génération DOCX avec la lib `docx`
- `PrintableCV.tsx` : composant React avec `forwardRef` + styles print
- Template `ats-classic.ts` + types `CVTemplate`
- Dialogue natif "Enregistrer sous" via `@tauri-apps/plugin-dialog`

### Commit 8 — `0f00f0d` — Template ATS Modern + finalisation
- `ats-modern.ts` : 2e template (Arial, accents bleus, plus d'espacement)
- Registry dans `templates/index.ts`

### Checklist Jalon 2

| Livrable attendu | Statut | Notes |
|---|---|---|
| Créer / dupliquer / supprimer un CV | **OK** | CVList avec les 3 opérations |
| Éditeur de blocs (gauche + préview droite) | **OK** | Split panel conforme au plan |
| Drag-and-drop des sections | **OK** | @dnd-kit/sortable fonctionnel |
| Sélection d'entrées depuis le master | **OK** | EntrySelector avec tiroir latéral |
| Override de contenu par CV | **PARTIEL** | Type existe, aucune UI pour l'éditer |
| 2 templates ATS (Classic + Modern) | **OK** | ats-classic + ats-modern |
| Export DOCX ATS-compatible | **OK** | Pas de tables ni colonnes, vrais styles |
| Export PDF fonctionnel | **OK** | `window.print()` + styles `@media print` |
| Sauvegarder via dialogue natif | **OK** | `@tauri-apps/plugin-dialog` + `plugin-fs` |

---

## Problèmes identifiés

### Critiques

| # | Fichier | Problème |
|---|---|---|
| 1 | `export-docx.ts:22` | Usage de `any[]` — viole la règle "TypeScript strict, aucun any" |
| 2 | `export-docx.ts:157-175` | Pas de puces `LevelFormat.BULLET` — le plan impose des puces ATS standard |
| 3 | `mapping.ts:26` | Parsing JSON heuristique : toute chaîne commençant par `{` ou `[` est auto-parsée, risque de corruption de données texte |

### Importants

| # | Fichier | Problème |
|---|---|---|
| 4 | CV Builder | Override de contenu : champ `override_data` existe mais aucune UI pour l'éditer |
| 5 | Templates | `lineSpacing` configuré mais jamais appliqué dans le DOCX |
| 6 | `export-docx.ts:228` | Page size A4 non définie (manque `width: 11906, height: 16838`) |
| 7 | `src/lib/` | Pas de fichier `migrations.ts` côté TS (migrations faites en Rust) |
| 8 | `profileStore.ts:33` | Profil par défaut "John Doe" au lieu d'un formulaire de setup |
| 9 | `CVBuilderPage.tsx:35` | `console.log` en production (interdit par les règles) |
| 10 | `CVBuilderPage.tsx:39` | `alert()` natif au lieu de toasts |
| 11 | `ProfilePage.tsx` | Pas de filtrage par onglets (le plan demande un onglet par type d'entrée) |
| 12 | `ProfilePage.tsx:246` | Manque `interest` et `volunteer` dans le `<select>` |
| 13 | CV Builder | Pas de sélecteur de template dans l'éditeur (fixé à ats-classic) |
| 14 | CV Builder | Pas de formulaire pour `targetJob`, `targetCompany`, `customSummary` |
| 15 | CV Builder | Pas de bloc `custom_text` créable via l'UI |
| 16 | `CVList.tsx:98` | Suppression sans aucune confirmation |

### Mineurs

| # | Fichier | Problème |
|---|---|---|
| 17 | Projet | shadcn/ui configuré mais aucun composant utilisé |
| 18 | `src/` | Pas de dossier `hooks/` (prévu dans le plan) |
| 19 | `mapping.ts` | Commentaires en anglais (plan impose le français) |
| 20 | `RightPanel.tsx` | `PrintableCV` utilise `forwardRef` mais le `ref` n'est jamais passé |
| 21 | `export-pdf.ts` | 3 lignes de code : très minimaliste |

---

## Résumé des notes

| Critère | Note |
|---|---|
| Conformité schéma SQL | **10/10** |
| Architecture (stores, types, routing) | **8/10** |
| UI / UX | **6/10** |
| Export DOCX | **7/10** |
| Export PDF | **5/10** |
| Respect strict des règles de code | **6/10** |
| Robustesse | **7/10** |

---

## Verdict

Jules a livré un travail **solide sur les fondations** : schéma SQL parfait, architecture stores/types/routing correcte, TypeScript compile sans erreur. Le CV Builder fonctionne avec DnD, prévisualisation temps réel et export.

**Écarts notables avec le plan :**
- Override UI manquant (livrable Jalon 2 incomplet)
- Puces DOCX ATS absentes (`LevelFormat.BULLET`)
- shadcn/ui non utilisé (tous les composants sont en HTML brut + Tailwind)
- Plusieurs violations des règles de code (`any`, `console.log`, commentaires EN)
- Dashboard et Tracker sont des placeholders vides

**Recommandations prioritaires :**
1. Ajouter `LevelFormat.BULLET` pour la conformité ATS
2. Créer l'UI d'édition des overrides par CV
3. Remplacer `alert()`/`console.log` par un système de toasts
4. Ajouter confirmation avant suppression
5. Compléter le formulaire d'entrées (types manquants, onglets)
6. Intégrer les composants shadcn/ui
