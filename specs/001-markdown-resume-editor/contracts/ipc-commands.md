# Contrats de commandes IPC : Éditeur de CV Markdown

**Phase** : 1 — Conception
**Fonctionnalité** : `001-markdown-resume-editor`

---

## Commandes existantes (réutilisées, sans modification)

### `generate_pdf`

**Appelant** : `export-pdf.ts` → `invoke('generate_pdf', { htmlContent, fileName })`
**Backend** : `src-tauri/src/` (utilise la crate Rust `headless_chrome`)
**Modification** : aucune — appelée de manière identique pour l'export Markdown ; seule la source `htmlContent` change (clonée depuis `#markdown-printable` au lieu de `#printable-cv`).

---

## Nouvelles commandes

Aucune requise en v1. Toutes les opérations Markdown (lecture, écriture, sauvegarde anti-rebondée) transitent par le plugin SQLite existant (`tauri-plugin-sql`) via l'abstraction JS-side `getDb()` dans `src/lib/db.ts`.

---

## Opérations SQLite (nouvelles)

Ce ne sont pas des commandes IPC Tauri, mais des instructions SQL ajoutées à `cvStore.ts` :

### À la création du document (mode Markdown)

```sql
UPDATE cv_documents
SET markdown_content = ?1,
    markdown_mode    = 1,
    updated_at       = datetime('now')
WHERE id = ?2;
```

### À la sauvegarde automatique (anti-rebond, toutes les 2 s)

```sql
UPDATE cv_documents
SET markdown_content = ?1,
    updated_at       = datetime('now')
WHERE id = ?2;
```

### Au changement de mode (visuel ↔ Markdown)

```sql
UPDATE cv_documents
SET markdown_mode = ?1,
    updated_at    = datetime('now')
WHERE id = ?2;
```

### À l'export réussi (enregistrement du chemin)

```sql
UPDATE cv_documents
SET last_exported = datetime('now'),
    settings      = json_set(settings, '$.lastExportPath', ?1),
    updated_at    = datetime('now')
WHERE id = ?2;
```
