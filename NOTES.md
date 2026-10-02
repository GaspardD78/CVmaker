# Notes — problèmes repérés hors périmètre

Relevés pendant la cartographie (session « filet de sécurité »). **Rien n'a été
corrigé** : ces points sont à traiter dans des lots dédiés, une fois les golden
tests en place. Chemins relatifs à `resume-forge/`.

1. **Route `/print` inatteignable** — `src/pages/PrintView.tsx` exporte
   `setPrintData`, mais aucun code ne l'appelle et rien n'ouvre `/print`. La
   page affiche toujours « Aucune donnée de CV trouvée ». Code mort ou
   fonctionnalité débranchée.

2. **Bandeau pleine largeur : padding mal déduit** — `getBannerPad()` dans
   `src/components/export/PrintableCV.tsx` cherche `\bp-(\d+)\b` dans
   `containerClass`, alors que tous les templates utilisent `px-NN py-NN`. La
   regex ne correspond jamais, donc le repli fixe 40px/40px s'applique (ex.
   `ats-modern` a `px-14 py-12` = 56px/48px). Sans `pageMargin` défini, le
   bandeau ne touche probablement pas les bords à l'écran.

3. **Dates sensibles au fuseau horaire** — `formatDate` dans `CVEntryBlock.tsx`
   fait `new Date('2020-03')`, interprété en UTC minuit, puis le formate en heure
   locale. Dans un fuseau à décalage négatif (Amériques), « mars 2020 » s'affiche
   « février 2020 ».
   **Résolu au lot 6** (voir point 18).

4. **Champs du profil non rendus** — `address`, `postalCode` et `country`
   existent dans `Profile` mais n'apparaissent dans aucun template.

5. **Documentation désynchronisée** — `CLAUDE.md` indique `react-markdown ^9.x`,
   `package.json` déclare `^10.1.0`.

6. **Export PDF desktop limité à une page (contenu tronqué)** — mis en évidence
   par les golden tests. `exportPdfDesktop` (`src/lib/export-pdf.ts`) intègre
   **toutes** les feuilles de style de l'app dans le HTML envoyé à Chromium,
   dont deux règles de `src/App.css` pensées pour l'interface :
   `html, body, #root { height: 100%; overflow: hidden; }` et, en
   `@media print`, `#printable-cv { position: fixed; top: 0; left: 0; … }`.
   Combinées, elles limitent le document imprimé à la hauteur d'une page : tout
   ce qui dépasse la page 1 disparaît du PDF, sans page 2. Vérifié sur une copie
   du HTML exporté : il faut neutraliser les deux règles pour obtenir 2 pages ;
   une seule ne suffit pas. Les références golden figent ce comportement actuel
   (ex. `anonymized-real` : les sections Projets et Compétences sont absentes
   du texte de référence).
   **Suivi** : le CV doit tenir sur une page (choix volontaire). La troncature
   est désormais détectée avant l'export (lot A : `src/lib/print-overflow.ts`
   et confirmation dans le CV builder). La coupure elle-même est conservée.
   Non couverts : export Android (html2canvas, plusieurs pages, pas de
   troncature), repli `window.print()`, et export du mode Markdown (même
   `exportNativePdf`, sans confirmation).


7. **Le HTML d'export contient tout le CSS de l'interface** — `getInlinedStyles`
   (`src/lib/export-pdf.ts`) intègre toutes les feuilles de style de l'app
   (~120 Ko), pas seulement celles du CV. Toute nouvelle classe Tailwind
   utilisée **n'importe où** dans l'interface modifie donc le HTML exporté, sans
   changer le rendu du PDF. Au lot B2, le bandeau et le trait utilisent des
   styles en ligne pour garder les 48 HTML d'export identiques octet pour octet
   (exigence abandonnée ensuite : voir le critère de non-régression dans
   `tests/golden/README.md`).
   Tailwind détecte aussi un mot comme `sticky` dans un simple texte source.
   C'est la même cause que le point 6 (règles de l'interface qui fuient dans
   l'export).

8. **`PrintableCV` réécrit son `<style>` à chaque rendu** — le `<style>` injecté
   via `dangerouslySetInnerHTML` voit son nœud texte remplacé à chaque rendu,
   même à contenu identique. `usePrintOverflow` l'ignore en comparant le HTML de
   `#printable-cv` (sinon, une nouvelle mesure serait relancée après chaque
   résultat). Sans effet visible, non corrigé.

9. **Le `<style>` de `PrintableCV` figure deux fois dans le HTML d'export** —
   `getInlinedStyles` (`src/lib/export-pdf.ts`) recopie dans l'en-tête toutes les
   balises `<style>` du document, y compris celle qui est injectée dans
   `#printable-cv`. Ses règles apparaissent donc deux fois (en-tête et
   `#printable-cv` cloné), ce qui se voit dans l'empreinte HTML du banc (règles
   en double). Sans effet sur le rendu, non corrigé. À traiter avec le lot
   « CSS d'export isolé ».

10. **BUG Android : « Ajuster à 1 page » applique tous les planchers après un
    échec.** Sur Android et dans le navigateur, le bouton utilise encore l'ancien
    algorithme (`handleFitToPageLegacy`, `LeftPanel.tsx`). Il modifie l'état
    local de `LeftPanel`, alors que l'aperçu lit les réglages du store, mis à jour
    seulement par la sauvegarde différée (1 s) : la hauteur mesurée ne change
    pas pendant la boucle. Si le CV ne tient pas au départ, tous les candidats
    sont parcourus, le message « reste trop long » s'affiche, puis la sauvegarde
    applique **tous les planchers** (police 9 px, interligne 1,2, espacements de
    2 à 4 px). À corriger dans un lot Android séparé. Sur Android, l'export
    (html2canvas + jsPDF, plusieurs pages) utilise les styles d'écran : la mesure
    à employer n'est pas `measurePrintOverflow`.

11. **Mises en page à deux colonnes : lignes fusionnées à l'extraction (limite
    ATS).** Dans les templates `sidebar-*`, un extracteur qui regroupe le texte
    par ligne de base mêle les deux colonnes. Par exemple, `sidebar-elegant`
    (`anonymized-real`) donne `EXPÉRIENCE PROFESSIONNELLE 06 00 00 00 00` : le
    titre de la colonne principale est accolé au téléphone de la bande latérale.
    Le résumé est aussi coupé par `CONTACT`. Les mots restent entiers (lot 1),
    mais un ATS peut mal rattacher ces champs. C'est une limite structurelle des
    mises en page à deux colonnes, pas corrigée : à signaler dans le choix du
    template (un template à une colonne reste le plus sûr pour les ATS).

12. **Classes `tracking-*` devenues sans effet (lot 1).** Au-delà de
    `MAX_LETTER_SPACING_EM` (0,06 em), `PrintableCV` plafonne l'espacement des
    lettres des titres de section, du nom et du poste visé. Les classes
    `tracking-[0.2em]`, `tracking-widest`, etc. des `headingClass`, `nameClass`
    et `headerTitleClass` dans `src/templates/*.ts` ne font donc plus rien à
    l'export (ni dans l'aperçu, qui utilise le même `PrintableCV`). À nettoyer
    dans un lot dédié, template par template, avec le banc (rendu identique
    attendu).

13. **Nom composé coupé au trait d'union : pdftotext colle les deux parties
    (limite acceptée au lot 1).** Quand un nom passe à la ligne sur un trait
    d'union, pdftotext (poppler) supprime ce trait d'union en fin de ligne :
    `long-titles/minimalist` donne `… DE LA ROCHEFOUCAULDMONTMORENCY`. Déjà le
    cas avant le lot 1 pour `long-titles/executive`. Pour `minimalist`, c'est
    une conséquence du lot 1 : le nom, plus étroit, passe à la ligne au trait
    d'union au lieu de l'espace. pdfjs, pdfminer et pypdf gardent le trait
    d'union. Seul pdftotext est touché, sur un nom fictif extrême.

14. **Ligatures dans le texte extrait.** pdfminer et pypdf extraient « ﬁ »
    (U+FB01) au lieu de « fi » (ex. `artiﬁcielle`). On ne peut pas supposer
    que tous les ATS convertissent la ligature : un mot-clé comme
    « certification » pourrait ne pas être trouvé. pdfjs et pdftotext donnent
    « fi ». **Corrigé** (lot « ligatures ») : `font-variant-ligatures: none`
    sur `#printable-cv`, garde-fou dans le banc.

15. **Bruit PNG au-dessus du seuil sur `tight/elegant` (lots « marge » et 2).**
    `tight/elegant` diffère de sa référence de 17 à 21 px (écart de composante
    26, bords de glyphes isolés, texte identique), au-delà du seuil de 8 px par
    page (`MAX_DIFF_RATIO`, calibré sur un bruit maximal de 5 px). Observé sur
    4 passes complètes sur 8 environ, toujours sur ce seul cas, presque toujours
    sur la première passe d'une série, jamais sur 6 passes limitées aux cas
    `tight`. Aucun lien avec le contenu : le cas est à une colonne, sans
    changement de mise en page. `--update` peut enregistrer une référence
    bruitée : au lot 2, la référence de `tight/elegant` a été restaurée à celle
    de `main`. Seuil non modifié. À traiter dans un lot dédié : chercher la
    cause (cache de polices à froid ? ordre des cas ?) avant de toucher au
    seuil ; sinon refaire la mesure du bruit (README, section Seuils).
    **Résolu au lot 5.** Cause : la page pdfjs de rastérisation était réutilisée
    par tous les cas ; le même PDF (identique octet pour octet) y donnait
    plusieurs images différentes. `GoldenRenderer.rasterize` ouvre maintenant une
    page neuve par PDF : 0 écart sur 100 rendus de `tight/elegant`, 3 passes
    complètes à 65/65 avec 0 pixel d'écart, références inchangées, seuils non
    modifiés (README, section « Une page de rastérisation neuve par PDF »).
    Resserrer les seuils reste à faire dans un lot à part.

16. **Dates coupées en deux lignes à l'export (lot 2).** Parce que la date d'une
    entrée peut rétrécir (`flex-shrink`), elle est repliée sur 2 lignes ou plus
    dans 94 rangées sur 395 des cas du banc : `janvier 2010` puis `- août 2015`,
    `2018 -` puis `2019`. Pour un ATS, une date coupée est au moins aussi
    gênante qu'un mot collé. Non corrigé par le lot 2.
    **Corrigé au lot 4** (variante B8) : voir l'entrée « Lot 4 ».

17. **Export DOCX : dates dupliquées, désormais centralisées (lot 3B).** Avant ce
    lot, `export-docx.ts` recopiait `formatDate`, `formatDateYear` et la logique
    de période du PDF, et ignorait les réglages de dates : il affichait les années
    de formation même masquées dans le PDF. PDF et DOCX utilisent maintenant
    `formatEntryDates` (`src/lib/entry-dates.ts`) et lisent `dateFormat` et
    `showEducationYears`. Deux écarts avec le PDF, traités ainsi :
    - **conservé** : une entrée avec début, sans fin et pas « en cours » affiche
      « mars 2020 - Aujourd'hui » dans le DOCX (`missingEnd: 'today'`), seulement
      « mars 2020 » dans le PDF ;
    - **résolu** : une entrée « en cours » sans date de début affiche « Présent »
      dans le DOCX, comme dans le PDF (le DOCX n'affichait rien).
    Le DOCX n'avait aucun test ; `src/lib/export-docx.test.ts` en ajoute 10.

18. **Fuseau horaire : deux lectures des dates (lots 3A et 3B), résolu au lot 6.**
    Le mode « année » lisait l'année dans la chaîne, le mode « mois et année » passait
    par `Date` : `new Date('2007-01')` est lu en UTC puis affiché en heure locale, donc
    dans un fuseau à décalage négatif (Amériques) un 1er du mois reculait d'un mois, et
    d'une année pour janvier (New York : `2007-01` donnait 2006 en formation, « février
    2020 » pour `2020-03`). Les formats non ISO (`Jan 2020`) étaient lus en heure
    locale et ne bougeaient pas. Lot 6 : `formatMonthYear` (`entry-dates.ts`) lit le
    mois et l'année dans la chaîne (`AAAA`, `AAAA-M`, `AAAA-MM`, `AAAA-MM-JJ`, heure
    éventuelle lue telle quelle), avec une table de noms de mois ; un autre format suit
    l'ancienne lecture via `Date`. Une année seule (`2020`) reste « janvier 2020 », comme
    avant (anomalie conservée volontairement). Même correctif dans le résolveur de
    prompts IA (`prompt-resolver.ts`, copie dupliquée du défaut). `tz-new-york` est
    devenu une garde (texte identique à Paris) et `entry-dates.test.ts` teste 9 fuseaux
    par sous-processus. Aucun autre cas du banc n'a changé.

19. **Certifications : toujours des badges, jamais de date (lot 3A).** Les types
    rendus en badges (`BADGE_ENTRY_TYPES` : compétences, langues, centres d'intérêt
    et certifications) n'affichent aucune date, ni dans le PDF ni dans le DOCX,
    avant comme après les lots 3A et 3B. La branche `certification` de
    `CVEntryBlock`/`entry-dates.ts` (années seules) n'est donc jamais atteinte avec
    les mises en page actuelles, et `showEducationYears` ne les concerne pas.
    Afficher la validité d'une certification (AZ-900…) serait une évolution à
    part (format de badge avec année).

20. **Donnée personnelle réelle versionnée : `resume-forge/mesure.json` (constaté
    au lot 4, résolu).** Le fichier, ajouté sur `main` par le commit `1ff5983`
    (« Create mesure.json »), contenait les lignes mesurées d'un CV avec un nom, une
    adresse e-mail et un numéro de téléphone qui semblaient réels, contrairement à
    la règle « aucune donnée personnelle réelle versionnée ». **Résolu** : le
    fichier a été retiré de l'historique de `main` par `git filter-repo`
    (réécriture limitée aux descendants de `1ff5983`) et `main` a été mis à jour de
    force. Les commits antérieurs à `1ff5983` gardent leur hash ; les lots 4 et
    suivants ont été réécrits. Le dépôt était public : la donnée reste à considérer
    comme exposée (clones, forks, caches) ; les mesures de ce côté (coordonnées
    concernées, demande de nettoyage des références de PR au support GitHub) sont
    à la charge du propriétaire du dépôt.

21. **Dates sans heure du suivi de candidatures, même défaut (constaté au lot 6, non
    corrigé).** `nextActionDate` (`AAAA-MM-JJ`) est lue par `new Date()` (UTC) puis
    comparée à un « aujourd'hui » local : dans `KanbanCard.tsx` (`getUrgencyColor`,
    lignes 29 à 30) la couleur d'urgence est décalée d'un jour dans un fuseau à décalage
    négatif, et la date affichée (`toLocaleDateString`, ligne 132) est celle de la
    veille. `export-applications.ts` (lignes 364 à 365) lit la borne de début en UTC et
    la borne de fin (`T23:59:59`) en heure locale. Hors du rendu du CV : à traiter, si
    voulu, avec la même approche (lire `AAAA-MM-JJ` dans la chaîne).

## Lots à prévoir

- **Lot B : indicateur dans l'aperçu.** `usePrintOverflow`, bandeau dans
  `RightPanel` (dépassement, ou marge restante en mm) et trait de coupure
  mesuré à la place du repère fixe « Limite Page 1 » (295 mm à l'écran, faux
  car les marges d'impression diffèrent de celles de l'écran).
  - B1 (fait) : `overflowStatus` partagé, ancrage des lignes
    (`resolveLineAnchor`), annulation (`AbortSignal`), mémorisation de la
    dernière mesure complète (polices chargées, images décodées), auto-tests
    dans le banc.
  - B2 (fait) : `usePrintOverflow` (mesure différée de 600 ms puis au prochain
    moment d'inactivité, annulée si le CV change), `OverflowBanner` (bandeau et
    trait de coupure), `RightPanel`. `exportPdfDesktop` utilise `overflowStatus`.
    Desktop uniquement : sur Android et dans le navigateur, le repère
    « Limite Page 1 » est conservé.
- **Lot « CSS d'export isolé » (point 7).** N'intégrer au HTML d'export que le
  CSS utile à `#printable-cv`, au lieu de toutes les feuilles de style de
  l'app. Les classes de l'interface ne toucheraient plus le HTML exporté, ce qui
  rendrait possible un bandeau d'aperçu collant (abandonné au lot B2). Ce lot
  touche à ce qui s'applique au CV : il doit passer le banc (texte et PNG
  identiques) et réévaluer les règles d'interface qui fuient aujourd'hui dans
  l'export (point 6).
- **Point 8 (`<style>` réinjecté à chaque rendu de `PrintableCV`).** À traiter
  avec le lot « CSS d'export isolé » ou séparément. Le contournement dans
  `usePrintOverflow` (comparaison du HTML de `#printable-cv`) pourra alors
  être retiré.
- **Comparaison automatique des HTML d'export dans le banc** (fait) : empreinte
  du balisage de `#printable-cv` et des règles CSS applicables, bloquante ;
  empreinte du HTML complet, informative (`tests/golden/README.md`, section
  Empreinte du HTML d'export).
- **Lot C : aligner « Ajuster à 1 page » sur `measurePrintOverflow`** (fait,
  desktop).
  - C1 : `src/lib/fit-to-page.tsx` (échelle de compression, dichotomie, mesure
    identique à l'export, patch limité aux réglages modifiés) et suite `fit` du
    banc.
  - C2 : branchement dans `LeftPanel`/`DesignPanel` (bouton « Ajustement… »
    pendant le calcul, annulation si le CV ou un réglage change). Planchers
    choisis sur rendu comparé : entrées 8 px, titres de section 6 px, titres
    d'entrée 2 px, interligne 1,25, police 11 px. En cas d'échec, rien n'est
    modifié et le message indique ce qui dépasse encore.
  - Android et navigateur : ancien algorithme conservé, voir le bug du point 10.
- **Lot Android : corriger « Ajuster à 1 page »** (point 10).
- **Vérification côté Rust : non nécessaire pour l'usage actuel (Windows).**
  Sous Windows, la webview (WebView2) utilise le même moteur Chromium que
  l'export : la mesure dans la webview suffit. À rouvrir si l'export doit un
  jour fonctionner sous macOS ou Linux (webview WebKit) : il faudrait alors
  mesurer aussi dans le Chrome de l'export (`generate_pdf`).
- **Marge de sécurité de la mesure** (décidée, lot A). À l'impression, le
  texte est très légèrement plus large qu'à l'écran : quelques lignes longues
  passent à la ligne plus tôt, et le contenu suivant descend d'environ une ligne
  (pire écart observé : 4,6 mm). Sous `OVERFLOW_SAFETY_MARGIN_MM` (5 mm), l'export
  demande confirmation « de justesse ». À réévaluer si la vérification côté
  Rust est un jour réalisée (mesure dans le Chrome même de l'impression).
  **Cause trouvée (lot « retours à la ligne »)** : ce n'est pas le texte qui est
  plus large à l'impression, c'est le CV qui y est plus étroit (793 px au lieu
  de 794 px, voir `PRINT_CV_WIDTH_PX`). Mesure corrigée : 0 ligne coupée
  autrement sur les 52 cas.
  **Réévaluée à 2 mm** (lot « marge ») : 0 retour à la ligne différent sur les
  52 cas et sur une validation croisée Windows (WebView2, 48/48 lignes, 793 px),
  écart vertical résiduel de 0,3 mm au plus, plus une réserve pour les écarts
  de version entre WebView2 et Chrome. Commentaire de la constante réécrit.
  Effets : `anonymized-real/academic` (3,2 mm) passe « de justesse » → « tient » ;
  « Ajuster à 1 page » retient un état moins compressé (`ats-classic` :
  S13 → S12, police 11,5 px, marge 12,3 → 3,7 mm ; `sidebar-modern` :
  S11 → S10, interligne 1,5, marge 7,9 → 2,6 mm).
- **Lot 1 : titres de section lisibles par les ATS** (fait). Plafond
  `MAX_LETTER_SPACING_EM = 0.06` sur les titres de section, le nom, le poste
  visé et les titres de la bande latérale ; garde-fou et assertions ATS dans le
  banc (`tests/golden/README.md`, section Lisibilité ATS). Restent les points
  11 à 14.
- **Lot futur : pas de coupure au trait d'union dans le nom et le poste visé**
  (point 13). Les noms composés (prénoms et noms à trait d'union) sont
  fréquents en France : empêcher le passage à la ligne sur le trait d'union
  dans `.cv-name` et `.cv-job-title`, sans changer le caractère (pas de trait
  d'union insécable U+2011, que les ATS verraient comme un autre caractère).
  Touche au balisage ou au CSS du CV : références à régénérer, vérification
  sur les 11 templates et les quatre extracteurs.
- **Lot « ligatures »** (fait, point 14). `font-variant-ligatures: none` sur
  `#printable-cv` (couvre `liga`, `clig`, `dlig`, `hlig` et `calt`).
  Garde-fou dans le banc sur les styles calculés (sans nouvelle dépendance) :
  `font-variant-ligatures` doit valoir `none` et `font-feature-settings` ne
  doit réactiver aucune de ces fonctionnalités (`tests/golden/README.md`,
  section Lisibilité ATS). Seules les ligatures qui ont un caractère Unicode
  (ﬀ ﬁ ﬂ ﬃ ﬄ) étaient mal extraites ; les autres ligatures de Carlito (ft,
  ti, tt…) et les autres substitutions (chiffres, fractions, ordinaux,
  symboles) s'extrayaient déjà correctement.
  Effet de bord observé : le contrôle de l'époque ne signalait plus aucune
  ligne coupée autrement qu'à l'impression, et la marge mesurée de
  `long-titles/ats-modern` est passée de 28 à 22,8 mm, valeur conforme au PDF.
  **Correction (lot « retours à la ligne »)** : ce contrôle cherchait chaque
  ligne mesurée dans le texte du PDF mis bout à bout ; il ne voyait pas un mot
  renvoyé à la ligne suivante. Un contrôle exact trouvait encore 10 lignes
  coupées autrement (4 cas). Leur cause n'était pas les ligatures mais la
  largeur du CV (794 px mesurés, 793 px imprimés), corrigée par ce lot.
- **Lot « retours à la ligne »** (fait, partie A). Contrôle exact et bloquant
  dans le banc : chaque ligne mesurée doit être, mot pour mot, une ligne du PDF
  (`checkLineBreaks`, `tests/golden/lib/extract.ts`). Cause des écarts : à
  l'impression, #printable-cv (`position: fixed`) fait 793 px (zone de page
  A4 tronquée par Chrome), contre 794 px dans l'iframe de mesure (fenêtre
  arrondie). Correctif : largeur imposée au CV dans l'iframe
  (`PRINT_CV_WIDTH_PX`). Garde-fou : impression de contrôle à chaque cas,
  largeur réelle comparée à celle de la mesure.
- **Lot « retours à la ligne », partie B** (fait). En développement seulement
  (`import.meta.env.DEV`), `measurePrintOverflow` expose la dernière mesure
  complète dans `window.__RF_PRINT_OVERFLOW__` (lignes, largeur du CV,
  `devicePixelRatio`, empreinte du contenu). `test:golden:compare -- --lines`
  la confronte au PDF exporté : même CV (sinon code 2), puis contrôle ligne par
  ligne du banc (code 0 ou 1). Build de production inchangée (identique octet
  pour octet). Procédure Windows : `tests/golden/README.md`, section
  Validation croisée. À faire par l'utilisateur : validation sous Windows
  avec mise à l'échelle d'affichage.
- **Couverture du statut « de justesse » dans le banc** (fait, lot « marge »).
  Depuis la marge de 2 mm, `anonymized-real/academic` (3,2 mm) tient : la
  fixture `tight` (calibrée à partir d'`anonymized-real` : 3 expériences
  retirées, 54 mots ajoutés au résumé) tient de justesse sur `elegant` (1,1 mm)
  et `sidebar-elegant` (0,7 mm), statut attendu fixé dans `run.ts`. Voir
  `tests/golden/README.md`, section `tight` : calibrage.
- **Lot « collision intitulé / date »** (fait, lot 2). `column-gap` de 4 px et
  espace rendu en fin de bloc d'intitulé dans le CSS de `PrintableCV`, contrôles
  bloquants (mot collé dans le texte pdfjs, écart minimal de 3 px) et fixture
  `entry-date-gap` (`tests/golden/README.md`, section Collision intitulé / date).
- **Lot 6 : fuseau horaire des dates** (fait, points 3 et 18). `formatMonthYear` dans
  `entry-dates.ts` : mois et année lus dans la chaîne, sans `Date`, pour le PDF, le DOCX
  et le résolveur de prompts IA. `tz-new-york` : texte identique à Paris (assertion
  bloquante) ; `entry-dates.test.ts` : 9 fuseaux en sous-processus. Défaut du suivi de
  candidatures consigné au point 21.
- **Lot 4 : dates indivisibles** (fait, point 16). Dans `PrintableCV` : intitulé
  `flex: 1 1 0; min-width: 0`, date `flex: 0 0 auto; max-width: 45 %`,
  `column-gap` de 8 px, espace `::after` du lot 2 conservé. Contrôle bloquant du
  banc (`wrappedDateViolations`) : aucune `.cv-date` sur plusieurs lignes ;
  il relevait 116 dates repliées dans 26 cas avant le correctif, aucune après.
  Pas de `white-space: nowrap` : une surcharge `datesOverride` plus longue que 45 %
  de la ligne se replie encore, plutôt que de déborder. 17 cas recalibrés
  (`overflow.json`), tous à bande latérale sauf `long-titles/elegant`. La
  fixture `tight` perd la fin de son résumé (5 mots) : `sidebar-elegant` passe de
  0,7 à 0,4 mm de marge (0,7 mm n'est pas atteignable par le contenu, une ligne
  vaut environ 5 mm), toujours « de justesse ».
- **Lot 3 : format des dates** (fait). 3A : `dateFormat` (`"year"`) et
  `showEducationYears` (`false`) dans `cv.settings`, module `entry-dates.ts`,
  fixtures `dates-*` du banc. 3B : sélecteur « Format des dates » et case
  « Afficher les années des formations » (zone « Typographie & Mise en page » du
  `DesignPanel`), persistance dans `LeftPanel` (état, resynchronisation au
  changement de template, sauvegarde différée de 1 s) et export DOCX. Le
  texte libre `datesOverride` reste affiché tel quel dans les deux modes
  (masqué pour une formation masquée). À valider à la main sous `tauri dev`.
