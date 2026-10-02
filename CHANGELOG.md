# Changelog

Tous les changements notables de ResumeForge sont documentés ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

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
