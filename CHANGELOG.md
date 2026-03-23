# Changelog

Tous les changements notables de ResumeForge sont documentés ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

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
