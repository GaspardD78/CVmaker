# Changelog

Tous les changements notables de ResumeForge sont documentés ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Non publié] - 2026-10-29

### Moteur de CV IA : ciblage, étape 4 (garde-fou)

- **Ajout** : avertissements du garde-fou liés au ciblage (`lib/cv-target-guard.ts`), jamais bloquants, absents sans ciblage :
  - `target-forbidden-term` : terme de `avoidTerms` de la fiche dans le titre, l'accroche, une puce ou un override (mots entiers, entrées visibles), avec l'équivalence de la fiche quand elle existe ;
  - `target-equivalence-applied` : un titre ou un `titleOverride` traduit via la table d'équivalences de la fiche ; hors de la table, l'avertissement `unsupported-title` existant (le titre du CV traduit par équivalence n'en déclenche plus) ; CV non français : traductions fidèles hors contrôle ;
  - `target-photo` : photo présente alors que la fiche la déconseille (public) ;
  - `target-reader-mentioned` : nom ou fonction du premier lecteur, ou personne qui transmet le CV, présents dans le CV (une expression du profil du candidat lui-même est ignorée).
- **Ajout** : `readerName` (nom du premier lecteur) dans le ciblage. L'anti-invention reste identique quel que soit le ciblage (test).

---

### Moteur de CV IA : ciblage, étape 3 (détection et `analyse.cible`)

- **Ajout** : détection automatique côté application (`lib/cv-target-detect.ts`) à partir du texte de l'annonce et du nom de l'entreprise : `public` (via `isPublicSectorText`, sans les faux positifs « administration système »), `esn`, `cabinet`, et `annonce` dès qu'un texte est fourni. Un signal absent ou contradictoire ne détecte rien.
- **Ajout** : champ additif `analyse.cible` (`type`, `intention`, `premierLecteur`, `raison`), lu avec tolérance (casse, accents, variantes de clés). Le prompt le demande pour les axes encore par défaut (type, intention, premier lecteur), y compris quand tout est en auto et rien n'est détecté : c'est alors la seule différence avec le prompt d'avant, sans fiche ni changement de règles, et le CV produit reste identique. La proposition n'est jamais appliquée à ce CV : elle est rapportée (`ApplyReport.target`) pour « Ciblage proposé » / « Appliquer et régénérer » (interface à l'étape 5). Un choix explicite ou un type détecté par l'application n'est jamais remplacé en silence.
- **Ajout** : instantané `cv.settings.target` (ciblage effectif, fiche comprise) écrit à l'application quand le ciblage est fourni (le ciblage réellement utilisé, pas la proposition de l'IA) ; relecture validée (`readTargetSnapshot`). L'historique d'un CV ne bouge pas si les fiches changent.

---

### Moteur de CV IA : ciblage, étape 2 (bloc de prompt)

- **Ajout** : section « Cible et intention » du prompt (`lib/cv-target-prompt.ts`) : attentes, éléments à mettre en avant, à éviter (consignes et termes), vocabulaire et équivalences de la fiche, démarche (annonce, spontanée, recommandation, mobilité interne, approche de chasseur), formulaire de cible (entreprise, activité, contexte RH, postes envisagés, atouts, personne qui transmet le CV) et premier lecteur avec « ce que valorise ce lecteur » (jamais cité dans le CV). Option `target` de `CvPromptOptions`.
- **Ajout** : règle des mots-clés à trois niveaux (`atsLevelFor`) : `strict` (texte historique), `leger` (candidature spontanée avec fiche ATS : intitulés et compétences standards du métier visé, une fois chacun) et `off` (recommandation, mobilité interne, approche de chasseur, fiche sans ATS). Le premier lecteur garde la priorité.
- **Ajout** : dictionnaire annonce / cible centralisé (`lib/cv-wording.ts`) : sans texte d'annonce, tout le texte d'instruction parle de « cible » ; données et règles personnelles jamais réécrites ; clé JSON `langue_annonce` inchangée.
- **Ajout** : règle de titre par fiche, dont `equivalence` (titre du profil traduit via les équivalences de la fiche, sinon intitulé exact d'une expérience, sinon titre du profil avec remarque dans `warnings`) ; orientation par défaut de la fiche quand aucun réglage n'est fourni.
- **Compatibilité** : tout en `auto` sans détection, le prompt est identique à l'existant (instantanés inchangés).

---

### Moteur de CV IA : ciblage, étape 1 (fiches et résolution)

- **Ajout** : `lib/cv-targets.ts` : types `TargetType` / `Intent` / `FirstReader`, sept fiches de départ génériques (`DEFAULT_TARGET_SHEETS`), `resolveTarget` (choix explicite > détection > défaut), `defaultFocusFor`, `atsEnabledFor`, `titleRuleFor` (règle de titre `equivalence` ajoutée). Fiches personnalisables par profil (`cv_target_sheets:{profileId}`, seuls les champs modifiés, reprise par la sauvegarde). Aucun effet visible : le prompt n'utilise pas encore ces données. Voir `specs/008-cv-targeting/`.

---

### Moteur de CV IA : mentions d'en-tête (lot 1)

- **Ajout** : permis de conduire et mentions libres d'en-tête sur le profil (migration 025 `driving_license`, `header_extras`, avec fallback `db.ts`). Formulaire du profil : champ permis et liste éditable de mentions.
- **Ajout** : affichage dans l'en-tête de tous les templates (variantes sidebar comprises) et dans l'export DOCX, après la ville. Réglages par CV `showDrivingLicense` et `hiddenHeaderExtras` (cases à cocher dans « Paramètres de ce CV »).
- **Ajout** : champ optionnel `header` du JSON IA (`showDrivingLicense`, `extras`). Le garde-fou ne garde que les mentions présentes dans le profil (`header-extra-invented`) ; l'application n'écrit que `cv.settings`, jamais le profil. Un JSON v2 sans `header` s'applique à l'identique.

### Moteur de CV IA : orientation « missions et périmètre » (`cv_bullet_focus`)

- **Ajout** : réglage d'orientation des puces, `missions` (défaut) ou `resultats`. Par profil (`settings`, clé `cv_bullet_focus:{profileId}`, Paramètres > « Orientation du CV »), avec surcharge par CV (`cv.settings.bulletFocus`, « Paramètres de ce CV » et générateur de la Veille). Priorité : CV > profil > défaut de la cible (`resolveBulletFocus`, 3e paramètre prêt pour le ciblage) > `missions`. Le réglage suit la sauvegarde par profil.
- **Changé** : tout le texte de prompt qui dépend de l'orientation est centralisé dans `lib/cv-focus-rules.ts` (définition de la puce, gras, accroche, règle des chiffres, consigne `warnings`, exemple du schéma, prompt d'enrichissement du profil, exemple du modèle Markdown). En `missions` : bloc « Orientation : périmètre et missions » (français ou anglais selon la langue du CV), 3 chiffres au maximum hors années, aucun gras, `warnings` = périmètres à préciser. En `resultats` : texte historique à l'identique (instantanés inchangés). Schéma JSON inchangé.
- **Ajout** : garde-fou en `missions` : `too-many-numbers` (plus de 3 chiffres distincts, hors années 1950 à aujourd'hui, dates et durées), `bold-in-missions-mode` (gras retiré), `summary-has-numbers`. L'anti-invention (`invented-number`, bloquant) est identique dans les deux modes. Le rapport titre les questions de l'IA « Périmètres à préciser ».
- **Changé** : structure d'accroche par défaut de l'angle « Évaluation et formation » : `{périmètre}` remplace `{preuve de formation}` (les angles déjà enregistrés ne sont pas modifiés) ; exemple du modèle Markdown neutre.

---

## [Non publié] - 2026-10-05

### Veille emploi : refonte de l'analyse IA (spec 005)

- **Changé** : les boutons « Optimiser » et « Diagnostic » génèrent un seul prompt (`generateWatchAnalysisPrompt`, deux modes) construit depuis un contexte factuel : règles exactes du moteur (générées depuis les poids du scorer), profil candidat (expérience, lieu, contrat), configuration avec libellés uniques (« Mots-clés bonus », « Domaines bonus »), incohérences détectées par code, métriques avec période et dénominateur, signaux appris avec compteur, et jusqu'à 30 offres dédoublonnées (entreprise, lieu, source, contrat, salaire, télétravail, âge, extrait, score entier décomposé, action). Les anciens générateurs restent comme adaptateurs dépréciés.
- **Ajout** : la réponse de l'IA est un JSON `watch-analysis/v1`. L'écran « Appliquer les recommandations » le lit tolérablement, valide les libellés APEC, applique des garde-fous (exclusion présente dans une offre importée ou aimée bloquée, intitulé déjà porté par une autre piste bloqué, jamais tous les intitulés retirés), simule l'effet sur les offres des 30 derniers jours (gagnées, perdues, perdues aimées surlignées), affiche le diff avec cases à cocher et laisse un instantané pour annuler.
- **Changé** : portée des exclusions par terme. « Exclure ces rôles » (`excludeTitles`) n'élimine plus que sur le **titre** ; « Exclure ces secteurs » (`excludeDomains`) garde le veto titre + description (score inchangé). La portée se règle terme par terme dans la configuration. Les profils existants n'ont aucune donnée réécrite.
- **Ajout** : `requiredDomains` (optionnel, vide par défaut) : aucun domaine obligatoire présent = score plafonné à 25 (écarté en mode strict).
- **Corrigé** : un terme finissant par une lettre accentuée (« cybersécurité », « qualité ») ne correspondait jamais, `\b` ignorant les accents ; bornes de mot Unicode.
- **Corrigé** : `processFeedback` n'apprend plus en négatif un terme des intitulés, mots-clés, domaines, domaines obligatoires ou fonctions APEC de la piste ; les suggestions d'exclusion du tableau de bord écartent les mêmes termes ; panneau « Signaux appris » (compteur, conflit, « oublier »).
- **Corrigé** : dédoublonnage des offres sans entreprise (titre normalisé + lieu entre sources ; liste d'analyse : titre + lieu + source) ; le diagnostic ne produit plus de doublons dus aux feedbacks multiples.
- **Changé** : score affiché en entier, avec « Détail du score » (recalculé) dans la carte d'offre ; métriques du tableau de bord avec dénominateur ; badge « Piste quasi identique à X » (recouvrement > 60 %) ; bandeau « N offres sans action » quand plus de 80 % des offres récentes ne sont pas triées.

---

### Veille Emploi : sources, doublons, rescoring, blacklist (spec 006)

- **Ajout** : statuts de source fiables (`ok`, `vide`, `bloquée`, `introuvable`, `erreur réseau`, `réponse invalide`, `intitulés inadaptés`, `non configurée`) dans le journal de collecte (migration 021) et le tableau « Dernières collectes » (par piste, info-bulle : code HTTP, URL sans secret, heure, conseil). Une page de pare-feu « Request Rejected » ou du HTML au lieu de XML/JSON n'est plus jamais comptée comme 0 offre.
- **Changé** : APEC ouvre d'abord la page de recherche (cookies de session) puis appelle l'API avec des en-têtes de navigateur ordinaire. Après un refus (403, 429, pare-feu), APEC et Emploi Territorial sont mis en pause 24 h (table `job_watch_source_cooldown`), sans contournement.
- **Changé** : Emploi Territorial devient une source **indisponible** pour toutes les pistes (migration 024 : `enabled = 0` sans supprimer la configuration). La spec OpenAPI v5.3 montre une API authentifiée par token (support du GIP des CDG) et sans recherche d'offres publiées : aucun parser API. Statut « Indisponible » et message dans le tableau des collectes, source plus proposée ni interrogée ; parser RSS et détection du pare-feu conservés. Plus de repli trompeur sur le flux global.
- **Changé** : France Travail et Emploi Territorial n'interrogent qu'avec les intitulés français de la piste ; sans intitulé français, statut `intitulés inadaptés`. Indeed et HelloWork : explication et lien « Configurer » dans le tableau, arrêt en `bloquée` sur contrôle anti-robot.
- **Corrigé** : une même annonce n'apparaît plus deux fois (regroupement à l'affichage, rattachement à la collecte, métriques et échantillon du diagnostic) ; indicateur « piste quasi identique ».
- **Ajout** : version du scorer (`score_version`), scores entiers de 0 à 100, recalcul en tâche de fond des 60 derniers jours avec progression et bouton « Recalculer les scores ». Seuil, métriques et prompts n'utilisent que la version courante.
- **Ajout** : panneau du seuil (seuil actuel, offres masquées, seuil suggéré avec aperçu).
- **Changé** : suggestions de blacklist avec titres rejetés, actions « Blacklister l'entreprise » (confirmation + annulation) ou « Ignorer ce type de poste chez elle » (`companyTitleExclusions`), pas de suggestion pour une entreprise appréciée ou qui recrute pour la cible, rejets antérieurs à la modification des intitulés ignorés ; l'apprentissage négatif ne porte plus sur les termes des intitulés, skills et domaines de la piste.
- **Ajout** : couverture par source et avertissement d'échantillon biaisé (> 70 %) dans les prompts de diagnostic, d'optimisation et de revue de portefeuille.

## [Non publié] - 2026-10-04

### Catégories de compétences, titres, générateur de CV ciblé, angles de CV

- **Ajout** : une entrée `skill` dont la description contient des puces est une **catégorie**, rendue `**Catégorie** : a · b · c` (aperçu, PDF, bande latérale, DOCX ; formats liste, colonnes et tableau adaptés) par une logique partagée (`lib/skill-lines.ts`). La surcharge `description` d'un bloc choisit les éléments ; une catégorie vidée disparaît ; les compétences isolées forment une dernière ligne.
- **Corrigé** : la description ne remplace plus le titre que pour les compétences : centres d'intérêt, langues et certifications affichent leur titre (et sous-titre). Séparateur « - » au lieu du tiret cadratin dans le rendu.
- **Ajout** : titre d'affichage sans l'employeur en double (`lib/entry-display.ts`, `displayTitle`) dans l'aperçu, le PDF, le DOCX et le prompt ; le titre brut reste la clé de rapprochement de l'import.
- **Changé** : le prompt « CV ciblé » liste les éléments de chaque catégorie, joint la trajectoire du profil (titre et résumé), autorise le titre du profil tel quel ou suivi d'un mot-clé, et le budget une page devient : accroche de 3 lignes (≈ 330 caractères), 3 / 2 puces / une ligne selon l'ancienneté, 3 à 5 catégories et 12 à 15 éléments de compétences. Le garde-fou retire les éléments de compétences absents de la source (`skill-item-invented`).
- **Ajout** : règles personnelles du candidat, par profil (Paramètres), injectées en priorité absolue avant les règles de rédaction ; alertes `analyse.alertes_cap` quand l'annonce contredit les critères de recherche (affichées, non bloquantes).
- **Corrigé** : restauration d'une sauvegarde à plusieurs profils : seul le profil de l'utilisateur actif est importé (ou celui choisi dans l'écran d'import, y compris depuis Google Drive) ; auparavant le premier profil de la sauvegarde était remappé sur le profil actif et les données des autres profils étaient importées aussi.
- **Ajout** : angles de CV (migration 020, table `cv_angles`, 4 par profil, 3 angles génériques de départ) : écran « Angles de CV » (édition, matrice d'affinité qui écrit les tags `angle:<slug>` / `hide:<slug>`, import d'un fichier d'affinités local avec récapitulatif) ; dans le générateur, mode 1 « Ma bibliothèque » (ou choix laissé à l'IA, `analyse.angle`) et mode 2 « Proposer selon l'annonce » (2 à 3 propositions validées par `parseAnglePropositions`) ; garde-fou des entrées masquées et de la règle de titre ; instantané `cv.settings.cvAngle` affiché dans la liste des CV et la fiche de candidature. Sauvegarde : `cv_angles` dans le module « Entrées CV ».

## [Non publié] - 2026-10-02

### Pages cibles (spec 004)

- **Changé** : la règle de budget de pages « 1 page jusqu'à 8 ans d'expérience, 2 au-delà » est remplacée par le réglage **Pages cibles** (Paramètres, clé `cv_target_pages`) : 1 page par défaut quelle que soit l'ancienneté, 2 en option.
- **Ajout** : à 1 page, le prompt v2 impose résumé de 2 lignes, 3 puces maximum pour les expériences des 5 dernières années ou couvrant un indispensable (1 ligne ou 1 à 2 puces pour les plus anciennes), expériences sans lien masquées, 12 à 15 compétences sans catégories, formations et certifications d'une ligne, centres d'intérêt et bénévolat masqués. Le garde-fou contrôle les mêmes limites (`ONE_PAGE_LIMITS`), retire `skillGroups` des données nettoyées et affiche « Dépasse probablement 1 page » avec la liste des éléments à retirer en priorité.

### Moteur de CV IA v2 (spec 004)

- **Corrigé** : la section « Compétences » n'est plus renommée ni supprimée par `skillGroups` ; les catégories deviennent des **sous-en-têtes** (`section_header` avec `overrideData.level = 'sub'`, petit libellé gras). Regroupement appliqué seulement avec au moins 8 compétences visibles, 2 à 4 groupes, 2 compétences minimum par groupe (sinon ignoré avec avertissement), et **idempotent** (réappliquer le même JSON ne duplique rien).
- **Corrigé** : plus aucune section ni sous-en-tête vide dans l'aperçu, le PDF (colonne principale **et** bande latérale) et le DOCX : un en-tête n'est rendu que si un contenu visible le suit. Règle appliquée au rendu (`lib/cv-sections.ts`), donc réversible.
- **Corrigé** : la section « Langues » n'est visible que si l'annonce l'exige ou si une langue autre que celle du CV est renseignée avec un niveau ; la langue de l'annonce passe en premier.
- **Ajout** : langue du CV (`cv.settings.cvLanguage`) : mois et « Present / Présent » des dates (aperçu, PDF, DOCX), libellés de sections traduits (`sectionLabels` et libellés anglais standard), noms de langues et niveaux traduits fr/en.
- **Ajout** : prompt « CV ciblé » v2 en blocs composables (`lib/cv-prompt.ts`) : analyse préalable rendue dans le JSON, langue de l'annonce, stratégie de mots-clés ATS, budget de puces et de pages, gestion des écarts, règles de rédaction (`CV_WRITING_RULES`) et de forme (`JSON_RULES`) séparées de `SYSTEM_RULES` (désormais alias de `TEXT_RULES`, réservé aux prompts de texte libre).
- **Ajout** : schéma JSON v2 additif (`schemaVersion`, `analyse`, `sectionLabels`, `warnings`) ; l'ancien schéma reste accepté. `parseAiCvResponse` extrait le premier objet JSON équilibré d'un texte parasite et ignore les champs inconnus.
- **Ajout** : garde-fou post-LLM (`lib/ai-cv-guard.ts`) : IDs inconnus, chiffres absents de la source (bloquant, « Appliquer quand même »), termes techniques non sourcés, suggestions non étayées rejetées, doublons, puces trop longues ou trop nombreuses, formulations interdites, couverture des mots-clés, volume estimé, cohérence des temps. Rapport compact dans `CvGeneratorDrawer` et `AIPromptPanel`.
- **Ajout** : normalisation typographique déterministe (`lib/cv-typography.ts`) : puces « • » ramenées à « - », point final retiré, tiret cadratin remplacé, espaces insécables et guillemets français.
- **Changé** : `planCvBlockOrder` prend un `skillsHeaderId` explicite et garantit que chaque ID d'entrée apparaît une fois en sortie (test de propriété). `applyAiCvToBlocks` accepte un store injectable et retourne un rapport.

## [1.3.0] - 2026-07-02

### Rebranding ResumeForge

- **Changé** : le produit est officiellement renommé **ResumeForge** (anciennement CVmaker). Le nom est harmonisé dans les métadonnées du projet (`package.json`, `tauri.conf.json`, `Cargo.toml`), la documentation et l'interface. Le format de sauvegarde `.cvmaker` et la clé interne `__cvmaker_backup` sont conservés pour rester compatibles avec les sauvegardes existantes.
- **Ajout** : nouveau logo ResumeForge intégré dans la sidebar, le header mobile et l'écran de sélection de profil (`src/assets/branding/logo.png`), en remplacement du placeholder « RF ».
- **Ajout** : set d'icônes d'application complet régénéré à partir du nouveau logo (Windows `.ico`, macOS `.icns`, PNG 32→512, icônes Android et iOS).
- **Ajout** : pack favicon complet dans `public/` (`favicon.svg`, `favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png`, icônes PWA 192/512) référencé dans `index.html`, avec `site.webmanifest` au nom ResumeForge et à la couleur d'accent `#6366f1`. Les anciens `vite.svg` et `tauri.svg` sont supprimés.
- **Changé** : version 1.3.0 (`package.json`, `Cargo.toml`, `tauri.conf.json`).

## [Non publié] - 2026-06-27

### Synchronisation Google Drive

- **Corrigé** : la connexion Google Drive échouait avec « Synchronisation Google Drive indisponible : définissez `VITE_GDRIVE_CLIENT_SECRET` au build » dans tout binaire compilé sans ce `.env`. Le secret du client OAuth « Application de bureau » (non confidentiel en flux PKCE) est de nouveau embarqué comme valeur par défaut, surchargeable au build via `VITE_GDRIVE_CLIENT_SECRET`. La connexion fonctionne désormais sans configuration.

## [Non publié] - 2026-06-10
### Templates graphiques deux colonnes (recruteur humain)

- **Ajout** : trois templates graphiques « non-ATS » conçus pour un envoi direct à un recruteur humain — `sidebar-modern` (Sidebar Moderne, bande sombre à gauche), `sidebar-tech` (Sidebar Tech, bande colorée à gauche) et `sidebar-elegant` (Sidebar Élégant, bande claire à droite, titres serif). Nouvelle catégorie « Graphique » dans le sélecteur.
- **Ajout** : layout deux colonnes dans `PrintableCV` — la photo, les coordonnées et les sections « badges » (compétences, langues, centres d'intérêt, certifications) sont routées dans une bande latérale colorée ; l'expérience et la formation occupent la colonne principale. Le rendu reste unifié (aperçu live + export PDF via impression).
- **Ajout** : champs `layout`, `sidebar` et `atsOptimized` sur `CVTemplate` ; composant `CVSidebar` ; helper `buildContactItems` partagé. Le contraste de la bande (clair/sombre) est calculé automatiquement par luminance.
- **Ajout** : badge « Non-ATS » et avertissement dans le sélecteur de templates pour signaler que ces modèles ne sont pas optimisés pour les filtres ATS.

### Veille emploi — nettoyage des offres périmées

- **Ajout** : les offres périmées (plus anciennes qu'un seuil configurable, 30 jours par défaut) sont automatiquement supprimées à chaque collecte. L'ancienneté est mesurée depuis `published_at` (sinon `fetched_at`) ; les offres importées dans le Kanban sont conservées.
- **Ajout** : action manuelle « Nettoyer périmées » dans le menu « ⋮ » de la liste des offres.
- **Ajout** : réglages « Nettoyage des offres périmées » (activation + seuil) dans Configuration → Options avancées.
- **Ajout** : `src/lib/watcher/cleanup.ts` (+ tests) — logique pure de détection des offres périmées ; `jobWatchStore.purgeExpiredOffers()` effectue la suppression en SQL.

### Audit du dépôt & quick wins (voir `AUDIT-PLAN-AMELIORATION.md`)

#### Sécurité
- **Corrigé** : le client secret Google Drive n'est plus embarqué dans le code — il se fournit au build via `VITE_GDRIVE_CLIENT_SECRET` (fichier `.env` ignoré par git, voir README) ; sans lui, la connexion Drive affiche une erreur explicite
- **Corrigé** : le keystore Android (`resumeforge.keystore`) n'est plus suivi par git ; `*.keystore`, `key.properties` et `.env` ajoutés aux `.gitignore`
- **Ajout** : `src/lib/css-sanitize.ts` — validation des réglages de design du CV (couleurs, tailles, polices) avant injection dans la feuille de style de `PrintableCV`

#### Outillage
- **Ajout** : CI GitHub Actions (`.github/workflows/ci.yml`) — `tsc --noEmit` + `bun test` + `cargo clippy -D warnings` sur chaque PR et push `main`
- **Modifié** : bun devient le gestionnaire de paquets unique (`package-lock.json` supprimé ; README, `setup-ubuntu.sh` et `tauri.conf.json` alignés)
- **Modifié** : `@types/jszip` et `bun-types` déplacés en devDependencies ; hook `postinstall` patch-package retiré

#### Nettoyage
- **Supprimé** : parsers dépréciés `mantiks` et `linkedin-rss` (les offres historiques restent affichables ; la migration 016 convertit les configs `linkedin_rss` → `linkedin`)
- **Supprimé** : fichiers non référencés `script.js`, `benchmark.ts`, `backup.benchmark.ts`, `test-jspdf-output2.ts`, `Test01.pdf`, `Test01.docx`
- **Modifié** : les erreurs avalées silencieusement (signaux appris du watcher, migration `search_intent`, resets de stores au login/logout) sont désormais tracées en console

---

## [1.2.0] - 2026-03-22

### Synchronisation Google Drive

- **Ajout** : synchronisation optionnelle des données via Google Drive (PC ↔ Android)
- **Ajout** : `src/lib/gdrive.ts` — client OAuth2 PKCE complet + Google Drive REST API
  - Flux desktop : serveur HTTP local temporaire pour la redirection OAuth (commande Rust `start_oauth_server`)
  - Flux Android : deep-link `com.jules.resume-forge:/oauth/callback`
  - Upload des sauvegardes `.cvmaker` dans un dossier "ResumeForge Backups" sur Drive
  - Liste et restauration des sauvegardes depuis Drive (stratégie merge)
  - Stockage sécurisé des tokens dans la table `settings` (SQLite)
- **Ajout** : `src/components/settings/GoogleDriveSync.tsx` — interface utilisateur dans les Paramètres
- **Ajout** : `src/lib/backup.ts` — extraction de `buildBackupData()` (sans dialog fichier, réutilisable)
- **Modifié** : `src/App.tsx` — relais deep-link Android → événement `oauth://callback`
- **Modifié** : `src-tauri/src/lib.rs` — commande `start_oauth_server` (desktop uniquement), plugin `tauri-plugin-deep-link`
- **Modifié** : `src-tauri/Cargo.toml` — ajout de `tauri-plugin-deep-link`
- **Modifié** : `src-tauri/tauri.conf.json` — enregistrement du schéma `com.jules.resume-forge://`
- **Modifié** : capabilities — permission `deep-link:default` sur toutes les plateformes

---

## [1.1.0] - 2026-03-22

### Support Android (APK)

- **Ajout** : support Android via Tauri Mobile (`npm run tauri android init/build`)
- **Ajout** : `src-tauri/capabilities/mobile.json` — permissions dédiées Android/iOS
- **Ajout** : navigation bas d'écran (bottom bar) pour mobile dans `Layout.tsx`
- **Modifié** : `src-tauri/tauri.conf.json` — configuration Android (`minSdkVersion: 24`)
- **Modifié** : `src-tauri/capabilities/default.json` — restriction explicite aux plateformes desktop
- **Modifié** : `src-tauri/Cargo.toml` — `tauri-plugin-shell` rendu desktop uniquement (non supporté sur Android)
- **Modifié** : `src-tauri/src/lib.rs` — chargement conditionnel `#[cfg(not(target_os = "android"))]`
- **Modifié** : `googleCalendar.ts`, `ApplicationAttachments.tsx`, `export-pdf.ts` — remplacement de `plugin-shell` par `plugin-opener` (cross-platform)
- **Modifié** : `index.html` — viewport mobile (`viewport-fit=cover`), `theme-color`, titre correct

### SDK minimum Android

- Android 7.0 (API niveau 24)

---

## [1.0.0] - 2026-03-18

### Première release

Première version publique de **ResumeForge**, application desktop de gestion de CV et de suivi de candidatures.

### Fonctionnalités

#### Profil maître
- Création et édition d'un profil complet (identité, contact, réseaux sociaux, photo)
- Gestion des entrées maîtresses : expériences, formations, compétences, langues, projets, certifications, bénévolat, publications, centres d'intérêt
- Tags et métadonnées pour organiser et filtrer les entrées
- Photo de profil avec recadrage intégré

#### Constructeur de CV
- Éditeur visuel avec glisser-déposer (drag & drop)
- Création de multiples CV à partir du profil maître
- 4 templates d'export : ATS Classic, ATS Modern, Elegant, Minimalist
- Export DOCX compatible ATS (pas de tableaux, styles Word standard)
- Export PDF fidèle à la prévisualisation
- Personnalisation par CV (résumé, surcharges par bloc)

#### Suivi de candidatures
- Tableau Kanban avec colonnes par statut (brouillon → accepté/refusé/ghosté)
- Fiche détaillée par candidature (entreprise, poste, salaire, télétravail, priorité)
- Timeline des événements (emails, appels, entretiens, changements de statut)
- Pièces jointes par candidature
- Export groupé des candidatures (CSV, JSON, ZIP)

#### Dashboard
- Vue d'ensemble des candidatures en cours
- Statistiques et graphiques (Recharts)

#### Paramètres
- Sauvegarde et restauration de la base de données (format `.cvmaker`)
- Import avec gestion des conflits module par module
- Configuration de l'application (thème, template par défaut)

### Stack technique
- **Frontend** : React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Zustand
- **Backend** : Tauri 2 (Rust), SQLite
- **Export** : docx.js (DOCX ATS), jsPDF + html2canvas (PDF)
- **Plateformes** : Windows, macOS, Linux
