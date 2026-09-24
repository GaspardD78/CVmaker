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
