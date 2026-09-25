# Golden tests du rendu PDF

Filet de sécurité avant toute modification du rendu des CV. Le banc régénère
les PDF de chaque template avec des jeux de données fixes, puis les compare à
des références versionnées :
- **texte** extrait du PDF (retours à la ligne et pagination compris) ;
- **image** PNG de chaque page, avec un seuil de tolérance calibré sur le bruit.

Voir aussi `../../../ARCHITECTURE.md` (pipeline d'export) et
`../../../NOTES.md` (comportements connus figés par ces références).

## Commandes

Depuis `resume-forge/` :

```bash
bun run test:golden                     # compare aux références (code ≠ 0 si écart)
bun run test:golden -- --update         # régénère toutes les références
bun run test:golden -- --update-overflow   # régénère seulement les overflow.json
bun run test:golden -- --only elegant   # ne traite que les cas dont l'id contient « elegant »
bun run test:golden:compare <pdf> <fixture> <template>   # validation croisée (voir plus bas)
bun tests/golden/make-backup.ts <fixture> <template> [sortie.json]
```

Ce banc est **séparé** de `bun test` (aucun fichier `*.test.ts`) et n'est pas
exécuté par la CI.

Sorties (ignorées par git, voir `.gitignore`) : `tests/golden/.out/`
- `cases/<suite>/<template>/` : `export.html` (HTML envoyé à « Rust »),
  `actual.pdf`, `text.txt`, `page-N.png`, et en cas d'écart `text.diff`,
  `diff-N.png` (rouge = pixel au-delà de la tolérance, orange = en deçà) ;
- `report.json` : statistiques par page (pixels différents, écart max).

## Installation (environnement reproductible)

Testé sur Ubuntu 24.04 avec Bun 1.3.

1. Dépendances du projet : `bun install`. La seule dépendance ajoutée pour
   ce banc est `playwright-core@1.56.1` (devDependency, version exacte).
2. Chromium correspondant à Playwright 1.56.1 (build 1194, Chromium 141).
   Dans l'environnement Claude Code il est préinstallé
   (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Ailleurs :
   `bunx playwright-core install chromium`. On peut aussi pointer un autre binaire avec
   `GOLDEN_CHROMIUM=/chemin/vers/chrome`, mais les références n'ont été
   produites qu'avec Chromium 141.0.7390.37.
3. Polices système (paquets Ubuntu/Debian) :
   ```bash
   sudo apt-get install -y fontconfig fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea
   ```
4. Rien d'autre : Gelasio est versionnée dans `fonts/`, et la configuration
   fontconfig est fournie à Chromium par le script (`FONTCONFIG_FILE`), sans
   toucher à la configuration système.

Au démarrage, le script vérifie le SHA-256 des polices versionnées et la
résolution fontconfig de chaque police utilisée par les templates. Il s'arrête
(code 2) si l'une ou l'autre ne correspond pas.

## Polices

Les templates demandent des polices Microsoft absentes sous Linux. Chacune est
remplacée par un équivalent **métriquement compatible** (mêmes largeurs de
glyphes, donc mêmes retours à la ligne) :

| Demandée par les templates | Utilisée | Source |
|---|---|---|
| Calibri | Carlito | paquet `fonts-crosextra-carlito` |
| Cambria | Caladea | paquet `fonts-crosextra-caladea` |
| Georgia | Gelasio | versionnée : `fonts/Gelasio-wght.ttf`, `fonts/Gelasio-Italic-wght.ttf` |
| Arial, Helvetica | Liberation Sans | paquet `fonts-liberation` (alias fontconfig standard) |
| Times New Roman | Liberation Serif | paquet `fonts-liberation` |

La correspondance est imposée par `fonts/fonts.conf` (binding `strong`).

**Provenance de Gelasio** (licence SIL OFL 1.1, texte dans `fonts/OFL.txt`) :
- dépôt : https://github.com/google/fonts, dossier `ofl/gelasio`
- commit : `23e54b51ddffbc7713c583748e3bd86f62b1fa4a`
- fichiers d'origine, renommés sans crochets :
  - https://github.com/google/fonts/blob/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/gelasio/Gelasio%5Bwght%5D.ttf → `Gelasio-wght.ttf`
    SHA-256 `4daecea457258c9ebeb8bc99ed3fd24353618bfad3ea4b93fa0b5d0468fc04e4`
  - https://github.com/google/fonts/blob/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/gelasio/Gelasio-Italic%5Bwght%5D.ttf → `Gelasio-Italic-wght.ttf`
    SHA-256 `52559e845a4d33514e5f93bb9ae7dbeae1894a53f2c565a15f18af40cd337c09`

Les empreintes sont vérifiées à chaque exécution (`lib/env-check.ts`).

## Comment le PDF est produit

Le banc reproduit le chemin d'export **desktop** (`exportPdfDesktop` →
commande Rust `generate_pdf`), décrit dans `ARCHITECTURE.md` §5 :

1. `vite.golden.config.ts` construit `harness/` avec la même racine, le même
   Tailwind et les mêmes alias que l'app. Le CSS produit est identique à celui
   du build de l'app (même hash de contenu vérifié lors de la mise en place).
2. La page de test rend le vrai `<PrintableCV>` avec la fixture, puis appelle
   **la vraie `exportNativePdf()`**. Seuls trois modules Tauri sont remplacés
   (`harness/tauri-mocks/`) : `invoke('generate_pdf')` capture le HTML final,
   `save` renvoie un chemin factice, `writeFile` ne fait rien. Le clonage du
   DOM, l'intégration des styles et des images et l'enveloppe HTML sont donc
   ceux du code de l'app.
3. Comme `generate_pdf`, le HTML est écrit dans un fichier temporaire ouvert
   en `file://` par Chromium, fenêtre 800 × 600 (défaut de la crate
   `headless_chrome`), puis imprimé via `Page.printToPDF` avec les mêmes
   options : 8.27 × 11.69 in, marges 0, arrière-plans, échelle 1,
   `preferCSSPageSize`.
4. Le PDF est rastérisé à 96 dpi (794 × 1123 px) par `pdfjs-dist` (build
   `legacy`) dans Chromium. La comparaison de pixels se fait aussi dans
   Chromium (canvas) : aucune dépendance d'image supplémentaire.

Écarts assumés avec l'app réelle :
- le code Rust n'est pas exécuté. Les deux chemins passent par la même
  commande Chrome (`Page.printToPDF`), mais headless_chrome utilise le Chrome
  installé sur le poste, pas Chromium 141 ;
- le `<link>` Google Fonts de `index.html` est absent de la page de test. Il ne
  concerne que les polices de l'interface : le CV impose sa propre police sur
  `#printable-cv` ;
- l'app intègre les feuilles de style en les récupérant avec `fetch()`. Si
  cette récupération échoue dans Tauri, l'app exporte sans styles, ce que le
  banc ne reproduit pas. La validation croisée ci-dessous sert à le vérifier.

Fuseau horaire et langue sont fixés par cas (`timezoneId`, `locale: fr-FR`).

## Jeux de données (`fixtures/`)

| Fixture | Templates | Contenu |
|---|---|---|
| `anonymized-real` | les 11 | Clone anonymisé du CV réel : 6 expériences + 1 alternance, 2 formations, 2 certifications, 1 projet, 9 compétences. Cas de collision : entreprise `GITEC • MATELLI • MICROPOLE` + lieu + dates sur la même ligne. Photo placeholder (`photo-placeholder.png`, silhouette générée). |
| `long-titles` | les 11 | Nom, poste, contacts, intitulés, entreprises, sections, badges et un mot insécable extrêmement longs. |
| `minimal` | les 11 | Nom, email, une expérience sans description ; pas de photo ni de résumé. |
| `overflow` | les 11 | CV trop long pour une page dans tous les templates, `academic` compris. Sert à tester la détection du dépassement de page. |
| `my-settings` | `ats-classic`, `sidebar-modern` (**provisoire**) | `anonymized-real` + réglages de design. **Valeurs provisoires** : voir ci-dessous. |
| `tz-new-york` (suite) | `ats-classic`, `sidebar-modern` | `anonymized-real` rendu en `America/New_York` au lieu de `Europe/Paris`. |

Toutes les données sont fictives. Aucune donnée personnelle réelle n'est versionnée.

### `my-settings` : récupérer les vrais réglages

Les réglages de design d'un CV sont stockés dans la table SQLite
`cv_documents`, colonnes `template_id` et `settings` (JSON : `primaryColor`,
`fontFamily`, `headerStyle`, `entrySpacing`, `pageMargin`…). Pour les
récupérer : dans l'app, **Paramètres → Sauvegarde des données**, exporter en
cochant uniquement « Documents CV ». Dans le fichier produit, relever pour chaque CV
utilisé `modules.cv_documents[].template_id` et `modules.cv_documents[].settings`.
Ces deux champs ne contiennent aucune donnée personnelle. Les reporter dans
`fixtures/my-settings.json` (`templates`, `settings`), puis :
`bun run test:golden -- --update --only my-settings`.

### Fuseau négatif : comportement connu figé

`src/components/export/CVEntryBlock.tsx` est **le seul** endroit du rendu PDF
qui formate des dates. Tous les chemins sont couverts par `anonymized-real` :
- `formatDate` (mois + année) : expériences, projets. Ex. `2020-03`, et
  `2016-01` pour le passage d'année ;
- `formatDateYear` (année seule) : formations. Ex. `2007-01` ;
- `'Présent'` (littéral, `isCurrent`) et `overrideData.datesOverride`
  (verbatim, alternance) : pas de conversion de date.

Les certifications passent par `CVBadgeGroup`, qui n'affiche **aucune** date.

En `America/New_York`, les dates `AAAA-MM` (lues en UTC) reculent d'un mois
(NOTES.md §3). Le script vérifie explicitement ce comportement actuel :
`mars 2020` → `février 2020`, `janvier 2016` → `décembre 2015`,
`2007 -` → `2006 -`. **Quand le lot « dates » corrigera ce bug, ces
assertions (`KNOWN_TZ_SHIFTS` dans `run.ts`) et les références `tz-new-york`
devront être mises à jour.**

## Dépassement de page

L'export desktop n'imprime qu'une page (NOTES.md §6). Avant d'exporter, l'app
mesure si le CV dépasse avec `src/lib/print-overflow.ts` et demande
confirmation. Le banc applique cette mesure, dans la page de test, au HTML
d'export capturé, et la confronte au PDF réellement imprimé.

Assertions par cas (`checkOverflow` dans `run.ts`) :
- **attente par fixture**, parmi trois statuts (« dépasse », « de justesse »,
  « tient ») : `minimal` et `long-titles` tiennent ; `overflow` dépasse ;
  `anonymized-real` dépasse, sauf `academic` (le template le plus compact), qui
  tient avec 3,2 mm de marge, donc « de justesse » ;
- **« de justesse »** : `tight` doit valoir vrai si et seulement si le CV tient
  avec une marge inférieure à `OVERFLOW_SAFETY_MARGIN_MM` ;
- **référence** `overflow.json` : dépassement oui/non, de justesse oui/non, quantité en mm
  (tolérance ± 0,5 mm), marge restante, nombre de lignes coupées, dernière
  ligne visible et première ligne coupée ;
- **cohérence avec le PDF** (texte réduit aux lettres et chiffres en
  majuscules) :
  - dépassement : la dernière ligne entièrement visible figure dans le PDF,
    la première ligne entièrement sous la page n'y figure pas ;
  - pas de dépassement : la dernière ligne de chaque colonne figure dans le PDF.

- **auto-tests de la page de test** (`harness/main.tsx`, liste
  `window.__GOLDEN_CHECKS__`, un échec = cas en échec) :
  - mémorisation : une mesure annulée en cours de route, une mesure avec une
    image non décodée ou une police en erreur, et une mesure en échec (pas de
    `#printable-cv`) ne sont **jamais** mémorisées ; une mesure complète l'est,
    et donne le même résultat que la première mesure du même HTML ;
  - export : `exportNativePdf` avec confirmation reçoit exactement la mesure
    mémorisée. Elle n'est pas appelée si le CV tient, elle l'est pour « dépasse »
    et « de justesse », et un refus annule l'export ;
  - ancrage : la première ligne coupée et la dernière ligne visible se
    retrouvent dans le DOM de l'aperçu (`resolveLineAnchor`), ce qui sert à
    placer le trait de coupure.

  Ces auto-tests ont été vérifiés en introduisant volontairement des défauts :
  mémorisation de toute mesure, suppression des contrôles d'annulation. Le
  banc échoue alors bien.

**Précision de la mesure.** La mesure se fait à l'écran, avec les règles
`@media print` activées par CSSOM. Elle donne la même mise en page que
l'émulation d'impression native de Chromium (vérifié sur 248 lignes). Le
texte imprimé est cependant très légèrement plus large qu'à l'écran : une
ligne longue peut passer à la ligne un mot plus tôt dans le PDF. Tout ce qui
suit descend alors d'environ une ligne (4 à 5 mm). Sur les 48 cas, c'est
arrivé pour 5 lignes dans 3 cas (`long-titles/ats-modern`,
`long-titles/sidebar-modern`, `long-titles/sidebar-elegant`). Le banc
l'affiche pour information (`[n ligne(s) coupée(s) autrement à
l'impression]`) sans échouer. D'où la marge de sécurité
`OVERFLOW_SAFETY_MARGIN_MM = 5` (`src/lib/print-overflow.ts`), juste au-dessus
du pire écart observé (4,6 mm) : sous cette marge, le CV est signalé « de
justesse » et l'export demande aussi confirmation. Si de nouveaux cas
montrent un écart plus grand, relever cette constante.

## Critère de non-régression d'un lot

**Un lot est conforme si le texte et les PNG sont identiques sur les 48 cas**
(`bun run test:golden` à 100 %, sans `--update`).

Le diff des HTML d'export (`.out/cases/<suite>/<template>/export.html`,
comparés avant et après le lot) est **affiché à titre informatif** et ne fait
pas échouer le lot, avec une exception : il fait échouer le lot s'il touche

- au contenu de `#printable-cv` (le `<body>` du HTML d'export), ou
- aux règles CSS qui s'appliquent à `#printable-cv` ou à ses descendants.

Pourquoi : l'export intègre tout le CSS de l'interface (NOTES.md §7). Une
nouvelle classe Tailwind utilisée ailleurs dans l'app ajoute des règles au HTML
exporté sans rien changer au CV : ce n'est pas une régression.

Le banc ne compare pas encore les HTML automatiquement. Procédure actuelle :
copier les `export.html` de `.out/cases/` avant le lot, relancer le banc après
le lot, puis comparer : corps (`<body>…`) et règles CSS ajoutées ou retirées.
C'est ce qui a été fait aux lots A, B1 et B2 (48/48 identiques octet pour
octet). Intégrer cette comparaison au banc est à prévoir.

Ce critère remplace l'exigence « HTML identiques octet pour octet » appliquée
jusqu'au lot B2.

## Critères de comparaison

- **Pagination** : même nombre de pages.
- **Texte** : identique à l'octet près. Extraction par `lib/extract.ts` :
  fragments regroupés par ligne de base, triés par x, lignes de haut en bas.
  Les titres avec un fort espacement des lettres sortent sous la forme
  `E X P É R I E N C E` (espaces ajoutés par pdfjs). C'est déterministe et
  appliqué de la même façon à la validation croisée.
- **Image** : voir Seuils.

### Seuils

Mesure du bruit : 5 passes de comparaison successives (37 pages chacune),
seuils à zéro, sur les mêmes références :

| Passe | Pages avec au moins 1 pixel différent | Pixels différents (max/page) | Écart de composante max |
|---|---|---|---|
| 1 | `anonymized-real/ats-modern` | 2 | 4 |
| 2 | `anonymized-real/ats-modern` | 2 | 4 |
| 3 | aucune | 0 | 0 |
| 4 | `long-titles/elegant` | 5 | 27 |
| 5 | `anonymized-real/ats-modern` | 2 | 4 |

Aucun écart de texte ni de pagination. Le bruit est de l'anti-aliasing isolé
sur des bords de glyphes (quelques pixels sur une même ligne).

Seuil retenu (`run.ts`) : `PIXEL_TOLERANCE = 0` (toute variation de couleur
compte) et `MAX_DIFF_RATIO = 1e-5`, soit **8 px maximum par page**, juste
au-dessus du bruit maximal observé (5 px). Un caractère déplacé ou une couleur
modifiée touchent des centaines de pixels. Si des échecs de 6 à 8 px
apparaissent sans raison, relancer la mesure avant d'élargir le seuil.

## Validation croisée avec l'app réelle

But : vérifier une fois, sur ton poste, que le banc reproduit bien l'export de
l'app (même texte, mêmes retours à la ligne, même pagination).

1. Créer un **profil de test dédié** depuis l'écran de connexion de l'app.
   L'import rattache le profil de la sauvegarde au profil connecté et écrase
   son identité : ne jamais importer depuis le profil principal.
2. `bun tests/golden/make-backup.ts anonymized-real ats-classic golden.json`
3. Connecté au profil de test : Paramètres → Sauvegarde des données → importer
   `golden.json` (stratégie « Fusionner »).
4. Ouvrir le CV « CV golden — anonymisé (ats-classic) », exporter en PDF.
5. `bun run test:golden:compare ~/cv_export.pdf anonymized-real ats-classic`

Le script affiche « Texte IDENTIQUE » ou un diff ligne à ligne
(`-` référence, `+` PDF de l'app). La photo n'entre pas dans le texte.
