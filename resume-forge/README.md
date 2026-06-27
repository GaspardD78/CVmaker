# ResumeForge

ResumeForge est un outil **local, rapide et multiplateforme** pour gérer sa recherche d'emploi. Il permet de centraliser ses expériences, générer des CV optimisés pour les systèmes ATS et suivre ses candidatures via un tableau Kanban intégré.

Disponible sur **Windows, macOS, Linux** et **Android** (APK).

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **Profil Maître** | Réservoir centralisé de toutes vos expériences, formations, compétences, langues, projets |
| **CV Builder ATS** | Éditeur visuel drag-and-drop, 4 templates ATS-ready |
| **Export DOCX / PDF** | DOCX sans tableau ni colonne (compatible ATS), PDF via moteur de rendu optimisé |
| **Tracker Kanban** | Suivi des candidatures : brouillon → entretien → offre, avec timeline d'événements |
| **Score de compatibilité** | Analyse automatique CV vs offre d'emploi |
| **Import** | LinkedIn, PDF, DOCX, CSV, JSON |
| **Synchronisation Drive** | Sauvegarde et restauration via Google Drive (PC ↔ Android) |
| **100 % local** | SQLite embarqué, aucune inscription, aucun cloud obligatoire |
| **Mode Portable** | Fonctionne depuis une clé USB (marqueur `.portable` à côté de l'exécutable) |

---

## Installation (desktop)

### Prérequis

- **Bun** 1.x : `curl -fsSL https://bun.sh/install | bash`
- **Node.js** 18+ *(requis par certains outils de la chaîne Tauri)*
- **Rust** via `rustup` :
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Dépendances système :**
  - **Windows** : Build Tools for Visual Studio 2022 (module C++)
  - **macOS** : `xcode-select --install`
  - **Linux (Ubuntu/Debian)** :
    ```bash
    sudo apt-get install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
      build-essential curl wget file libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev
    ```

### Lancement

```bash
git clone https://github.com/GaspardD78/CVmaker.git
cd CVmaker/resume-forge
bun install
bun run tauri dev
```

### Compilation desktop (production)

```bash
bun run tauri build
```

L'exécutable se trouve dans `src-tauri/target/release/bundle/`.

---

## Build Android (APK)

### Prérequis supplémentaires

- **Android Studio** avec le SDK Android et le NDK installés
- Variables d'environnement configurées :
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export NDK_HOME=$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk)
  ```
- Cibles Rust pour Android :
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
    i686-linux-android x86_64-linux-android
  ```

### Générer et compiler le projet Android

```bash
# 1. Initialiser le projet Android (une seule fois)
bun run tauri android init

# 2. Développement sur émulateur ou appareil connecté
bun run tauri android dev

# 3. Compiler l'APK de release
bun run tauri android build
```

L'APK se trouve dans `src-tauri/gen/android/app/build/outputs/apk/`.

> **SDK minimum** : Android 7.0 (API 24)

---

## Synchronisation Google Drive

La synchronisation est optionnelle et utilise votre propre projet Google Cloud. Les données restent dans votre Drive personnel.

### Configuration (une seule fois)

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com)
2. Créer un projet → activer l'**API Google Drive**
3. Créer des identifiants OAuth 2.0 → type **"Application de bureau"**
4. Ajouter les **URI de redirection autorisées** :
   - `http://127.0.0.1` *(PC — Google accepte tous les ports loopback)*
   - `com.jules.resume-forge:/oauth/callback` *(Android)*
5. Le **Client ID** et le **Client Secret** du client officiel ResumeForge sont embarqués dans l'application : aucune configuration n'est nécessaire pour utiliser la sync Drive.

> Pour utiliser **votre propre** projet Google Cloud, surchargez les identifiants au moment du build via un fichier `.env` à la racine de `resume-forge/` :
> ```bash
> VITE_GDRIVE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
> VITE_GDRIVE_CLIENT_SECRET=GOCSPX-xxxxxxxx
> ```
> Pour un client de type « Application de bureau » en flux PKCE, Google considère le secret comme non confidentiel ; il est donc embarqué dans le binaire.

### Utilisation

- **"Sauvegarder vers Drive"** : exporte toutes les données au format `.cvmaker` dans un dossier *"ResumeForge Backups"* de votre Drive
- **"Restaurer"** : télécharge un fichier de sauvegarde et fusionne les données (stratégie merge)
- Le token OAuth est stocké localement dans la base SQLite ; il se rafraîchit automatiquement

### Flux OAuth2 par plateforme

| Plateforme | Mécanisme |
|---|---|
| **PC** | Serveur HTTP local temporaire (port aléatoire), capture la redirection Google |
| **Android** | Deep-link `com.jules.resume-forge:/oauth/callback` géré par `tauri-plugin-deep-link` |

---

## Architecture technique

### Stack

| Couche | Technologie |
|---|---|
| Shell natif | Tauri 2 (Rust) |
| Frontend | React 19, TypeScript strict, Vite 7 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| État | Zustand 5 |
| Drag & Drop | @dnd-kit/core + sortable |
| Base de données | SQLite via `tauri-plugin-sql` |
| Export DOCX | `docx` (côté client) |
| Export PDF | html2canvas + jsPDF |
| Import | mammoth, pdfjs-dist, jszip |
| Graphiques | Recharts |
| Notifications | Sonner |
| Sync cloud | Google Drive REST API + OAuth2 PKCE |

### Plugins Tauri

| Plugin | Usage | Plateformes |
|---|---|---|
| `tauri-plugin-sql` | SQLite | Toutes |
| `tauri-plugin-fs` | Lecture/écriture fichiers | Toutes |
| `tauri-plugin-dialog` | Sélection de fichiers, confirmations | Toutes |
| `tauri-plugin-opener` | Ouvrir URLs et fichiers | Toutes |
| `tauri-plugin-deep-link` | Callback OAuth2 Android | Toutes (actif sur Android) |
| `tauri-plugin-shell` | Ouvrir fichiers via le shell OS | Desktop uniquement |

### Structure des fichiers

```
resume-forge/
├── src/
│   ├── components/
│   │   ├── cv-builder/       # CV Builder (éditeur, templates, design)
│   │   ├── tracker/          # Kanban candidatures
│   │   ├── profile/          # Profil maître
│   │   ├── export/           # Rendu imprimable
│   │   ├── import/           # Import multi-format
│   │   ├── dashboard/        # Tableau de bord
│   │   ├── settings/         # Paramètres + sync Drive
│   │   └── layout/           # Navigation (sidebar desktop, bottom bar mobile)
│   ├── stores/               # Zustand (profile, cv, application, compatibility, prompt)
│   ├── lib/
│   │   ├── db.ts             # Couche SQLite (getDb, getSetting, setSetting)
│   │   ├── backup.ts         # Export/import .cvmaker (buildBackupData, importBackup)
│   │   ├── gdrive.ts         # Sync Google Drive (OAuth2 PKCE + REST API)
│   │   ├── export-docx.ts    # Moteur DOCX ATS
│   │   ├── export-pdf.ts     # Moteur PDF
│   │   └── import/           # Parseurs (LinkedIn, PDF, DOCX, CSV)
│   ├── types/                # Interfaces TypeScript
│   └── templates/            # Templates CV (ats-classic, ats-modern, elegant, minimalist)
├── src-tauri/
│   ├── src/lib.rs            # Configuration Tauri, migrations, commandes Rust
│   ├── migrations/           # SQL (001_init, 002_attachments, 003_compatibility)
│   ├── capabilities/
│   │   ├── default.json      # Permissions desktop (Linux, Windows, macOS)
│   │   └── mobile.json       # Permissions Android/iOS
│   └── tauri.conf.json       # Config app + deep-link schemes
├── index.html
├── package.json
└── vite.config.ts
```

### Modèle de données

```
profiles (1) ──< master_entries (N)
    │
    └──< cv_documents (N) ──< cv_blocks (N)
    │
    └──< applications (N) ──< application_events (N)
                          └──< application_attachments (N)
settings (key/value)
```

---

## Développement

### Commandes utiles

```bash
bun run dev          # Frontend seul (Vite)
bun run tauri dev    # App Tauri complète (frontend + backend Rust)
bun run build        # Build frontend (TypeScript + Vite)
bun run tauri build  # Build desktop (exécutable natif)
bun test             # Tests unitaires
```

### Nettoyage après erreur de build

```bash
rm -rf dist
cd src-tauri && cargo clean && cd ..
bun run tauri dev
```

---

## ⚖️ Licence

Ce projet est sous licence **GPLv3**. 
Vous êtes libre d'utiliser, de modifier et de distribuer ce logiciel, à condition que toute version modifiée soit également distribuée sous la même licence open source. Voir le fichier[LICENSE](LICENSE) pour plus de détails.