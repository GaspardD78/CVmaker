# Tâches : Éditeur de CV Markdown en direct

**Entrée** : Documents de conception depuis `specs/001-markdown-resume-editor/`
**Prérequis** : plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organisation** : Les tâches sont regroupées par scénario utilisateur pour permettre
l'implémentation et le test indépendants de chaque scénario.

## Format : `[ID] [P?] [SU?] Description`

- **[P]** : Peut s'exécuter en parallèle (fichiers différents, sans dépendances)
- **[SU]** : Scénario utilisateur associé (SU1, SU2, SU3)
- Les chemins de fichiers exacts sont inclus dans les descriptions

---

## Phase 1 : Configuration

**Objectif** : Initialisation du projet et dépendances

- [x] T001 Installer `react-markdown` et `remark-gfm` via `bun add react-markdown remark-gfm` depuis `resume-forge/`
- [x] T002 Créer la migration SQLite dans `resume-forge/src-tauri/migrations/012_markdown_resume.sql` avec les deux instructions `ALTER TABLE cv_documents ADD COLUMN` pour `markdown_content` et `markdown_mode` (contrainte CHECK incluse)
- [x] T003 [P] Créer le répertoire `resume-forge/src/components/markdown-editor/` (dossier vide qui accueillera les composants)

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : Infrastructure centrale dont dépendent tous les scénarios

**⚠️ CRITIQUE** : Aucun travail sur les scénarios ne peut commencer avant la fin de cette phase

- [x] T004 Ajouter `markdownContent: string | null` et `markdownMode: 0 | 1` à l'interface `CVDocument` dans `resume-forge/src/types/cv.ts`
- [x] T005 Ajouter deux nouvelles actions à `cvStore` dans `resume-forge/src/stores/cvStore.ts` : `updateMarkdownContent(id: string, content: string)` (exécute `UPDATE cv_documents SET markdown_content = ?1, updated_at = datetime('now') WHERE id = ?2` via `enqueueWrite`) et `setMarkdownMode(id: string, mode: 0 | 1)` (même pattern de file d'attente) — dépend de T004
- [x] T006 [P] Ajouter le paramètre optionnel `sourceElementId?: string` (défaut : `'printable-cv'`) à la fonction `exportNativePdf()` dans `resume-forge/src/lib/export-pdf.ts`, en remplaçant le sélecteur d'élément DOM codé en dur par ce paramètre
- [x] T007 Ajouter un bouton de bascule mode (« Constructeur visuel / Éditeur Markdown ») dans `resume-forge/src/components/cv-builder/CVBuilderPage.tsx` qui appelle `cvStore.setMarkdownMode()` et met à jour l'affichage conditionnel — dépend de T005

**Point de contrôle** : Fondations prêtes — le travail sur les scénarios peut commencer en parallèle

---

## Phase 3 : Scénario 1 — Édition Markdown avec aperçu en direct (Priorité : P1) 🎯 MVP

**Objectif** : Interface à deux volets avec aperçu en direct et sauvegarde automatique (FR-001, FR-002, FR-003, FR-008)

**Test indépendant** : Ouvrir l'éditeur Markdown, saisir `# Jane Smith` → le volet droit affiche le rendu dans la seconde. Fermer l'application, la rouvrir → le contenu est restauré.

### Implémentation — Scénario 1

- [x] T008 [P] [SU1] Créer le composant `MarkdownEditorPane` dans `resume-forge/src/components/markdown-editor/MarkdownEditorPane.tsx` : `<textarea className="font-mono h-full w-full resize-none">` contrôlé, prop `value: string`, callback `onChange: (value: string) => void` appelé à chaque `onInput`
- [x] T009 [P] [SU1] Créer le composant `MarkdownPreviewPane` dans `resume-forge/src/components/markdown-editor/MarkdownPreviewPane.tsx` : `<ReactMarkdown remarkPlugins={[remarkGfm]}>` avec classes Tailwind `prose`, enveloppé dans `<div id={printableId ?? 'markdown-printable'}>`, prop `markdown: string`, prop optionnelle `printableId?: string`
- [x] T010 [SU1] Créer `MarkdownEditorPage` dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx` : charge le CV via `cvStore.fetchCvById(cvId)`, gère l'état local `rawMarkdown` (mis à jour à chaque frappe), transmet la valeur anti-rebondée à 300 ms à `MarkdownPreviewPane`, affiche la disposition côte à côte — dépend de T008, T009
- [x] T011 [SU1] Implémenter la sauvegarde automatique anti-rebond à 2 000 ms dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx` : `useEffect` sur `rawMarkdown` avec `setTimeout(2000)` qui appelle `cvStore.updateMarkdownContent(cvId, rawMarkdown)` et affiche une notification `sonner` de confirmation — dépend de T005, T010
- [x] T012 [SU1] Intégrer le rendu conditionnel dans `resume-forge/src/components/cv-builder/CVBuilderPage.tsx` : si `currentCv.markdownMode === 1`, rendre `<MarkdownEditorPage cvId={cvId} />` à la place du constructeur visuel existant — dépend de T007, T010

**Point de contrôle** : Le Scénario 1 est entièrement fonctionnel et testable indépendamment

---

## Phase 4 : Scénario 2 — Export PDF du CV Markdown (Priorité : P2)

**Objectif** : Export PDF fidèle à l'aperçu, sans syntaxe Markdown visible, avec avertissement si document vide (FR-004, FR-005, FR-006)

**Test indépendant** : Rédiger un CV complet en Markdown → cliquer « Exporter en PDF » → ouvrir le PDF dans un lecteur standard → aucun `#`, `*`, `-` visible, texte sélectionnable.

### Implémentation — Scénario 2

- [x] T013 [P] [SU2] Créer `ExportWarningDialog` dans `resume-forge/src/components/markdown-editor/ExportWarningDialog.tsx` : encapsule `@radix-ui/react-dialog`, props `open: boolean`, `onConfirm: () => void`, `onCancel: () => void`, `reason: 'empty' | 'template_unchanged'` ; affiche un message d'avertissement adapté selon `reason`
- [ ] T014 [SU2] Implémenter la logique de détection dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx` : avant tout export, vérifier si `rawMarkdown.trim() === ''` (vide) ou si `rawMarkdown === DEFAULT_MARKDOWN_TEMPLATE` (modèle inchangé) ; si oui, ouvrir `ExportWarningDialog` — dépend de T010, T013
- [ ] T015 [SU2] Implémenter le déclencheur d'export PDF dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx` : appel `await exportNativePdf(cv.name, 'markdown-printable')`, puis mise à jour de `cv_documents` via `cvStore` (`last_exported` = `datetime('now')`, `settings.lastExportPath` = chemin retourné par `plugin-dialog`) ; afficher une notification `sonner` en cas de succès ou d'erreur — dépend de T006, T014

**Point de contrôle** : Les Scénarios 1 et 2 fonctionnent indépendamment

---

## Phase 5 : Scénario 3 — Modèle de départ Markdown (Priorité : P3)

**Objectif** : Pré-remplissage automatique avec un CV modèle structuré à la première ouverture (FR-007)

**Test indépendant** : Créer un nouveau CV en mode Markdown → sans rien saisir, l'éditeur affiche le modèle complet avec les sections coordonnées, expérience, formation, compétences.

### Implémentation — Scénario 3

- [x] T016 [P] [SU3] Créer `resume-forge/src/lib/templates/default-markdown.ts` : exporter la constante `DEFAULT_MARKDOWN_TEMPLATE` contenant le CV modèle complet en français (sections : Résumé, Expérience, Formation, Compétences, Langues) avec des champs fictifs entre `[crochets]`
- [ ] T017 [SU3] Dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx`, ajouter la logique d'initialisation au montage : si `cv.markdownContent === null`, appeler `cvStore.updateMarkdownContent(cvId, DEFAULT_MARKDOWN_TEMPLATE)` et initialiser `rawMarkdown` avec `DEFAULT_MARKDOWN_TEMPLATE` — dépend de T010, T016
- [ ] T018 [SU3] Vérifier dans `resume-forge/src/components/markdown-editor/MarkdownEditorPage.tsx` que l'injection du modèle est strictement conditionnelle à `markdownContent === null` : lors d'une réouverture, `cv.markdownContent` contient déjà le texte utilisateur et le modèle ne doit PAS être réinjecté — dépend de T017

**Point de contrôle** : Les trois scénarios fonctionnent indépendamment

---

## Phase finale : Finitions & aspects transversaux

**Objectif** : Qualité, validation ATS et cohérence

- [ ] T019 [P] Vérifier le typage TypeScript strict avec `bun run build` depuis `resume-forge/` et corriger toute erreur de type introduite par les modifications de `cv.ts`, `cvStore.ts`, `export-pdf.ts` et les nouveaux composants
- [ ] T020 [P] Validation manuelle ATS : exporter un CV Markdown complet en PDF, ouvrir le fichier dans un lecteur PDF standard, vérifier l'absence de symboles Markdown (`#`, `*`, `-`), la sélectionnabilité du texte, l'ordre correct des sections et la lisibilité des polices (gate constitution §IV)
- [ ] T021 Valider le guide de démarrage rapide en suivant les étapes de `specs/001-markdown-resume-editor/quickstart.md` depuis un état de développement propre

---

## Dépendances & ordre d'exécution

### Dépendances entre phases

- **Configuration (Phase 1)** : Aucune dépendance — peut démarrer immédiatement
- **Fondations (Phase 2)** : Dépend de la Phase 1 — **BLOQUE tous les scénarios**
- **Scénarios (Phases 3, 4, 5)** : Tous dépendent de la Phase 2
  - Peuvent ensuite se dérouler en séquence (P1 → P2 → P3) ou partiellement en parallèle
- **Finitions (Phase finale)** : Dépend de la complétion de tous les scénarios souhaités

### Dépendances entre scénarios

- **Scénario 1 (P1)** : Peut démarrer dès la Phase 2 — aucune dépendance sur SU2/SU3
- **Scénario 2 (P2)** : Dépend de SU1 (utilise `MarkdownEditorPage` et `exportNativePdf` modifiée)
- **Scénario 3 (P3)** : Dépend de SU1 (`MarkdownEditorPage` pour l'injection du modèle) ; peut se développer en parallèle avec SU2

### Au sein de chaque scénario

- Composants atomiques (`MarkdownEditorPane`, `MarkdownPreviewPane`) → page composite (`MarkdownEditorPage`) → intégration route
- Export : dialogue d'avertissement → logique de détection → déclencheur d'export
- Modèle : création constante → injection → vérification idempotence

### Opportunités de parallélisme

- T001 + T002 + T003 : configuration initiale en parallèle
- T004 + T006 : types et export-pdf modifiables en parallèle
- T008 + T009 : les deux composants atomiques en parallèle
- T013 + T016 : dialogue d'avertissement et template en parallèle
- T019 + T020 : vérification typage et validation ATS en parallèle

---

## Exemples de parallélisme

```bash
# Phase 1 — tout en parallèle :
Tâche : "T001 Installer react-markdown et remark-gfm"
Tâche : "T002 Créer 012_markdown_resume.sql"
Tâche : "T003 Créer le répertoire markdown-editor/"

# Phase 3 — composants atomiques en parallèle :
Tâche : "T008 Créer MarkdownEditorPane.tsx"
Tâche : "T009 Créer MarkdownPreviewPane.tsx"
# → puis T010 MarkdownEditorPage (dépend des deux)

# Phase 4 + 5 — début en parallèle :
Tâche : "T013 Créer ExportWarningDialog.tsx"
Tâche : "T016 Créer default-markdown.ts"
```

---

## Stratégie d'implémentation

### MVP d'abord (Scénario 1 uniquement)

1. Compléter la Phase 1 : Configuration
2. Compléter la Phase 2 : Fondations (**CRITIQUE — bloque tout**)
3. Compléter la Phase 3 : Scénario 1
4. **STOP & VALIDATION** : tester le Scénario 1 indépendamment
5. Démo/livraison si satisfaisant

### Livraison incrémentale

1. Configuration + Fondations → Infrastructure prête
2. Scénario 1 → Tester indépendamment → Démo (MVP !)
3. Scénario 2 → Tester indépendamment → Démo
4. Scénario 3 → Tester indépendamment → Démo
5. Finitions → Livraison finale

---

## Notes

- `[P]` = fichiers différents, pas de dépendances actives → exécution en parallèle possible
- `[SU]` relie chaque tâche à son scénario utilisateur pour la traçabilité
- Chaque scénario est testable de manière indépendante selon son critère de test
- Valider `bun run build` (typage) et la validation ATS manuelle avant de fermer la fonctionnalité
- Suivre le guide `quickstart.md` comme liste de vérification finale
