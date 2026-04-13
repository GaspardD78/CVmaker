# Démarrage rapide : Éditeur de CV Markdown

**Pour** : le développeur qui prend en charge les tâches d'implémentation
**Fonctionnalité** : `001-markdown-resume-editor`

---

## Prérequis

```bash
# Depuis resume-forge/
bun install                             # installer les dépendances existantes
bun add react-markdown remark-gfm      # nouvelles dépendances pour cette fonctionnalité
```

Vérifier que les deux packages sont bien listés dans `dependencies` de `package.json`.

---

## Lancer en développement

```bash
# Depuis resume-forge/
bun run tauri dev               # démarre Vite + le shell Tauri
```

L'éditeur Markdown sera accessible depuis la liste des CV : créer ou ouvrir un CV qui a `markdown_mode = 1`.

---

## Fichiers clés à lire en premier

| Fichier | Pourquoi |
|---|---|
| `src/stores/cvStore.ts` | Ajouter ici `updateMarkdownContent()` et `setMarkdownMode()` |
| `src/types/cv.ts` | Ajouter `markdownContent` et `markdownMode` à `CVDocument` |
| `src/lib/export-pdf.ts` | Ajouter le paramètre `sourceElementId` |
| `src-tauri/migrations/012_markdown_resume.sql` | Exécutée automatiquement au prochain lancement via `tauri-plugin-sql` |
| `src/lib/templates/default-markdown.ts` | Créer ce fichier avec `DEFAULT_MARKDOWN_TEMPLATE` |

---

## Migration de base de données

La migration `012_markdown_resume.sql` s'exécute automatiquement au démarrage de l'application (`tauri-plugin-sql` applique toutes les migrations en attente dans l'ordre). Aucune étape manuelle n'est nécessaire.

Pour vérifier en développement, ouvrir la BDD SQLite et contrôler :
```sql
PRAGMA table_info(cv_documents);
-- Doit afficher les colonnes markdown_content et markdown_mode
```

---

## Créer un document de test

Dans l'interface : créer un nouveau CV → basculer en mode Markdown (bouton à ajouter sur `CVBuilderPage` ou `CVList`). L'éditeur s'ouvre pré-rempli avec le modèle de départ.

Ou directement en SQLite (pour les tests) :
```sql
-- Insérer un document Markdown de test
INSERT INTO cv_documents (profile_id, name, markdown_mode, markdown_content)
VALUES ('<votre-profile-id>', 'CV Markdown Test', 1, '# Jean Dupont\n\nContenu de test');
```

---

## Lancer les tests

```bash
# Depuis resume-forge/
bun test
```

Nouveaux tests à ajouter (voir `tasks.md` une fois généré) :
- Unitaire : logique d'anti-rebond dans `MarkdownEditorPage`
- Unitaire : détection document vide/modèle inchangé pour l'avertissement FR-006
- Intégration : cycle complet sauvegarde automatique (écriture → lecture depuis SQLite)

---

## Vérifier l'export PDF

1. Ouvrir un CV Markdown avec du contenu.
2. Cliquer sur « Exporter en PDF ».
3. Vérifier : aucun `#`, `*`, `-` de syntaxe Markdown dans le rendu.
4. Ouvrir dans un lecteur PDF standard — tout le texte doit être sélectionnable (non pixelisé).
