# Modèle de données : Éditeur de CV Markdown en direct

**Phase** : 1 — Conception
**Fonctionnalité** : `001-markdown-resume-editor`
**Date** : 2026-04-13

---

## Entités

### 1. Document CV (extension de `cv_documents`)

La table `cv_documents` existante est étendue avec deux nouvelles colonnes. Aucune
nouvelle table n'est créée.

| Champ | Type | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | TEXT PK | — | `hex(randomblob(16))` | UUID du document |
| `profile_id` | TEXT FK | NON | — | Profil propriétaire |
| `name` | TEXT | NON | — | Nom du document affiché à l'utilisateur |
| `template_id` | TEXT | NON | `'ats-classic'` | Template visuel (ignoré en mode Markdown) |
| `target_job` | TEXT | OUI | NULL | Intitulé de poste pour la personnalisation |
| `target_company` | TEXT | OUI | NULL | Nom de l'entreprise pour la personnalisation |
| `custom_summary` | TEXT | OUI | NULL | Résumé de substitution optionnel |
| `settings` | TEXT | NON | `'{}'` | Sac JSON (stocke le dernier chemin d'export : `settings.lastExportPath`) |
| `is_favorite` | INTEGER | NON | `0` | Indicateur booléen |
| `last_exported` | TEXT | OUI | NULL | Horodatage ISO-8601 du dernier export PDF |
| `markdown_content` | TEXT | OUI | NULL | Texte Markdown brut (rempli avec le modèle de départ à la création) |
| `markdown_mode` | INTEGER | NON | `0` | `0` = constructeur visuel · `1` = éditeur Markdown |
| `created_at` | TEXT | NON | `datetime('now')` | Horodatage de création |
| `updated_at` | TEXT | NON | `datetime('now')` | Horodatage de dernière modification |

**Règles de validation :**
- `markdown_mode` DOIT valoir `0` ou `1` (imposé par une contrainte CHECK dans la migration).
- `markdown_content` NE DOIT PAS être NULL quand `markdown_mode = 1` (imposé au niveau applicatif à la création).
- `updated_at` DOIT être mis à jour à chaque écriture sur `markdown_content` (via le store).

**Transitions d'état :**
```
markdown_mode: 0 (visuel) ──[l'utilisateur bascule le mode]──> 1 (markdown)
markdown_mode: 1 (markdown) ──[l'utilisateur bascule le mode]──> 0 (visuel)
```
Le changement de mode est une action utilisateur stockée en BDD. Les deux représentations coexistent sur la même ligne.

---

### 2. Enregistrement d'export PDF (intégré dans `cv_documents`)

Aucune nouvelle table. Les métadonnées d'export sont stockées sur la ligne du document parent.

| Champ | Où stocké | Description |
|---|---|---|
| Horodatage d'export | `cv_documents.last_exported` | ISO-8601, mis à jour à chaque export réussi |
| Chemin du fichier d'export | `cv_documents.settings` (clé JSON `lastExportPath`) | Chemin absolu choisi par l'utilisateur via la boîte de dialogue |

**Pourquoi intégré** : La spec requiert « une entrée de journal à des fins d'audit/historique ». En v1, le dernier export suffit — une table de journal d'audit complète est un sujet v2 (YAGNI).

---

## Migration

**Fichier** : `resume-forge/src-tauri/migrations/012_markdown_resume.sql`

```sql
-- 012_markdown_resume.sql
-- Ajoute le support de l'éditeur Markdown à cv_documents.
-- markdown_mode : 0 = constructeur visuel (par défaut), 1 = éditeur Markdown

ALTER TABLE cv_documents ADD COLUMN markdown_content TEXT;
ALTER TABLE cv_documents ADD COLUMN markdown_mode    INTEGER NOT NULL DEFAULT 0
  CHECK (markdown_mode IN (0, 1));
```

---

## Types TypeScript

**Fichier** : `resume-forge/src/types/cv.ts` (ajouts)

```typescript
export interface CVDocument {
  // ... champs existants ...
  markdownContent: string | null;   // texte Markdown brut ; null en mode visuel
  markdownMode: 0 | 1;              // 0 = visuel, 1 = markdown
}
```

---

## Modèle de départ

**Fichier** : `resume-forge/src/lib/templates/default-markdown.ts`

Le modèle est une constante TypeScript injectée dans `markdown_content` lors de la
création d'un document avec `markdown_mode = 1`.

Structure (champs fictifs entre `[crochets]`) :

```markdown
# [Votre nom]

[votre.email@exemple.com] · [+33 6 00 00 00 00] · [Ville, Pays]
[linkedin.com/in/votreprofil] · [github.com/votrehandle]

---

## Résumé

[2 à 3 phrases décrivant votre parcours professionnel et vos points forts.]

---

## Expérience

### [Intitulé de poste] — [Nom de l'entreprise]
*[Mois Année] – [Mois Année ou Présent] · [Ville]*

- [Responsabilité ou réalisation clé]
- [Responsabilité ou réalisation clé]
- [Responsabilité ou réalisation clé]

### [Intitulé de poste] — [Nom de l'entreprise]
*[Mois Année] – [Mois Année] · [Ville]*

- [Responsabilité ou réalisation clé]
- [Responsabilité ou réalisation clé]

---

## Formation

### [Diplôme] en [Domaine d'études]
**[Nom de l'université]** · [Année d'obtention]

---

## Compétences

**[Catégorie]** : [Compétence 1], [Compétence 2], [Compétence 3]
**[Catégorie]** : [Compétence 1], [Compétence 2]

---

## Langues

- [Langue] : [Niveau (ex. : Natif, Courant, Intermédiaire)]
- [Langue] : [Niveau]
```

---

## Impact sur les dépendances

| Package | Version | Justification |
|---|---|---|
| `react-markdown` | `^9.x` | Moteur de rendu central pour l'aperçu en direct (FR-001, FR-002) |
| `remark-gfm` | `^4.x` | Extension GFM : tableaux, texte barré, listes de tâches |

Les deux packages sont en JavaScript/TypeScript pur, sans dépendances natives — compatibles avec toutes les cibles Tauri (Windows, macOS, Linux, Android).
