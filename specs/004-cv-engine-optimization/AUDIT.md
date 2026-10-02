# Audit 004 - moteur de CV IA (lecture seule, état avant correction)

Référence : `tsc` propre, 375 tests verts avant tout changement. Chemins relatifs à `resume-forge/src`.
Les tests rouges de reproduction sont dans `lib/apply-ai-cv.test.ts`, `components/export/PrintableCV.test.tsx`, `lib/prompt-templates.test.ts` (21 échecs sur le code de départ, c'est voulu).
Le seul changement de production de cette phase est un refactor neutre : injection du store dans `applyAiCvToBlocks` (`opts.store`), nécessaire pour tester sans base.

## 1. Reproduction A à E

| # | Cause confirmée | Fichier:ligne | Scénario minimal | Test rouge |
|---|---|---|---|---|
| A | Confirmée. `applyAiCvToBlocks` appelle `updateCvBlock(skillHeader.id, { sectionName: skillGroups[0].category })` : l'en-tête « Compétences » devient la 1re catégorie, les autres catégories sont créées comme `section_header` de niveau section (sans `level`), donc rendues comme des titres de section. Le prompt (l.384) encourage `skillGroups`, sans seuil. | `lib/apply-ai-cv.ts` (rename ~l.47, create ~l.52-70) ; `lib/ai-cv-response.ts` `planCvBlockOrder` (contrat `groups[0].headerBlockId` = en-tête existant, l.323) | CV avec 10 compétences + `skillGroups` de 3 catégories : plus aucun en-tête « Compétences ». Réappliquer duplique les catégories (un nouveau `section_header` par application, aucun nettoyage). | `apply-ai-cv.test.ts` « A » (4 échecs) |
| B | Confirmée, deux fois. 1) `PrintableCV` rend tout `section_header` visible (`renderItem`, `block.blockType === 'section_header'`). 2) Dans la bande latérale, une section à items vides retombe dans la colonne principale avec son en-tête (`else { if (g.header) mainItems.push(...)`). Le DOCX fait pareil (`export-docx.ts` ~l.589 : seul `sectionName` falsy est ignoré). | `components/export/PrintableCV.tsx` ~l.376-399, l.413 ; `lib/export-docx.ts` ~l.589 | Masquer toutes les entrées « Formations » : le titre reste affiché. Sous-en-tête de catégorie sans compétence visible : idem. | `PrintableCV.test.tsx` « B » (5 échecs) |
| C | Confirmée. Aucune consigne de langue dans le prompt ; `CURRENT_LABEL = 'Présent'` et `MONTHS_FR` figés (`lib/entry-dates.ts` l.58-62), `fr-FR` en repli ; libellés de sections figés en français à la création (`stores/cvStore.ts` ~l.133) et imposés par le prompt (« Libellés EXACTS autorisés ») ; niveaux de langue repris tels quels. | `lib/prompt-templates.ts` l.340-421 ; `lib/entry-dates.ts` ; `stores/cvStore.ts` | Annonce EN : l'IA écrit peut-être en anglais, mais les dates (« janvier 2021 - Présent »), l'en-tête « Compétences » et « Langue maternelle » restent français. | `PrintableCV.test.tsx` « C », `apply-ai-cv.test.ts` « C », `prompt-templates.test.ts` « C/E » |
| D | Confirmée. Rien dans le prompt ni dans `apply` ne traite la pertinence des langues ; la section vient de `createCv` (un en-tête par type non vide) et reste affichée. | `lib/prompt-templates.ts` (aucune règle), `lib/apply-ai-cv.ts` | Profil avec seulement « Français - Langue maternelle » : la section Langues est affichée pour une annonce quelconque. | `apply-ai-cv.test.ts` « D » (3 échecs) |
| E | Confirmée (analyse du prompt, §2). | `lib/prompt-templates.ts` | - | `prompt-templates.test.ts` « C/E » |

## 2. Audit du prompt `generateFullCVMatchPrompt`

**Ambiguïtés et contradictions**
- « Le résultat final doit tenir sur une page » (VOLUME) contredit « Pour CHAQUE entrée ... décide visible » et l'absence de budget par expérience : l'IA ne sait pas combien de puces garder. **P0, S.**
- « Titre du poste (reprendre celui de l'annonce) » dans le schéma : pousse à s'attribuer un poste non occupé. Contredit RÉALISME. **P0, S.**
- « puces (•) » dans la consigne et l'exemple : le rendu (`MarkdownRenderer`, `CVBadgeGroup`) ne reconnaît que `- ` / `* `. Un `•` est rendu en paragraphe avec le caractère « • » : pas de liste, pas de retrait, DOCX sans puce native. **P1, S** (normalisation par le garde-fou).
- `Libellés EXACTS autorisés` pour `sectionOrder` : impose du français, incompatible avec une annonce EN. **P1, S.**
- Mise en gras `**...**` demandée par `SYSTEM_RULES` : acceptable (rendu géré), mais produit du bruit dans les badges de compétences. **P2, S.**

**`SYSTEM_RULES` inadaptées à une sortie JSON**
- Ton « comme un professionnel », « phrases courtes » : règles de rédaction libre, sans effet sur la structure. Aucune règle de forme JSON (échappement des `\n`, pas de commentaire, pas de virgule finale). **P1, M** (séparation `TEXT_RULES` / `JSON_RULES`).
- « Mettre en gras les métriques chiffrées » encourage à manipuler les chiffres. **P2, S.**

**Risques d'hallucination**
- Titre repris de l'annonce (ci-dessus). **P0.**
- `suggestedEntries` : bien encadré côté prompt, mais aucun contrôle côté code : le contexte additionnel n'est jamais comparé à la sortie. **P0, M** (garde-fou).
- Niveaux de langue : « niveau de langue normalisé ex "Courant - C1" » invite à fabriquer un C1 absent de la source. **P0, S.**
- Aucun contrôle des nombres, outils, certifications dans les puces : tout repose sur l'obéissance du LLM. **P0, M.**
- `Description` des expériences passée en une ligne (`replace(/\n/g,' ')`) : perd la structure des puces sources, l'IA ne distingue plus les réalisations. **P1, S.**

**Absences (cause de l'optimisation faible, E)**
- Pas d'analyse préalable de l'annonce, pas de liste d'exigences indispensables ; pas de mise en correspondance exigence / entrée. **P1, M.**
- Pas de langue cible, pas de budget de puces ni de caractères, pas de stratégie de mots-clés (forme exacte, sigle + forme longue). **P1, M.**
- Pas de gestion des écarts : l'IA est tentée de les combler. **P1, S.**
- Pas de dates calculées pour l'accroche : l'IA devine « X ans d'expérience » (risque de chiffre inventé). **P1, S.**
- Le profil (`_profile`) n'est pas utilisé : titre et résumé du profil absents du contexte. **P2, S.**

## 3. Audit du rendu

| Constat | Détail | Priorité / effort |
|---|---|---|
| Sections vides | voir B ; aussi un en-tête orphelin en fin de document, un en-tête suivi d'un autre en-tête | P0, M |
| Sous-en-têtes | aucun concept de niveau : un `section_header` est toujours un `<h3>` de section. Après regroupement, les catégories deviennent des titres de section. | P0, M |
| `displayFormat` | cherché sur le `section_header` précédent le plus proche (`PrintableCV` l.350, `export-docx` `getDisplayFormat`) : avec des sous-en-têtes, le format de la catégorie remplace celui de la section. | P0, S |
| Badges et sous-en-têtes | les badges sont regroupés tant qu'ils se suivent ; un sous-en-tête coupe le groupe (voulu : un groupe par catégorie). | - |
| Sauts de page | `h3` : `print:break-after-avoid` OK ; entrées et groupes de badges : `break-inside-avoid` OK. Dernière page quasi vide : non détectable sans mesure de pagination ; couvert par l'estimation de volume du garde-fou. | P2, M |
| Parité aperçu / PDF / DOCX | PDF : date de fin manquante omise ; DOCX : « Aujourd'hui » (`missingEnd: 'today'`, voulu et documenté). DOCX : `section_header` sans `sectionName` ignoré mais en-têtes vides rendus. | P1, S |
| ATS / DOCX | en-tête et format `table` des badges utilisent `Table` (`export-docx.ts` l.371, 530, 569) : lisibilité ATS moyenne, hors périmètre des anomalies. Les sous-en-têtes seront de simples paragraphes. | P2, M (non traité) |
| Sidebar | la sidebar reçoit des sections badge-only, y compris vides ; compétences et langues (infos critiques pour l'ATS) y sont placées : ordre de lecture PDF = sidebar d'abord. | P2, L (non traité) |
| Tailles | corps 11 px = 8,25 pt à l'impression ; plusieurs templates utilisent `text-[11px]`. La cible ≥ 9 pt (12 px) n'est pas respectée par défaut. Modifier les templates est transverse (11 templates, golden) : non traité, noté dans les limites. | P2, M |

## 4. Texte produit : défauts typiques (profils junior / confirmé / senior 15 ans x annonce FR / EN)

Analyse du prompt et du schéma, **pas d'exécution de LLM** (aucun accès dans cet environnement). Défauts attendus avec le prompt actuel :
- **Tous profils** : titre = intitulé de l'annonce ; puces sans verbe d'action homogène ; chiffres arrondis ou ajoutés ; tirets cadratins, « dans le cadre de » ; descriptions longues (> 120 caractères) ; mêmes puces pour toutes les expériences (pas de budget).
- **Junior** : sections « Expériences » vides ou étirées à partir de stages ; l'IA gonfle les compétences ; langues conservées alors que seule la langue maternelle est renseignée.
- **Confirmé** : 6 à 10 puces par poste, débordement de page ; résumé générique (« professionnel dynamique ») sans années d'expérience ; mots-clés de l'annonce plaqués dans le résumé.
- **Senior 15 ans** : expériences anciennes aussi détaillées que récentes ; « 15 ans d'expérience » deviné (peut être faux) ; 2e page absente ou surchargée.
- **Annonce EN** : mélange FR/EN (dates, libellés, niveaux), sigles non explicités.

## 5. Priorisation

| Prio | Item | Effort |
|---|---|---|
| P0 | A : en-tête Compétences conservé, catégories en sous-en-têtes, garde-fous de seuil, idempotence | M |
| P0 | B : sections et sous-en-têtes vides masqués (principal, sidebar, DOCX) | M |
| P0 | Titre et niveaux de langue inventés ; contrôle post-LLM des nombres et termes | M |
| P0 | D : langues conditionnelles | S |
| P1 | C : langue cible (prompt, `cvLanguage`, dates, libellés, niveaux) | M |
| P1 | E : prompt composable, analyse, budget, mots-clés, écarts, schéma v2 | L |
| P1 | Parse tolérant (texte parasite, champs inconnus) | S |
| P1 | Typographie, homogénéité, normalisation des puces | M |
| P2 | Tailles minimales, ATS (tables DOCX), ordre de lecture sidebar | M-L |
