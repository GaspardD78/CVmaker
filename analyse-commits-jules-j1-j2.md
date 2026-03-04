# Analyse des commits de Jules — Jalon 1 & Jalon 2

## Vue d'ensemble des commits

| Commit | Date | Sujet |
|---|---|---|
| `07caf42` | 03/03 | `feat(ui)` Traduction scaffold en français |
| `47464c7` | 03/03 | `feat` Scaffolding complet (Zustand, shadcn, SQLite, migrations) |
| `cc9467f` | 03/03 | `feat` CRUD complet + utilitaires mapping DB/TS |
| `ed48690` | 03/03 | `feat(ui)` Finaliser formulaire profil + CRUD master entries |
| `edbc152` | 03/03 | `feat(cv)` CV Builder — Jalon 2, Prompt 5 |
| `1c80990` | 03/03 | `refactor(cv)` Dette technique CV Builder |
| `1a003ea` | 03/03 | `feat(export)` Moteurs DOCX + PDF |
| `0f00f0d` | 04/03 | `feat(export)` Template ats-modern + finalisation Jalon 2 |
| `38fd608` | 04/03 | `fix` Dette technique mapping, DOCX, UI |
| `653f7ed` | 04/03 | `feat(cv)` Override inline + fix transaction |
| `52513e7` | 04/03 | `style(export)` Suppression console.error + harmonisation dates |

---

## JALON 1 — Fondations

### ✅ Ce qui est bien fait

**SQL / Base de données (`001_init.sql`)**
- Schéma identique au plan : toutes les 6 tables présentes (`profiles`, `master_entries`, `cv_documents`, `cv_blocks`, `applications`, `application_events`, `settings`)
- Contraintes `CHECK`, `ON DELETE CASCADE/SET NULL`, index correctement définis
- Les migrations sont chargées en Rust via `include_str!("../migrations/001_init.sql")` — plus robuste que le runner TypeScript prévu dans le plan

**Rust `lib.rs`**
- Suit exactement le plan : charge les 4 plugins (`tauri_plugin_sql`, `tauri_plugin_fs`, `tauri_plugin_dialog`, `tauri_plugin_shell`)
- Suppression propre du code `greet` résiduel (commit `ed48690`)

**Types TypeScript (`src/types/`)**
- Mapping complet et strict : `Profile`, `MasterEntry`, `CVDocument`, `CVBlock`, types `EntryType`, `BlockType` correctement définis
- Utilisation de `string | null` plutôt que `?` (compatible avec les valeurs SQLite)

**Stores Zustand (`profileStore`, `cvStore`, `applicationStore`)**
- CRUD complet dans les 3 stores
- Actions async avec `try/catch` + `set({ error })` sur chaque appel DB ✅
- `reorderCvBlocks` avec `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` robuste
- `ROLLBACK` exécuté uniquement si `db` est initialisé (correction commit `653f7ed`) ✅
- Bonne séparation des responsabilités par domaine

**Mapping `mapping.ts`**
- Parsing JSON uniquement sur les champs connus (`JSON_FIELDS = ['metadata', 'tags', 'settings', 'override_data', ...]`) — correction de la version initiale trop agressive (commit `38fd608`)
- Bidirectionnel : `keysToCamelCase` et `keysToSnakeCase`

**`db.ts`**
- Singleton correct pour la connexion SQLite
- Guard `__TAURI_INTERNALS__` pour éviter le crash en contexte navigateur pur ✅

### ⚠️ Points à surveiller

**`profileStore.ts:31-36` — Profil par défaut "John Doe"**
```typescript
await db.execute(
  `INSERT INTO profiles (first_name, last_name, email) VALUES ($1, $2, $3)`,
  ['John', 'Doe', 'john.doe@example.com']
);
```
Le plan ne prévoit pas de profil par défaut codé en dur.
→ À remplacer par un formulaire de création à la première utilisation.

**`mapping.ts:57-59` — Fallback de sérialisation JSON**
```typescript
} else if (typeof value === 'object' && value !== null) {
    value = JSON.stringify(value); // Sérialise TOUT objet inattendu
}
```
Peut créer des données corrompues si un objet `Date` ou autre se glisse dans les données à sérialiser.

**`any` dans les stores (`Record<string, any>`)**
Présents dans les stores profileStore/cvStore/applicationStore pour les appels `keysToSnakeCase`. Documentés dans les règles du plan ("aucun `any` sauf dans les types de mapping DB"), mais `Record<string, unknown>` serait plus strict.

### Livrables Jalon 1

| Livrable | Status |
|---|---|
| App Tauri démarre sans erreur | ✅ (structure présente) |
| SQLite initialisé avec toutes les tables | ✅ |
| CRUD Profil fonctionnel | ✅ |
| CRUD Master Entries fonctionnel | ✅ |
| Navigation entre les 4 pages | ✅ (React Router + Layout sidebar) |
| Store Zustand synchronisé avec SQLite | ✅ |

**Jalon 1 : complet à ~95%**

---

## JALON 2 — CV Builder

### ✅ Ce qui est bien fait

**Architecture des composants**
- Découpage propre : `CVList`, `CVBuilderPage`, `LeftPanel`, `RightPanel`, `SectionItem`, `EntrySelector` — un composant = un fichier ✅
- DnD Kit (`@dnd-kit/sortable`) pour réordonner les sections du panneau gauche ✅

**Export DOCX (`export-docx.ts`)**
- Respect strict des règles ATS :
  - `useColumns: false`, `useTables: false` ✅
  - Vrais styles Word (`HeadingLevel.HEADING_1`, `HEADING_2`) ✅
  - Puces avec `LevelFormat.BULLET` + config `numbering` ✅
  - Plus aucun `console.log` / `console.error` (nettoyé en `52513e7`) ✅
- Formatage des dates via `Intl.DateTimeFormat('fr-FR', { month: 'long' })` cohérent entre DOCX et prévisualisation PDF (harmonisé commit `52513e7`)
- `override_data` appliqué correctement : `{ ...entry, ...block.overrideData }` ✅
- Dialogue natif "Enregistrer sous" via `tauri-plugin-dialog` + écriture `tauri-plugin-fs` ✅

**Export PDF (`export-pdf.ts`)**
- Minimaliste mais fonctionnel : `window.print()` — conforme à l'approche 1 recommandée dans le plan
- Composant `PrintableCV` dédié avec styles `@media print`

**Templates**
- 2 templates ATS : `ats-classic` (Calibri) et `ats-modern` (Arial, interligne 1.5) ✅
- Registre centralisé `getTemplate(id)` avec fallback sur `ats-classic` ✅
- Sélecteur de template intégré dans `CVBuilderPage` ✅

**Override inline (`SectionItem.tsx`)**
- Édition inline de `title`, `subtitle`, `description` par bloc sans toucher le profil maître ✅
- Sauvegarde dans `override_data` via `updateCvBlock`

**Duplication de CV**
- Utilise `INSERT ... RETURNING id` (commit `1c80990`) pour récupérer l'ID de manière fiable ✅
- Duplique aussi les blocs associés ✅

### ⚠️ Points à surveiller

**TODOs non résolus (prévus Jalon 10)**
```
SectionItem.tsx:37   // TODO: Utiliser une boîte de dialogue personnalisée
CVList.tsx:97        // TODO: Remplacer par une modal custom
CVBuilderPage.tsx:34,37  // TODO: Replace with proper toast
```
Comportement attendu : suppressions sans confirmation pour l'instant. Documenté et cohérent avec le plan (Prompt 10). Les erreurs sont dans le store mais pas affichées à l'utilisateur.

**`export-docx.ts` — Champ `location` absent**
Les champs `location` des `MasterEntry` (ex: "Paris", "Lyon") ne sont pas rendus dans le DOCX. Pour les expériences et formations, afficher la localisation améliorerait la complétude du CV.

**`SectionItem.tsx` — État local non réinitialisé au changement de bloc**
Les états `overrideTitle`, `overrideSubtitle`, `overrideDescription` sont locaux et initialisés via `startEditing()`. Si le composant est réutilisé, les anciennes valeurs peuvent persister.

### Livrables Jalon 2

| Livrable | Status |
|---|---|
| Créer / dupliquer / supprimer un CV | ✅ |
| Éditeur de blocs panneau gauche + prévisualisation | ✅ |
| Drag-and-drop sections et entrées | ✅ (DnD Kit) |
| Sélection d'entrées depuis le profil maître | ✅ (`EntrySelector`) |
| Override de contenu par CV | ✅ (inline via `SectionItem`) |
| Au moins 2 templates ATS | ✅ (Classic + Modern) |
| Export DOCX ATS-compatible | ✅ |
| Export PDF fonctionnel | ✅ (`window.print()`) |
| Sauvegarde via dialogue natif | ✅ |

**Jalon 2 : complet à ~90%** (manque confirmations suppression + toasts utilisateur)

---

## Résumé global

### Forces
- Suivi fidèle du plan technique dans les deux jalons
- Code propre, découpé, typé
- Corrections de dette technique commités séparément (bonne hygiène git)
- Respect strict des règles ATS dans l'export DOCX
- Transactions SQLite pour les opérations critiques (reorder)

### Actions recommandées pour la suite

1. **Supprimer le profil "John Doe" par défaut** → créer un onboarding minimal (formulaire de première utilisation)
2. **Toasts d'erreur/succès** (Prompt 10) → les erreurs sont dans le store mais invisibles pour l'utilisateur
3. **Modales de confirmation** avant suppression CV/bloc (Prompt 10)
4. **Afficher `location`** des entrées dans le rendu DOCX
5. **Corriger le fallback JSON** de `keysToSnakeCase` pour éviter des corruptions silencieuses sur des objets inattendus
