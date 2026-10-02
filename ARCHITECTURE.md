# Architecture — rendu des CV et export PDF

> Cartographie du rendu des CV dans ResumeForge (`resume-forge/`), écrite avant
> la pose des golden tests. Ce document décrit le code tel qu'il est, sans
> proposer de changement. Les chemins sont relatifs à `resume-forge/`.

## 1. Stack

| Couche | Technologie |
|---|---|
| Application | Tauri 2 (desktop Windows/macOS/Linux + Android) |
| Frontend | React 19, TypeScript strict (~5.8), Vite 7, Zustand 5 |
| Styles | Tailwind CSS 4 (`@import "tailwindcss"` dans `src/App.css`), shadcn/ui + Radix |
| Données | SQLite via `tauri-plugin-sql` (`src/lib/db.ts`, migrations dans `src-tauri/src/lib.rs`) |
| Export PDF (desktop) | Commande Rust `generate_pdf` → crate `headless_chrome` → Chrome/Chromium du système |
| Export PDF (Android) | `html2canvas-pro` + `jspdf` (PDF bitmap) |
| Export PDF (navigateur) | `window.print()` |
| Export DOCX | lib `docx` (`src/lib/export-docx.ts`), pipeline séparé |
| Tests | `bun test` (tests unitaires sur `src/lib/**`, aucun test sur le rendu à ce jour) |

## 2. Schéma de données du CV

Un CV rendu combine **4 objets**, tous passés en props à `PrintableCV` :

```
Profile (1)  ──<  MasterEntry (n)          ← bibliothèque d'expériences, compétences…
   │                    ▲
   │                    │ entryId
CVDocument (1) ──<  CVBlock (n)           ← composition ordonnée du CV
   │
   └─ templateId ──► CVTemplate (objet TS statique, src/templates/*.ts)
```

### `Profile` (`src/types/profile.ts`)
Identité et coordonnées : `firstName`, `lastName`, `email`, `phone`, `city`,
`linkedinUrl`, `githubUrl`, `portfolioUrl`, `photoPath` (data URL base64),
`title` (intitulé de poste par défaut), `summary` (résumé par défaut).
`address`, `postalCode`, `country` existent mais **ne sont pas rendus**.

### `MasterEntry` (`src/types/profile.ts`)
Une ligne de la bibliothèque. `entryType` ∈ `experience | education | skill |
certification | language | interest | project | volunteer`. Champs rendus :
`title`, `subtitle`, `location`, `startDate`, `endDate`, `isCurrent`,
`description` (mini-Markdown : `- ` listes, `**gras**`, `*italique*`).

### `CVDocument` (`src/types/cv.ts`)
- `templateId` → choisit le `CVTemplate`.
- `targetJob` / `customSummary` → **priment** sur `profile.title` / `profile.summary`.
- `settings: Record<string, unknown>` → réglages de design libres (clé/valeur),
  interprétés par `PrintableCV` (voir §4.3).
- `markdownMode` / `markdownContent` → mode « éditeur Markdown » (rendu
  différent, voir §5.4).

### `CVBlock` (`src/types/cv.ts`)
Liste plate triée par `sortOrder`. `blockType` :
- `section_header` : titre de section (`sectionName`). Son
  `overrideData.displayFormat` (`badges | comma | list | columns2 | columns3 | table`)
  pilote le rendu des entrées « badge » qui le suivent. Avec
  `overrideData.level === 'sub'` c'est un **sous-en-tête** de catégorie (ex.
  « Langages » sous « Compétences ») : rendu en petit libellé gras, il n'ouvre
  pas de section et hérite du `displayFormat` du titre de section parent.
  `overrideData.sectionKey` garde l'identifiant interne d'une section renommée
  (traduction) ; `overrideData.aiManaged` marque les sous-en-têtes créés par
  `applyAiCvToBlocks` (seuls ceux-là sont supprimés lors d'une réapplication).
- `entry_ref` : référence une `MasterEntry` (`entryId`). `overrideData` est
  fusionné par-dessus l'entrée (`{...entry, ...overrideData}`) ;
  `overrideData.datesOverride` (chaîne) remplace le formatage des dates.
- `custom_text` : texte libre mini-Markdown (`customContent`).
- `isVisible: false` → bloc ignoré.

**Regroupement « badges »** : les `entry_ref` consécutifs dont l'entrée est de
type `skill | language | interest | certification` sont fusionnés en un seul
`CVBadgeGroup`. Chaque description est découpée en libellés (une puce `- x` =
un badge ; sinon la description entière = un badge ; sans description :
`title — subtitle`).

## 3. Templates

11 templates, déclarés dans `src/templates/*.ts` et enregistrés dans
`src/templates/index.ts` (`templates`, `TEMPLATE_ORDER`, `getTemplate` avec
**fallback `ats-classic`** si l'id est inconnu).

**Un template n'est que de la donnée** : un objet `CVTemplate`
(`src/types/template.ts`) contenant
- `preview.*` : des chaînes de classes Tailwind appliquées par les composants
  partagés (`containerClass`, `headingClass`, `titleClass`, `skillBadgeClass`…) ;
- `layout` (`linear` par défaut, `sidebar-left`, `sidebar-right`) et `sidebar`
  (couleurs, largeur) ;
- `palettes`, `defaultDensity`, `headerVariants` : propositions affichées dans
  l'UI de design (ils ne changent le rendu qu'une fois recopiés dans `cv.settings`) ;
- `docx.*` : utilisé **uniquement** par l'export DOCX.

Aucun template n'a de composant React propre : **tout le rendu passe par les
mêmes composants** (§4).

| id | Fichier | Catégorie | Layout | Composant d'en-tête | Particularités CSS |
|---|---|---|---|---|---|
| `ats-classic` | `src/templates/ats-classic.ts` | ats | linear | `CVHeader` | fallback de `getTemplate` |
| `ats-modern` | `src/templates/ats-modern.ts` | ats | linear | `CVHeader` | |
| `minimalist` | `src/templates/minimalist.ts` | ats | linear | `CVHeader` | |
| `elegant` | `src/templates/elegant.ts` | executive | linear | `CVHeader` | bordure gauche du conteneur, Georgia sur les titres |
| `executive` | `src/templates/executive.ts` | executive | linear | `CVHeader` | Cambria/Georgia, titres centrés |
| `tech` | `src/templates/tech.ts` | tech | linear | `CVHeader` | pseudo-élément `before:` « ▹ » sur les titres |
| `creative` | `src/templates/creative.ts` | creative | linear | `CVHeader` | pseudo-élément `after:` (soulignement court) |
| `academic` | `src/templates/academic.ts` | academic | linear | `CVHeader` | Cambria/Georgia |
| `sidebar-modern` | `src/templates/sidebar-modern.ts` | graphic | sidebar-left | `CVSidebar` + en-tête inline | bande `#1e293b` |
| `sidebar-tech` | `src/templates/sidebar-tech.ts` | graphic | sidebar-left | `CVSidebar` + en-tête inline | |
| `sidebar-elegant` | `src/templates/sidebar-elegant.ts` | graphic | sidebar-right | `CVSidebar` + en-tête inline | |

Les palettes (`PALETTES_SOBER/VIBRANT/NEUTRAL`), densités
(`DENSITY_PRESETS`) et variantes d'en-tête viennent de `src/theme/tokens.ts`,
**partagé par tous les templates**.

## 4. Composants de rendu (tous partagés)

Tous dans `src/components/export/` sauf mention.

| Composant | Rôle | Utilisé par |
|---|---|---|
| `PrintableCV.tsx` | Racine `#printable-cv`. Trie/filtre/regroupe les blocs, calcule et **injecte une feuille `<style>`** d'overrides à partir de `cv.settings`, choisit le layout linéaire ou sidebar | **les 11 templates** ; aperçu (`RightPanel`) ; `PrintView` |
| `CVHeader.tsx` | En-tête (photo, nom, poste, contacts). Exporte aussi `buildContactItems` + les icônes SVG | 8 templates linéaires ; **`buildContactItems` est aussi utilisé par `CVSidebar`** |
| `CVSidebar.tsx` | Bande latérale : photo, contacts, sections badges | 3 templates sidebar |
| `CVSectionHeader.tsx` | `<h3>` de section | 11 templates |
| `CVEntryBlock.tsx` | Entrée (titre, sous-titre — lieu, dates formatées `fr-FR`, description) | 11 templates |
| `CVBadgeGroup.tsx` | Badges / virgules / liste / 2-3 colonnes / tableau | 11 templates (colonne principale **et** sidebar) |
| `CVCustomText.tsx` | Bloc de texte libre | 11 templates |
| `src/components/ui/MarkdownRenderer.tsx` | Mini-parser Markdown maison (listes, gras, italique) | `CVEntryBlock`, `CVCustomText` → 11 templates |
| `src/lib/css-sanitize.ts` | Valide les valeurs de `cv.settings` avant injection CSS | `PrintableCV` → 11 templates |
| `src/theme/tokens.ts` | Palettes, densités, variantes d'en-tête | templates + UI de design |
| `src/App.css` | Tailwind + règles globales `@page` / `@media print` ciblant `#printable-cv` | tout le rendu |

### 4.1 Flux dans `PrintableCV`

1. Tri des blocs par `sortOrder`, suppression des invisibles.
2. Regroupement des entrées badge consécutives → `badge-group` avec le
   `displayFormat` du **titre de section** parent (les sous-en-têtes sont ignorés,
   `parentDisplayFormat`).
2 bis. **Aucune section vide** (`visibleHeaderMask`, `lib/cv-sections.ts`) : un
   titre de section n'est rendu que si un contenu (entrée existante, groupe de
   badges, texte libre non vide) le suit avant le prochain titre de section ;
   un sous-en-tête, avant le prochain en-tête de n'importe quel niveau. Même
   règle dans `export-docx.ts`. Les données ne sont pas modifiées : un en-tête
   réapparaît dès qu'une entrée redevient visible.
3. **Layout sidebar seulement** : découpage en sections (délimitées par les
   `section_header`). Une section dont **tous** les items sont des badge-groups
   part dans la sidebar (formats `columns2/columns3/table` dégradés en `list`) ;
   le reste reste dans la colonne principale. Les sous-en-têtes ouvrent des
   groupes de badges dans la section (`SidebarSection.groups`).
4. Rendu :
   - linéaire : `CVHeader` → `<hr>` (sauf bandeau) → résumé → blocs ;
   - sidebar : `CVSidebar` | colonne principale (nom, poste, résumé, blocs).

### 4.2 Classes CSS « contrat »

Les overrides injectés ciblent des classes posées par les composants partagés.
Renommer/supprimer l'une d'elles casse les réglages de design **pour tous les
templates** : `cv-header-block`, `cv-name`, `cv-job-title`, `cv-contact-info`,
`cv-summary`, `cv-entry`, `cv-title-row`, `cv-title`, `cv-subtitle`, `cv-date`,
`cv-desc`, `cv-badge`, `cv-badge-item`, `cv-sidebar`, `cv-main-col`,
`cv-sidebar-heading`, `cv-sidebar-icon`, `cv-sidebar-photo-ring`, et le
sélecteur `#printable-cv h3` (qui touche aussi les titres de la sidebar).
Ajoutées par la spec 004 (sous-en-têtes, `<h4>` hors du sélecteur `h3`) :
`cv-subheading`, `cv-sidebar-subheading`, `cv-sidebar-group`.

### 4.3 Réglages `cv.settings` interprétés

Typographie : `fontFamily`, `fontSize`, `headerFontSize/Family/Weight`,
`headerTextTransform/Align`, `subtitleFontSize/Family/Style/Weight`,
`bodyFontFamily/Size/TextAlign/LineHeight`, `summaryFont*`, `summaryTextAlign`,
`summaryLineHeight`, `nameFontSize/Weight/TextTransform`, `nameLineBreak`,
`titleFontSize/Style`, `contactFontSize`.
Espacements : `pageMargin`, `entrySpacing`, `sectionHeaderGap`, `entryTitleGap`.
Couleur/style : `primaryColor`, `sectionBorderStyle`, `headerStyle`
(`clean | accent-bar | accent-light | accent-banner | dark-banner | gradient-banner`).
Photo : `photoShape`, `photoSize`, `photoBorder`.

`cvLanguage` (code ISO 639-1, défaut `fr`) : langue des mois et de « Présent »
(`readDateSettings` → `formatEntryDates`), posée par `applyAiCvToBlocks` d'après
`analyse.langue_annonce`.

Settings vides → rendu « par défaut » du template (c'est l'état de référence
retenu pour les golden tests). **État de référence spec 004** : pour un CV sans
sous-en-tête et sans section vide, le HTML rendu par les 11 templates est
identique octet pour octet à celui d'avant la spec (vérifié à la main contre le
commit de base ; `PrintableCV.test.tsx` fige les invariants structurels des 11
templates).

## 5. Pipeline d'export PDF

Point d'entrée unique : `exportNativePdf(sourceElementId = 'printable-cv')`
dans `src/lib/export-pdf.ts`, appelé par `CVBuilderPage.handleExportPdf`
(après `ensurePrintableInDom`) et par `MarkdownEditorPage` (id
`markdown-printable`).

```
CVBuilderPage ─► RightPanel ─► <PrintableCV id="printable-cv">  (aperçu à l'écran, 210mm)
      │
      └─ exportNativePdf()
            ├─ navigateur (pas Tauri) ─► window.print()   (+ @media print de App.css)
            ├─ Android ─► clone du nœud ─► html2canvas (scale 2) ─► jsPDF A4 (JPEG découpé en pages) ─► partage
            └─ Desktop ─► exportPdfDesktop
                  1. clone de #printable-cv (DOM déjà rendu par React)
                  2. getInlinedStyles() : toutes les <style> + <link stylesheet> du document inlinés
                  3. <img> converties en data URL
                  4. document HTML autonome + CSS d'enveloppe
                     (body margin 0, #printable-cv width 100%, @page A4 margin 0)
                  5. invoke('generate_pdf', { html })            ── src-tauri/src/lib.rs
                        → fichier HTML temporaire
                        → headless_chrome : navigate_to(file://…)
                        → print_to_pdf { A4 8.27×11.69 in, marges 0, print_background,
                                          scale 1, prefer_css_page_size }
                  6. octets PDF écrits au chemin choisi (dialog save)
                  en cas d'erreur → repli window.print()
```

Points importants pour la reproductibilité :
- Le PDF desktop est produit par **Chromium en media `print`** : les règles
  `@media print` de `App.css` et de `PrintableCV` (padding de page réduit à
  `8px 10px` par défaut pour les templates linéaires) s'appliquent. Le PDF
  **diffère donc de l'aperçu écran**.
- La pagination est laissée à Chromium (`print:break-inside-avoid` sur les
  entrées, `break-after-avoid` sur les titres).
- Les polices sont celles du système hôte (Calibri, Cambria, Georgia…) avec
  repli ; le rendu dépend donc de la machine.
- `src/pages/PrintView.tsx` (route `/print`) est un autre chemin d'impression,
  mais `setPrintData` n'est appelé nulle part : il est inatteignable
  aujourd'hui (voir `NOTES.md`).

### 5.4 Mode Markdown (hors templates)

`MarkdownEditorPage` / `MarkdownPreviewPane` (`react-markdown` + `remark-gfm`)
rendent un nœud `#markdown-printable` indépendant des templates, exporté par
le même `exportNativePdf`. Il partage **le pipeline d'export**, pas les
composants de rendu.

### 5.5 Export DOCX (hors PDF)

`src/lib/export-docx.ts` reconstruit le document avec la lib `docx` à partir
des mêmes données et de `template.docx` + d'une partie de `cv.settings`. Il ne
réutilise **aucun** composant React. Modifier un fichier `src/templates/*.ts`
touche néanmoins les deux pipelines.

## 6. Zones à risque d'effets de bord

Parce que les templates ne sont que des jeux de classes, **presque toute
modification de rendu est transverse**. Par ordre de rayon d'impact :

| Fichier | Impact | Pourquoi c'est risqué |
|---|---|---|
| `src/components/export/PrintableCV.tsx` | ⚠️ 11 templates + aperçu + export | Regroupement des blocs, répartition sidebar/principal, CSS injecté (y compris `@media print`) |
| `src/App.css` (bloc `@page` / `@media print`) | ⚠️ 11 templates, export desktop et navigateur | Inliné tel quel dans le HTML envoyé à Chromium |
| `src/lib/export-pdf.ts` + `generate_pdf` (`src-tauri/src/lib.rs`) | ⚠️ tous les PDF, CV **et** mode Markdown | CSS d'enveloppe et options d'impression communs |
| `CVEntryBlock.tsx`, `CVSectionHeader.tsx`, `CVCustomText.tsx` | ⚠️ 11 templates | Aucune variation par template en dehors des classes |
| `CVBadgeGroup.tsx` | ⚠️ 11 templates, colonne principale et sidebar | Même composant dans deux contextes visuels très différents |
| `src/components/ui/MarkdownRenderer.tsx` | ⚠️ 11 templates | Toute description / texte libre passe par lui |
| `CVHeader.tsx` | 8 templates linéaires **+ 3 sidebar** via `buildContactItems` et les icônes | Couplage caché entre les deux familles de layout |
| `CVSidebar.tsx` | 3 templates sidebar | |
| `src/theme/tokens.ts` | UI de design, DOCX, palettes de tous les templates | |
| `src/lib/css-sanitize.ts` | tous les réglages de design | Durcir une regex peut faire disparaître silencieusement un réglage |
| Sélecteur global `#printable-cv h3` | titres de la colonne principale **et** de la sidebar | |
| `src/templates/<id>.ts` | 1 template (PDF **et** DOCX) | Seule zone réellement isolée |

## 7. Flux « CV ciblé par IA » (spec 004)

```
generateFullCVMatchPrompt (lib/cv-prompt.ts : blocs composables)
   └─ prompt copié → LLM externe → JSON collé
analyzeAiCvJson (lib/ai-cv-pipeline.ts)
   ├─ parseAiCvResponse     parse tolérant (fences, texte parasite, champs inconnus ; schéma v1 et v2)
   └─ guardAiCv             nettoyage + GuardReport { errors, warnings, aiWarnings, metrics }
        └─ rapport affiché (AiCvGuardReport) ; « Appliquer quand même » si errors non vide
applyAiCvToBlocks (lib/apply-ai-cv.ts, store injectable)
   1. visibilité + surcharges    2. pertinence des Langues    3. sous-en-têtes de compétences
   4. ordre (planCvBlockOrder)   5. libellés de sections + cvLanguage
rendu : PrintableCV / export-docx (sections vides masquées, lib/cv-sections.ts)
```

- **Non destructif** : `MasterEntry` jamais modifiée ; tout vit dans `cv_blocks` et `cv.settings.cvLanguage`.
- **Garde-fou** (`lib/ai-cv-guard.ts`) : `errors` = chiffres absents de la source (profil maître, profil, contexte additionnel) ; `warnings` = IDs inconnus, termes non sourcés, suggestions rejetées, doublons, puces > 120 caractères ou > 5, formulations interdites, volume vs budget de pages, cohérence des temps. `metrics` = couverture des mots-clés `indispensables`, écarts, volume estimé.
- **Pages cibles** : réglage `cv_target_pages` (1 par défaut, 2), lu par `promptStore.targetPages` et transmis au prompt (`options.pageBudget`) et au garde-fou (`ctx.pageBudget`). À 1 page : `ONE_PAGE_LIMITS` (lib/cv-prompt.ts) pilote le bloc « UNE PAGE » du prompt et les contrôles `one-page` du garde-fou ; `metrics.overflow` liste les éléments à retirer en priorité (intérêts/bénévolat sans lien, expériences sans lien, formations/certifications en trop, compétences au-delà de 15, puces en trop, résumé).
- **Typographie** (`lib/cv-typography.ts`) appliquée par le garde-fou : le texte retourné par `guardAiCv` est celui qu'on applique.
- Limites : détection de termes heuristique (sigles, CamelCase, noms propres en français), temps verbaux approximatifs, aucune évaluation sémantique, le LLM externe reste libre de désobéir (d'où le garde-fou).

