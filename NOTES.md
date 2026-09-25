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
- **Lot C : aligner « Ajuster à 1 page » sur `measurePrintOverflow`.**
  `handleFitToPage` (`LeftPanel.tsx`) compare le `scrollHeight` **à l'écran** à
  297 mm, alors que l'export imprime avec des marges de 8px 10px au lieu de
  40px 48px. Le bouton peut donc dire « tient » quand la confirmation d'export
  annonce un dépassement, ou l'inverse.
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
