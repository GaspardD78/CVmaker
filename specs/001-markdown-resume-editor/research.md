# Recherche : Éditeur de CV Markdown en direct

**Phase** : 0 — Cadrage & Recherche
**Fonctionnalité** : `001-markdown-resume-editor`
**Date** : 2026-04-13

---

## R-01 — Bibliothèque de parsing et d'édition Markdown

**Décision :** `react-markdown` + `remark-gfm` pour le rendu de l'aperçu ; `<textarea>` simple pour la saisie.

**Justification :**
- `react-markdown` produit un arbre de composants React à partir du Markdown (sans `innerHTML`), ce qui élimine tout risque XSS — important car le contenu rédigé par l'utilisateur est rendu directement.
- Compatible React 19 ; produit du HTML sémantique (`<h1>`, `<ul>`, `<strong>`) qui hérite naturellement des classes Tailwind `prose`.
- Léger (~15 Ko gzippé) et sans conflits de dépendances avec les packages Radix/shadcn existants.
- `remark-gfm` ajoute le Markdown saveur GitHub (tableaux, texte barré, listes de tâches) à un coût négligeable.
- Un `<textarea>` simple correspond à la philosophie du projet de minimiser les dépendances ; la base de code existante utilise des inputs HTML bruts dans tout `cv-builder`.

**Alternatives évaluées :**
- **marked** (autonome) : Plus rapide mais produit une chaîne HTML nécessitant `dangerouslySetInnerHTML` et un sanitiseur DOMPurify séparé — ajoute une dépendance et une surface XSS.
- **CodeMirror / Monaco** : Éditeurs complets avec IDE intégré ; ajoutent 500 Ko+ et une surface de configuration non justifiée par la spec.
- **remark** (headless) : Flexibilité maximale mais nécessite de construire l'intégration React from scratch ; trop ambitieux pour la v1.

---

## R-02 — Intervalles d'anti-rebond

**Décision :**
- **Mise à jour de l'aperçu** : anti-rebond à 300 ms après la dernière frappe.
- **Sauvegarde automatique** : anti-rebond à 2 000 ms après la dernière frappe.

**Justification :**
- 300 ms pour l'aperçu satisfait le critère d'acceptance « ≤ 1 seconde » (FR-002) tout en évitant les re-rendus React excessifs lors d'une frappe rapide. Le batching React 19 signifie que le rendu n'est pas le goulot d'étranglement.
- 2 000 ms pour la sauvegarde automatique laisse à `enqueueWrite()` (déjà dans `cvStore.ts`) le temps de vider les écritures en cours avant que la prochaine sauvegarde n'arrive, réduisant la contention de verrou SQLite. Satisfait SC-005 (sauvegarde automatique dans les 5 s après la frappe).
- Les deux anti-rebonds résident dans la couche UI (`useEffect` + `setTimeout`), laissant le store ignorant des contraintes de timing.

**Alternatives évaluées :**
- **Sauvegarde automatique à 1 000 ms** : Techniquement sûr avec `enqueueWrite`, mais n'offre aucune marge sur du matériel lent.
- **Pas d'anti-rebond sur l'aperçu** : Dégradation du DOM à chaque frappe ; saccades visibles sur les documents longs.

---

## R-03 — Stratégie de stockage en base de données

**Décision :** Ajouter deux colonnes à la table `cv_documents` existante via la migration `012_markdown_resume.sql` :
```sql
ALTER TABLE cv_documents ADD COLUMN markdown_content TEXT;
ALTER TABLE cv_documents ADD COLUMN markdown_mode   INTEGER NOT NULL DEFAULT 0;
```
`markdown_mode = 0` → constructeur visuel ; `markdown_mode = 1` → éditeur Markdown.

**Justification :**
- Un CV Markdown est une représentation alternative du même document `cv_documents` (même profil, même nom, même export). Une relation 1:1 ne justifie pas une nouvelle table.
- Deux instructions ALTER TABLE constituent la modification de schéma la plus minime ; pas de JOIN, pas de FK, pas de cascade de migration.
- Cohérent avec le pattern déjà utilisé dans `cv_documents` (`custom_summary TEXT`, `settings TEXT DEFAULT '{}'`).
- `last_exported` capture déjà l'horodatage de l'export. Le chemin du fichier d'export peut être stocké dans le JSON `settings` (pas de nouvelle colonne nécessaire en v1).

**Alternatives évaluées :**
- **Table `markdown_documents` séparée** : Dupliquerait `profile_id`, `name`, `last_exported` ; nécessite une FK et un JOIN sur chaque requête de liste de CV. Trop complexe pour une relation 1:1.
- **Stocker le Markdown dans `override_data` sur les blocs** : Mauvaise granularité — le Markdown est du contenu au niveau document, pas des surcharges de bloc.

---

## R-04 — Stratégie d'export PDF

**Décision :** Réutiliser `export-pdf.ts` sans modification en rendant l'aperçu Markdown dans un `<div id="markdown-printable">` caché. `exportNativePdf()` reçoit un paramètre `sourceElementId` (par défaut `'printable-cv'`) pour sélectionner la source DOM.

**Justification :**
- `export-pdf.ts` est indépendant du format : il clone un sous-arbre DOM, intègre les feuilles de style, convertit les images en base64, et appelle `invoke('generate_pdf')`. L'élément source est la seule variable.
- Passer `sourceElementId` laisse l'export du constructeur visuel inchangé (aucun risque de régression) tout en activant l'export Markdown avec un simple changement de paramètre.
- Le volet d'aperçu Markdown rend déjà du HTML stylisé via `react-markdown` + Tailwind ; aucun template séparé n'est nécessaire.
- Headless Chrome (crate Rust `headless_chrome`) produit des PDF vectorisés et dont le texte est sélectionnable — satisfait SC-004 (s'ouvre dans n'importe quel lecteur PDF).

**Alternatives évaluées :**
- **Template PDF Markdown dédié (fichier HTML séparé)** : Dupliquerait la logique d'intégration des styles et de conversion base64. Viole le principe DRY.
- **Fallback `html2canvas` + `jsPDF` uniquement** : Produit une sortie pixelisée (texte non sélectionnable). La constitution (§IV) impose le chemin `export-pdf.ts` optimisé.

---

## R-05 — Stratégie du modèle de départ

**Décision :** Coder le modèle en dur comme une constante TypeScript multilignes dans `src/lib/templates/default-markdown.ts`, injectée lors de la création d'un nouveau document Markdown dans `cvStore.createCv()`.

**Justification :**
- Zéro migration de BDD, zéro logique d'initialisation. Un simple `export const DEFAULT_MARKDOWN_TEMPLATE = \`...\`` est l'implémentation la plus simple possible.
- Le modèle est immuable (même contenu pour chaque utilisateur, chaque installation) — aucune raison de le stocker en BDD tant qu'il n'existe pas plusieurs modèles sélectionnables (v2+).
- Précédent : `001_init.sql` code en dur `default_template = 'ats-classic'` ; `cvStore.createCv()` initialise déjà des blocs de CV. C'est le même pattern.
- Le scénario d'acceptance 2 (modèle remplacé à la sauvegarde) est géré naturellement : l'utilisateur édite `markdown_content`, la sauvegarde automatique écrase le texte du modèle, et à la prochaine ouverture le contenu de l'utilisateur est affiché — pas besoin de flag ni de logique de détection.

**Alternatives évaluées :**
- **Stocker le modèle dans la table SQLite `settings`** : Ajoute une migration et une clé de paramètre sans bénéfice à l'exécution ; sur-ingénierie pour une chaîne immuable unique.
- **Télécharger depuis une API externe** : Introduit une dépendance réseau au premier lancement. Viole le Principe I (Local d'abord).
