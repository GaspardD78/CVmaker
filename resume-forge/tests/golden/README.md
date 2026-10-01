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
bun run test:golden -- --update-html       # régénère seulement l'empreinte du HTML d'export
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
| `tight` | `elegant`, `sidebar-elegant` | CV « de justesse » : tient avec moins de 2 mm de marge (1,1 et 0,4 mm), sous `OVERFLOW_SAFETY_MARGIN_MM`. Calibré à partir d'`anonymized-real`, sans réglage de mise en page : 3 expériences retirées (Analyste données, Chargée d'études junior, Alternance) et 49 mots ajoutés au résumé (5 mots retirés au lot 4). Voir ci-dessous. |
| `entry-date-gap` (suite) | `ats-classic`, `sidebar-modern` | Collision intitulé / date : deux expériences dont l'intitulé remplit la ligne jusqu'à la date (écart de 0,09 et 0,23 px sans correctif). Voir la section Collision intitulé / date. |
| `dates-year` | `academic`, `ats-classic`, `sidebar-modern` | `anonymized-real` avec `dateFormat: "year"` : toutes les dates en années seules. `academic` montre aussi le projet. |
| `dates-year-no-education` | idem | `dateFormat: "year"` et `showEducationYears: false` : aucune date dans les formations. |
| `dates-no-education` | idem | `showEducationYears: false` seul : le masquage ne dépend pas du format (mois et année gardés ailleurs). |

Toutes les données sont fictives. Aucune donnée personnelle réelle n'est versionnée.

### `tight` : calibrage

Une ligne de texte vaut environ 5 mm : la marge ne se règle pas finement par le
contenu sur un seul template, et un même contenu ne donne pas la même marge sur
une page pleine largeur et dans la colonne principale, plus étroite, d'un
template à bande latérale. Méthode (script jetable, marges mesurées par le banc
sur les 11 templates) : retirer des expériences d'`anonymized-real` pour
approcher la page, puis allonger le résumé mot par mot. Le résumé gagne environ
1,6 fois plus de lignes dans la colonne étroite, ce qui rapproche les deux
familles de templates. Avec 3 expériences retirées et 54 mots ajoutés :
`elegant` 1,1 mm et `sidebar-elegant` 0,7 mm (les autres templates sont hors
de la fenêtre de 0,5 à 1,5 mm). Si une évolution du rendu fait sortir ces cas
de la fenêtre, recalibrer (longueur du résumé) plutôt que changer le statut
attendu.

Lot 4 (dates indivisibles) : la colonne principale des templates à bande
latérale gagne des lignes, `sidebar-elegant` dépassait de 5 mm. Retirer la fin
du résumé (« : tests automatisés, revues de », 5 mots, une ligne) donne
`elegant` 1,1 mm et `sidebar-elegant` 0,4 mm. 0,7 mm n'est pas atteignable par le
contenu seul (la marge avance d'une ligne, environ 5 mm) ; 0,4 mm reste « de
justesse » (sous 2 mm, au-dessus de 0).

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
  tient avec 3,2 mm de marge, donc « tient » depuis que la marge de sécurité
  est de 2 mm (« de justesse » avec 5 mm) ; `tight` est « de justesse » (1,1 et
  0,4 mm). L'auto-test de la page de test vérifie alors que la confirmation
  d'export est demandée et reçoit la mesure de l'aperçu. **Vérifié par défauts
  volontaires** : `OVERFLOW_SAFETY_MARGIN_MM = 0` fait échouer les 2 cas
  (« tient » au lieu de « de justesse ») ; une confirmation demandée seulement
  en cas de dépassement fait échouer l'auto-test (« pas de confirmation pour le
  statut « de justesse » ») ;
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
`@media print` activées par CSSOM, dans une iframe de 210 × 297 mm.

*Retours à la ligne (contrôle bloquant).* Chaque ligne mesurée entièrement
visible doit être, mot pour mot, une ligne du PDF : une suite de fragments
entiers sur une même ligne de base, à ±2 mm de la position mesurée, sans
fragment de même taille accolé avant ou après (`checkLineBreaks`,
`lib/extract.ts`, partagé avec la validation croisée). Un mot renvoyé à la
ligne suivante à l'impression fait échouer le cas, même si le texte mis bout
à bout est identique. L'ancien contrôle (ligne cherchée dans le texte du PDF
mis bout à bout, `[n ligne(s) coupée(s) autrement à l'impression]`, informatif)
ne voyait pas ces écarts : il en restait 10 lignes dans 4 cas.

*Largeur du CV (lot « retours à la ligne »).* Cause de ces écarts : à
l'impression, `#printable-cv` est en `position: fixed` (`App.css`) et sa
largeur suit la zone de la page A4 (793,70 px), que Chrome tronque à 793 px ;
l'iframe de mesure arrondit sa fenêtre à 794 px. Un repère aligné à droite
dans un élément fixed s'imprime à 793,00 px (794,00 px dans le flux normal) ;
avec 793 px, la mesure retrouve les coupures du PDF. Pistes écartées : barre
de défilement (aucune, `overflow: hidden`), styles calculés différents (17
propriétés identiques entre l'iframe et l'impression émulée), chargement des
polices (coupures identiques 1,5 s plus tard). Correctif :
`print-overflow.ts` impose `PRINT_CV_WIDTH_PX` (`Math.floor(210 mm en px)`) à
`#printable-cv` dans l'iframe. Résultat : 0 ligne coupée autrement sur les
52 cas, texte et PNG inchangés.

*Garde-fou de largeur.* À chaque cas, après le PDF de référence, la page
d'impression reçoit un repère en `position: absolute` de bord à bord de
`#printable-cv` et est imprimée une seconde fois (PDF de contrôle, jeté). La
largeur ainsi relevée (bordures comprises) doit être égale, à 0,05 px près, à
`PRINT_CV_WIDTH_PX` ; sinon le cas échoue avec les deux valeurs (par exemple
après une mise à jour de Chrome). L'impression émulée ne suffit pas : sa
fenêtre est un nombre entier de pixels. **Vérifié par défaut volontaire** :
`PRINT_CV_WIDTH_PX = 794` fait échouer le cas (`793 px à l'impression, 794 px
dans la mesure`) et le contrôle des retours à la ligne.

*Marge de sécurité (réévaluée : 2 mm).* Sous `OVERFLOW_SAFETY_MARGIN_MM`
(`src/lib/print-overflow.ts`), le CV est signalé « de justesse » et l'export
demande confirmation. Elle valait 5 mm pour couvrir un mot passé à la ligne
plus tôt à l'impression (pire écart au lot A : 4,6 mm), dû en réalité au CV
plus étroit de 1 px (voir ci-dessus). Depuis le correctif de largeur :
- 0 retour à la ligne différent sur les 52 cas (contrôle bloquant) et sur une
  validation croisée sous Windows (WebView2, `devicePixelRatio` 1, CV réel :
  48/48 lignes identiques, largeur 793 px) ;
- écart vertical résiduel entre la mesure et le PDF : 0,3 mm au plus sur le
  bas du contenu (25 cas qui tiennent, polices réelles comprises pour Georgia),
  ±0,25 mm sur la position des lignes.
D'où 2 mm : l'écart résiduel plus une réserve pour les différences de version
entre WebView2 (mesure) et le Chrome de l'export. Effets sur le banc :
`anonymized-real/academic` (3,2 mm) passe de « de justesse » à « tient » ;
suite fit : voir ci-dessous.

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

Cette vérification est automatique : voir la section Empreinte du HTML
d'export ci-dessous.

Ce critère remplace l'exigence « HTML identiques octet pour octet » appliquée
jusqu'au lot B2.

## Empreinte du HTML d'export

Automatisation du critère ci-dessus (`lib/html-fingerprint.ts`). Pour chaque
cas, une page Chromium séparée charge le HTML d'export en `file://`, en mode
impression (`emulateMedia('print')`), fenêtre de la taille de la page
(794 × 1123 px). La page qui imprime le PDF n'est pas touchée. L'empreinte a
deux parties.

**a) Balisage de `#printable-cv`** (`references/<suite>/<template>/markup.txt`) :
arbre du DOM lu par Chromium, une ligne par nœud. Normalisations :
- attributs triés par nom (leur ordre est sans effet) ;
- classes triées, espaces réduits (l'ordre des classes est sans effet en CSS) ;
- URL `data:` (la photo) remplacées par `data:<type>;sha256=<16 hex>;len=<n>` ;
- textes et attribut `style` inchangés. Le `<style>` injecté par
  `PrintableCV` fait partie du balisage.

**b) Règles CSS applicables**, dans **l'ordre du document**, car la cascade
en dépend. Ce n'est pas un tri alphabétique : un changement d'ordre entre
règles applicables est détecté (« ordre modifié »), alors que l'ajout de règles
non applicables ne change pas cet ordre.
- Règles `@media` : gardées si la condition est vraie en impression à 794 px
  (`matchMedia`). `print` compte, `screen` et `hover` non.
- `@supports` : gardées si la condition est vraie (`CSS.supports`). Règles
  `@layer` et règles imbriquées : parcourues, la couche est notée dans le
  contexte.
- Une règle de style est **applicable** si son sélecteur, nettoyé, désigne
  `#printable-cv`, un descendant ou un ancêtre (`html`, `body` ; `:root`
  désigne `html`) : l'héritage et les variables passent par les ancêtres.
- **Nettoyage du sélecteur** : lecture caractère par caractère (échappements
  comme `.dark\:hover\:x`, chaînes, crochets et parenthèses respectés),
  branche par branche. On retire les pseudo-éléments (`::before`, `::after`,
  `::placeholder`, `::-webkit-…`, `:before`/`:after` anciens) et les
  pseudo-classes d'interaction (`:hover`, `:focus…`, `:active`, `:visited`).
  Une pseudo-classe fonctionnelle vidée (`:not()`, `:is()`…) disparaît. Une
  branche vide devient `*`, et une branche qui commence ou finit par un
  combinateur est complétée par `*`. La règle, elle, reste entière dans
  l'empreinte : un `content` de `::after` modifié est détecté. Un sélecteur
  resté invalide est compté comme applicable et listé dans `report.json`
  (aucun actuellement).
- **Variables CSS** : dans une règle applicable, une déclaration `--x` n'est
  gardée que si la variable est utilisée. On part des `var()` des déclarations
  ordinaires et des attributs `style` du CV, puis on suit les variables de
  variable en variable. Une variable de `:root` utilisée par le CV fait donc
  échouer le cas si elle change, mais pas une variable de thème inutilisée.
- `@page` et l'ordre des couches `@layer` : toujours inclus. `@font-face` :
  inclus si sa famille apparaît dans une déclaration retenue. `@keyframes` :
  inclus si son nom apparaît dans `animation`/`animation-name`. `@property` :
  inclus si la variable est retenue.
- **Faux positif volontaire** : les règles portant sur `html` et `body` sont
  toujours applicables, même quand l'enveloppe d'export les écrase (ex.
  `body { background: var(--rf-bg) }` de l'interface). Changer ces règles fait
  échouer les cas. Mieux vaut un faux positif rare qu'une régression manquée.

**Références** :
- `references/_css/rules.txt` : règles uniques partagées par tous les cas, une
  par ligne (`identifiant<TAB>contexte<TAB>règle`, identifiant = 12 caractères
  de SHA-256). Les règles inutilisées sont retirées lors d'un `--update-html`
  complet.
- `references/<suite>/<template>/html.json` : empreinte du HTML complet
  (informative), empreinte du balisage, liste ordonnée des identifiants de
  règles, sélecteurs invalides.
- `references/<suite>/<template>/markup.txt` : balisage normalisé, pour le diff.
- Taille (48 cas) : 765 735 octets (balisage 568 672, `html.json` 146 036,
  `rules.txt` 51 027 pour 319 règles), contre 6 567 495 octets pour les 48 HTML
  d'export complets.

**En cas d'écart** : le balisage modifié et les règles ajoutées, supprimées,
modifiées ou déplacées font échouer le cas. Les détails sont affichés, et le
diff complet est écrit dans `.out/cases/<suite>/<template>/html.diff`. Si
seule l'empreinte du HTML complet change, le message « HTML d'export modifié
hors CV » est informatif, sans échec. `--update-html` ne réécrit que
`html.json`, `markup.txt` et `_css/rules.txt`. Coût : environ 120 ms par cas,
soit environ 6 s par passe complète.

**Vérifié par défauts volontaires** (copies jetables, code restauré ensuite) :

| Défaut | Résultat |
|---|---|
| classe Tailwind nouvelle dans le tableau de bord (hors CV) | informatif |
| variable de `:root` non utilisée par le CV (`--rf-accent`) | informatif |
| fond `body` de l'enveloppe d'export (`export-pdf.ts`) | échec : règle modifiée |
| variable de `:root` utilisée par le CV (`--font-body`) | échec : règle modifiée |
| `@media print { #printable-cv a[href] }` (`App.css`) | échec : règle modifiée (+ PNG) |
| `rel` des liens de contact (`CVHeader.tsx`) | échec : balisage modifié |
| deux utilitaires de même spécificité inversés (`.text-black` / `.text-gray-900`, copie du HTML) | échec : ordre modifié |
| `content` du `::after` des virgules d'`academic` (copie du HTML) | échec : règle modifiée |

Les deux derniers défauts ont été appliqués à une copie du HTML d'export :
l'ordre des utilitaires est fixé par Tailwind, et le `content` passe par le nom
de classe. Depuis le code source, ils changeraient aussi le balisage.

## Suite fit : « Ajuster à 1 page »

Quatre cas (`fit-<fixture>/<template>`) lancent, avant l'export, l'ajustement
à une page de `src/lib/fit-to-page.tsx`, avec la même mesure que l'export.
Le CV est ensuite rendu avec les réglages obtenus, puis exporté.
Références : texte, PNG, `overflow.json` et `html.json`, comme les autres cas.

| Cas | Attendu |
|---|---|
| `fit-anonymized-real/ats-classic` | ajusté, S12/13 (police 11,5 px), marge 3,7 mm |
| `fit-anonymized-real/sidebar-modern` | ajusté, S10/15 (réduit aussi les marges de la colonne principale ; interligne 1,5), marge 2,6 mm |
| `fit-overflow/ats-classic` | **échec explicite** : dépasse encore de 11,4 mm au plancher |
| `fit-overflow/ats-modern` | **échec explicite** : dépasse encore de 31,3 mm au plancher |

Avec la marge de 5 mm, ces deux cas retenaient S13/13 (police 11 px, marge
12,3 mm) et S11/15 (interligne 1,4, marge 7,9 mm) : le seuil de 2 mm fait
retenir un état moins compressé.

Planchers (lot C2, choisis sur rendu comparé) : entrées 8 px, titres de
section 6 px, titres d'entrée 2 px, interligne 1,25, police 11 px.

Auto-tests (`runFit` dans `harness/main.tsx`) :
- **succès** : statut « tient » ; l'export après ajustement donne exactement la
  mesure annoncée ;
- **échec** : l'état plancher ne tient pas, rien n'est appliqué (l'export est
  celui du CV d'origine) ;
- **annulation** après la première mesure : rien à appliquer ;
- **seuls les réglages modifiés sont écrits** : aucune clé hors des réglages
  de l'ajustement, aucune clé écrite avec sa valeur d'origine ;
- **changement de template** après ajustement : un réglage non modifié par
  l'ajustement (resté vide) prend la valeur du nouveau template, et un réglage
  modifié garde sa valeur.

Le compte rendu (`▸ ajustement : …`) affiche l'état retenu Sᵢ/k, les réglages
écrits, la marge obtenue, le nombre de mesures et le temps.

**Vérifié par défaut volontaire** : l'ancienne mesure de l'écran (`scrollHeight`
comparé à 1123 px) remise dans l'ajustement fait échouer les 4 cas.

## Lisibilité ATS (lot 1)

Les extracteurs de texte des ATS insèrent une espace entre deux lettres quand
l'espacement des lettres (`letter-spacing`) dépasse un seuil : le titre
`EXPÉRIENCE` sort alors `E X P É R I E N C E`. Seuils mesurés sur les titres
du CV (majuscules, gras) avec pdfjs-dist, pdftotext (poppler 24.02),
pdfminer.six 20260107 et pypdf 6.19 :

| Police | pdfjs | pdftotext | pdfminer | pypdf |
|---|---|---|---|---|
| Calibri (Carlito) | 0,09 em | 0,09 em | 0,09 em | 0,10 em |
| Cambria (Caladea) | 0,09–0,10 em | 0,09–0,10 em | 0,09–0,10 em | 0,10 em |
| Georgia (Gelasio) | 0,09–0,10 em | 0,18–0,2 em | 0,10 em | 0,32 em |

Plafond retenu : `MAX_LETTER_SPACING_EM = 0.06` (exporté par
`src/components/export/PrintableCV.tsx`), avec une marge sous le seuil le plus
bas. `PrintableCV` l'applique aux titres de section (`h3`), au nom
(`.cv-name`), au poste visé (`.cv-job-title`) et aux titres de la bande
latérale (`.cv-sidebar-heading`) quand la classe `tracking-*` du template
dépasse le plafond.

Vérifications du banc (`run.ts`, `lib/html-fingerprint.ts`), bloquantes :
- **garde-fou** : pendant l'empreinte HTML, le `letter-spacing` calculé de
  chaque élément de `#printable-cv` qui porte du texte (et de ses `::before` /
  `::after` non vides) doit rester ≤ `MAX_LETTER_SPACING_EM`. Sinon le cas
  échoue avec la liste des éléments fautifs ;
- **texte extrait** : chaque titre de section (plus « Contact » dans les
  templates `sidebar-*`), le nom et le poste visé apparaissent en mots entiers
  (casse ignorée). Un texte réparti sur plusieurs lignes est accepté si les
  lignes mesurées le recomposent exactement. Les titres situés sous la coupure
  de page sont ignorés.

**Vérifié par défaut volontaire** : `tracking-[0.2em]` ajouté au résumé
(`cv-summary`) fait échouer le cas avec
`p.cv-summary… « Consultante data… » : 0.200 em`. Sans le plafond,
`minimalist` échoue (titres et nom illisibles).

### Collision intitulé / date (lot 2)

Sur la ligne d'une entrée (`.cv-title-row`, `CVEntryBlock.tsx`), l'intitulé et la
date sont deux éléments d'une rangée flex `justify-between` sans espace
imposé. Quand la ligne est pleine, l'intitulé touche la date et les extracteurs
de texte PDF collent les mots : « Paris » + « février 2020 » donne
`Parisfévrier 2020`. Un ATS lit alors un lieu inexistant et perd le début de
la date.

*Seuil mesuré* (rangée synthétique, Carlito 11 px, pdftotext, pdfminer, pypdf
et pdfjs identiques) : mots collés pour un écart de 0, 0,5 ou 1 px ; espace
insérée dès 1,5 px (0,14 em). Un espace écrit dans le HTML entre les deux
éléments d'une rangée flex est supprimé à la mise en page : il n'existe pas
dans le PDF (mesuré : toujours collé). Ce qui fonctionne est un espace
*rendu*. Sur les 54 premiers cas, l'écart minimal était de 1,1 px
(`long-titles/sidebar-tech`), 5 rangées étaient sous 3 px.

*Correctif* (`PrintableCV.tsx`, CSS du CV, aucune modification du balisage) :
- `column-gap` de 4 px (`ENTRY_DATE_GAP_PX`) entre l'intitulé et la date :
  écart géométrique garanti, 0,36 em à 11 px ;
- `.cv-title-row > :first-child::after { content: " "; white-space: pre }` :
  un vrai espace en fin de bloc d'intitulé, qui reste dans le texte du PDF
  même si l'écart tombait à zéro (vérifié à écart nul avec les quatre
  extracteurs). Placé en début de date, ou hors flux, il ne convient pas : en
  début de date il décale d'un espace la première ligne d'une date repliée
  (2,5 px mesurés), hors flux il recouvre la fin de l'intitulé à écart nul
  (« Parisfévrier » à nouveau).

*Contrôles du banc* (bloquants, sur les 56 cas) :
- **mot collé** : dans le texte pdfjs, un mois suivi d'une année, une année
  seule ou « Présent » directement précédés d'une lettre ou d'une parenthèse
  (`DATE_GLUE`, `run.ts`) ; aucun faux positif sur les 54 textes d'origine ;
- **écart minimal** : l'écart géométrique entre la fin de l'intitulé et le
  début de la date, sur la première ligne de la date, doit être d'au moins
  `ENTRY_DATE_MIN_GAP_PX` (3 px, soit 2 fois le seuil des extracteurs), mesuré
  dans `collectInPage` (`entryDateGapViolations`). Il porte sur toutes les
  entrées de tous les cas, pas seulement sur la fixture.
  Les extracteurs pdftotext, pdfminer et pypdf ne sont pas des dépendances du
  banc ; ils ont été passés une fois sur les 56 PDF (0 mot collé, contre 2
  sur `entry-date-gap` sans correctif) avec la même expression.

*Fixture `entry-date-gap`*. Chaque entrée est calibrée pour un template : en
faisant varier le texte de l'intitulé et de l'entreprise dans le DOM d'un
export réel, à 793 px (largeur réelle du CV dans le PDF), jusqu'à un écart de
0 à 0,6 px. Mesures sans correctif : 1,09 px (`ats-classic`) et 0,89 px
(`sidebar-modern`) dans le banc. À recalibrer si la largeur du CV, les polices
ou les classes des templates changent.

**Vérifié par défaut volontaire** : sans les deux règles CSS, les deux cas
échouent (`Parisfévrier 2020` dans le texte pdfjs, écart de 1,09 et 0,89 px)
et 5 cas existants échouent sur l'écart minimal (de 1,08 à 2,81 px) ; avec les
règles, tous passent.

*Effets de mise en page* (variante « écart seul », sans modifier le repli
des dates) : l'intitulé passe à la ligne un peu plus tôt quand la ligne est
pleine. 10 textes de référence changent (replis de lignes, aucun contenu
perdu), 6 marges changent d'une ligne (5,7 mm) ; le repli des dates en deux
lignes est inchangé (voir NOTES.md).

### Format des dates (lot 3A)

Deux réglages du CV (`cv.settings`, lus par `readDateSettings`, `src/lib/entry-dates.ts`) :
- `dateFormat` : `"year"` n'affiche que les années (`2020 - 2022`, `2022 - Présent`,
  `2023` pour une période dans une seule année) ; absent ou autre valeur : mois et année ;
- `showEducationYears` : `false` masque toutes les dates des entrées de type `education`
  (surcharge `datesOverride` comprise, l'élément de date n'est plus rendu) ; absent ou autre
  valeur : affichées.

Les CV existants n'ont pas ces clés : rendu identique (les 56 références d'origine sont
inchangées). Il n'y a pas de schéma Zod dans le projet : `settings` est un
`Record<string, unknown>` et les valeurs inattendues (sauvegarde importée) retombent sur
les défauts.

*Fonction centralisée* : `formatEntryDates` est utilisée par `CVEntryBlock` (tous les
templates, y compris la colonne principale des templates à bande latérale). L'export DOCX
(`export-docx.ts`) a sa propre copie de la logique, non encore branchée (lot 3B) ; l'option
`missingEnd: 'today'` conserve son comportement historique (« mars 2020 - Aujourd'hui »
quand la date de fin est vide, absent du PDF).

*Choix et limites constatés*
- **`datesOverride`** (texte libre, rempli par le générateur de CV par IA) est affiché tel
  quel dans les deux modes : `2011 – 2012 (alternance, 1 an)` reste ainsi en mode année.
  Il est masqué pour les formations quand leurs années le sont.
- **Fuseau horaire** : en mode année, l'année est lue dans la chaîne (`AAAA-MM`), donc
  indépendante du fuseau. Le mode mois et année garde son comportement historique, sensible
  au fuseau (NOTES.md §3 : un début en janvier recule d'un an à New York). Les 6 tests
  « mois et année » échouent sous `TZ=America/New_York` ; ceux du mode année passent.
- **Certifications** : elles sont toujours rendues en badges (`BADGE_ENTRY_TYPES`, avec
  compétences, langues et centres d'intérêt), donc **sans date**, avant comme après. Le
  réglage ne les concerne pas ; leurs années n'apparaissent dans aucun template.
- **Dates repliées sur deux lignes** (NOTES.md §16) : en mode année une date courte se
  replie moins, mais le problème subsiste ; l'assertion du banc tolère l'intercalation de
  texte de l'autre colonne (`2016 -` … `2020`).
- **DOCX, cas « en cours » sans date de début** : le PDF affiche « Présent », le DOCX rien.
  Divergence historique non traitée (le module affiche « Présent »).

*Contrôles du banc* (bloquants, fixtures `dates-*`, `checkDateSettings` dans `run.ts`). Les
dates attendues sont recalculées par simple lecture de la chaîne `AAAA-MM`, indépendamment
du module testé :
- mode année : chaque entrée visible (hors badges) a sa période attendue, `datesOverride`
  tel quel quand il existe, et aucun nom de mois suivi d'une année n'apparaît ;
- mode mois et année : `septembre 2022 - Présent` présent ;
- formations masquées : aucune année sur les lignes des formations visibles.
Unitaires : `src/lib/entry-dates.test.ts` (25 tests, dont fuseau négatif).

**Vérifié par défauts volontaires** (restaurés après chaque essai) :
| Défaut | Résultat |
|---|---|
| `dateFormat` ignoré | les 6 cas « année » échouent, les 3 cas « mois et année » passent |
| `showEducationYears` ignoré | les 6 cas « sans formation » échouent |
| « Présent » supprimé en mode année | les cas « année » échouent (`2022 - Présent` absent) |
| `PrintableCV` ne transmet plus les réglages | les 9 cas échouent |
| année lue via `Date` (sensible au fuseau) | 5 tests unitaires échouent sous `TZ=America/New_York` |
| fusion « même année » supprimée | 1 test unitaire échoue |
| surcharge d'une formation masquée affichée | 1 test unitaire échoue |

### Ligatures (lot « ligatures »)

pdfminer et pypdf extraient les ligatures qui ont leur propre caractère
Unicode (ﬀ ﬁ ﬂ ﬃ ﬄ, U+FB00 à U+FB04) telles quelles : « certiﬁcation » ne
correspond plus au mot-clé « certification ». pdfjs et pdftotext les
décomposent. Les autres ligatures de Carlito (ft, ti, tt…, sans caractère
Unicode) et les autres substitutions (chiffres, fractions, ordinaux,
symboles) s'extraient correctement (page de test imprimée par Chromium 141,
quatre extracteurs).

`PrintableCV` désactive les ligatures dans le CV :
`#printable-cv { font-variant-ligatures: none; }` (couvre `liga`, `clig`,
`dlig`, `hlig` et `calt`), à l'écran comme à l'impression pour que la mesure
de page suive le PDF.

**Garde-fou**, sur les mêmes éléments que celui du letter-spacing : le
`font-variant-ligatures` calculé doit valoir `none`, et le
`font-feature-settings` calculé ne doit activer ni `liga`, ni `clig`, ni
`dlig`, ni `hlig`, ni `calt` (`"liga"`, `"liga" 1` ou `"liga" on` activent ;
`"liga" 0` ou `"liga" off` non). Analyse : `enabledLigatureFeatures`
(`lib/html-fingerprint.ts`, test unitaire `lib/html-fingerprint.test.ts`).

**Vérifié par défauts volontaires** sur le résumé (`cv-summary`) :
`[font-variant-ligatures:normal]` fait échouer le cas
(`font-variant-ligatures: normal`) ; `[font-feature-settings:'liga'_1]`, avec
`font-variant-ligatures: none` toujours actif, aussi
(`font-feature-settings active liga`) et le PDF contient de nouveau
« ﬁables ». Sans la règle, les 52 cas échouent.

## Critères de comparaison

- **Pagination** : même nombre de pages.
- **Texte** : identique à l'octet près. Extraction par `lib/extract.ts` :
  fragments regroupés par ligne de base, triés par x, lignes de haut en bas.
  Depuis le lot 1, les titres sortent en mots entiers (voir Lisibilité ATS) ;
  avant, un fort espacement des lettres les faisait sortir sous la forme
  `E X P É R I E N C E` (espaces ajoutés par pdfjs).
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

### Retours à la ligne de la mesure de l'app (Windows, WebView2)

But : vérifier sur ton poste, avec ta mise à l'échelle d'affichage, que la
mesure de dépassement faite par l'app (WebView2) coupe les lignes comme
l'export réel (Chrome de `generate_pdf`). N'importe quel CV convient.

1. `bun run tauri dev` (depuis `resume-forge/`).
2. Ouvrir le CV à tester et attendre le bandeau de dépassement dans l'aperçu
   (mesure terminée).
3. Ouvrir les outils de développement (clic droit → Inspecter, ou
   Ctrl+Maj+I), onglet Console :
   `copy(JSON.stringify(window.__RF_PRINT_OVERFLOW__))`, puis coller dans un
   fichier `mesure.json`.
4. **Sans modifier le CV ni ses réglages**, exporter le PDF.
5. `bun run test:golden:compare -- --lines mesure.json <export.pdf>`

`window.__RF_PRINT_OVERFLOW__` n'existe qu'en développement
(`import.meta.env.DEV`) : la build de production est identique, octet pour
octet, à celle qui précède ce lot (vérifié). Contenu : lignes mesurées (texte,
colonne, haut, bas), marge, largeur imposée au CV (`PRINT_CV_WIDTH_PX`) et
largeur réellement obtenue dans l'iframe, `devicePixelRatio`, et une empreinte
du contenu (nombre de lignes visibles, première et dernière, SHA-256 du texte
normalisé des lignes visibles).

Le script :
- vérifie l'empreinte du fichier (copie tronquée ou modifiée → code 2) ;
- vérifie que la mesure et le PDF portent sur le même CV : première et
  dernière lignes visibles présentes dans le PDF, et au moins 90 % des lignes
  mesurées retrouvées dans son texte. Sinon : « la mesure et le PDF ne
  portent pas sur le même CV (modifié entre la copie et l'export ?) », code 2 ;
- applique le contrôle ligne par ligne du banc (`checkLineBreaks`) : code 0
  si toutes les lignes se retrouvent mot pour mot, code 1 sinon (liste des
  lignes en écart) ;
- affiche la largeur du CV dans la mesure et le `devicePixelRatio` : une
  largeur différente de 793 px signalerait un arrondi lié à la mise à
  l'échelle.

Limite : un changement de réglages de mise en page (sans changement de texte)
entre la copie et l'export n'est pas reconnu comme un autre CV ; il ressort en
code 1 (lignes coupées ou placées autrement).

Vérifié sur le banc (page de test construite en mode développement) :
mesure et PDF d'un même cas → code 0 (`anonymized-real/ats-classic`,
`long-titles/elegant`) ; mesure d'`anonymized-real` confrontée au PDF de
`long-titles` → code 2 (2/35 lignes retrouvées) ; fichier de mesure modifié →
code 2 ; mesure d'`anonymized-real/ats-classic` confrontée au PDF de
`my-settings/ats-classic` (même texte, autres réglages) → code 1.

### Dates indivisibles (lot 4)

Contrôle bloquant `wrappedDateViolations` (`html-fingerprint.ts`, branché dans
`run.ts`) : chaque `.cv-date` d'une rangée d'entrée doit tenir sur une seule
ligne (les rectangles de ses lignes, lus avec un `Range`, ne diffèrent pas de
plus de 2 px en hauteur). Avant le correctif : 116 dates repliées dans 26 cas
(« janvier 2016 - » puis « février 2020 »). Correctif dans `PrintableCV` :
intitulé `flex: 1 1 0; min-width: 0`, date `flex: 0 0 auto; max-width: 45 %`,
`column-gap` de 8 px. Sans `white-space: nowrap` : une surcharge `datesOverride`
plus longue que 45 % de la ligne se replie encore, et ce contrôle la signalerait.
Défauts volontaires : sans les deux règles flex, 26 cas échouent ; sans
`column-gap` ni espace `::after`, l'écart minimal et le mot collé échouent.
