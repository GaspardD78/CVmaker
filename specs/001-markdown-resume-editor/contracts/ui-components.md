# Contrats de composants UI : Éditeur de CV Markdown

**Phase** : 1 — Conception
**Fonctionnalité** : `001-markdown-resume-editor`

---

## MarkdownEditorPage

**Chemin** : `src/components/markdown-editor/MarkdownEditorPage.tsx`
**Route** : réutilise la route de détail CV existante ; rendu conditionnel basé sur `cv.markdownMode === 1`

```typescript
interface MarkdownEditorPageProps {
  cvId: string;   // chargé depuis les paramètres de route
}
```

**Comportement** :
- Au montage : charge la ligne `cv_documents` via `cvStore.fetchCvById(cvId)`.
- Si `markdownContent` est null (nouveau document) : initialise avec `DEFAULT_MARKDOWN_TEMPLATE` et sauvegarde.
- Affiche une disposition à deux volets : `MarkdownEditorPane` (gauche) + `MarkdownPreviewPane` (droite).
- Gère l'état d'anti-rebond pour l'aperçu (300 ms) et la sauvegarde automatique (2 000 ms).
- Affiche une notification `<Toaster>` après une sauvegarde réussie (pattern `sonner` existant).

---

## MarkdownEditorPane

**Chemin** : `src/components/markdown-editor/MarkdownEditorPane.tsx`

```typescript
interface MarkdownEditorPaneProps {
  value: string;
  onChange: (value: string) => void;   // appelé à chaque frappe
}
```

**Comportement** :
- Affiche un `<textarea>` avec `className="font-mono"` remplissant son conteneur.
- Appelle `onChange` de manière synchrone à chaque événement `onInput`.
- `value` est contrôlé (le parent gère l'état).
- Pas d'anti-rebond interne — le parent gère le timing.

**Gate d'acceptance** : la saisie de `# Jane Smith` doit déclencher `onChange` dans le même tour de boucle d'événements.

---

## MarkdownPreviewPane

**Chemin** : `src/components/markdown-editor/MarkdownPreviewPane.tsx`

```typescript
interface MarkdownPreviewPaneProps {
  markdown: string;           // valeur anti-rebondée (300 ms)
  printableId?: string;       // par défaut : "markdown-printable"
}
```

**Comportement** :
- Affiche `<ReactMarkdown remarkPlugins={[remarkGfm]}>` avec les classes Tailwind `prose`.
- Enveloppe la sortie dans un `<div id={printableId}>` utilisé par `export-pdf.ts` comme source DOM.
- Le `<div>` est toujours visible dans le volet (non caché) ; `export-pdf.ts` le clone au moment de l'export.
- Ne doit pas planter sur du Markdown malformé (`react-markdown` gère cela nativement).

**Gate de performance** : doit re-rendre en ≤ 1 s sur un document de 10 pages (entrée anti-rebondée, React 19 concurrent rendering gère le reste).

---

## ExportWarningDialog

**Chemin** : `src/components/markdown-editor/ExportWarningDialog.tsx`

```typescript
interface ExportWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reason: 'empty' | 'template_unchanged';
}
```

**Comportement** :
- Encapsule `@radix-ui/react-dialog` (déjà dans les dépendances du projet).
- S'affiche quand la condition FR-006 est remplie : le document est vide OU égal au modèle de départ non modifié.
- `reason` détermine le texte du message d'avertissement.
- `onConfirm` poursuit l'export ; `onCancel` ferme la boîte de dialogue.

---

## Intégration de l'export

Modification de `export-pdf.ts` : ajout d'un paramètre `sourceElementId` optionnel.

```typescript
// Signature actuelle (inférée) :
export async function exportNativePdf(cvName: string): Promise<void>

// Nouvelle signature :
export async function exportNativePdf(
  cvName: string,
  sourceElementId?: string   // par défaut : 'printable-cv'
): Promise<void>
```

L'éditeur Markdown appelle :
```typescript
await exportNativePdf(cv.name, 'markdown-printable');
```

Aucune modification des points d'appel du constructeur visuel existant.
