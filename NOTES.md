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


## Lots à prévoir

- **Lot B : indicateur dans l'aperçu.** `usePrintOverflow`, bandeau dans
  `RightPanel` (dépassement, ou marge restante en mm) et trait de coupure
  mesuré à la place du repère fixe « Limite Page 1 » (295 mm à l'écran, faux
  car les marges d'impression diffèrent de celles de l'écran).
- **Lot C : aligner « Ajuster à 1 page » sur `measurePrintOverflow`.**
  `handleFitToPage` (`LeftPanel.tsx`) compare le `scrollHeight` **à l'écran** à
  297 mm, alors que l'export imprime avec des marges de 8px 10px au lieu de
  40px 48px. Le bouton peut donc dire « tient » quand la confirmation d'export
  annonce un dépassement, ou l'inverse.
- **Lot à décider : vérification côté Rust.** Mesurer aussi dans le Chrome de
  l'export (`generate_pdf`) pour les webviews qui ne sont pas Chromium
  (WebKit sous macOS et Linux). Hors lots A et B.
- **Marge de sécurité de la mesure** (décidée, lot A). À l'impression, le
  texte est très légèrement plus large qu'à l'écran : quelques lignes longues
  passent à la ligne plus tôt, et le contenu suivant descend d'environ une ligne
  (pire écart observé : 4,6 mm). Sous `OVERFLOW_SAFETY_MARGIN_MM` (5 mm), l'export
  demande confirmation « de justesse ». À réévaluer si le lot Rust est réalisé
  (mesure dans le Chrome même de l'impression).
