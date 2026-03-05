# ResumeForge

ResumeForge est un outil de bureau **local, rapide et sans cloud**, conçu pour aider les professionnels à gérer efficacement leur recherche d'emploi. Il vous permet de centraliser vos expériences, de générer des CV optimisés pour les systèmes de suivi des candidatures (ATS) et de suivre vos candidatures de bout en bout grâce à un tableau de bord Kanban intégré.

L'application est construite avec Tauri, React, et TypeScript, offrant une expérience native très performante tout en garantissant la confidentialité absolue de vos données, qui ne quittent jamais votre ordinateur.

## Fonctionnalités Principales

*   **Profil Maître Unique :** Un système centralisé pour toutes vos expériences, formations, compétences et autres informations. Vous piochez dans ce "Master Profile" pour créer vos CV.
*   **CV Builder (ATS-Ready) :** Un éditeur de CV visuel permettant d'assembler et de réordonner les blocs (via drag-and-drop). Il propose des templates spécialement conçus pour être lus sans erreur par les robots ATS.
*   **Export DOCX et PDF :** Exportez vos CV au format DOCX (avec un formatage parfait, sans colonnes ni tableaux, respectant les styles Word standards) ou en PDF via un moteur de rendu optimisé.
*   **Tracker de Candidatures (Kanban) :** Un tableau visuel pour suivre l'état de chaque candidature, du premier contact jusqu'à l'offre finale.
*   **Tableau de bord et Statistiques :** Un aperçu rapide de vos actions en cours, relances à effectuer, et de votre activité (graphiques, taux de réponse, etc.).
*   **100% Local :** Toutes vos données sont stockées localement dans une base de données SQLite. Pas de cloud, pas d'inscription.

## Captures d'écran

*(Insérez ici des captures d'écran de l'application)*

*   **Tableau de bord :** Vue d'ensemble de vos statistiques et candidatures.
*   **Profil Maître :** Formulaires pour vos expériences, compétences, etc.
*   **Éditeur de CV :** Drag-and-drop des blocs pour construire un CV ciblé.
*   **Tracker Kanban :** Suivi visuel des statuts de candidature.

## Guide d'installation

Ce projet utilise Tauri (v2) pour le backend (Rust) et le système natif, ainsi que React/Vite/TypeScript pour l'interface utilisateur.

### Prérequis

Avant de pouvoir lancer ou compiler ResumeForge, vous devez installer les dépendances système requises pour le développement avec Tauri.

1.  **Node.js** (version 18 ou supérieure) : Recommandé via `nvm`.
2.  **Rust et Cargo** : Installez-les via `rustup` :
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
3.  **Dépendances Système OS :**
    *   **Sur Windows :** Installez les *Build Tools for Visual Studio 2022* (incluant le module C++). Tauri recommande d'utiliser le [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (généralement préinstallé sur Windows 10/11).
    *   **Sur macOS :** Xcode Command Line Tools (tapez `xcode-select --install` dans le terminal).
    *   **Sur Linux (ex: Ubuntu/Debian) :** Exécutez la commande suivante pour installer les bibliothèques GTK et WebKit nécessaires :
        ```bash
        sudo apt-get update
        sudo apt-get install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
        ```

### Installation du projet

1.  **Clonez ce dépôt :**
    ```bash
    git clone https://github.com/votre-compte/resumeforge.git
    cd resumeforge/resume-forge
    ```

2.  **Installez les dépendances Node.js :**
    ```bash
    npm install
    ```
    *(Ou utilisez `bun install` / `pnpm install` selon votre gestionnaire).*

3.  **Lancez l'environnement de développement :**
    Pour démarrer à la fois le serveur React (Vite) et la fenêtre Tauri native, utilisez :
    ```bash
    npm run tauri dev
    ```
    *(La première compilation de Rust peut prendre quelques minutes).*

### Procédure de Re-Build après correction

Si vous avez modifié le code (frontend ou backend) pour corriger un bug, suivez ces étapes pour re-compiler proprement l'application :

1.  **Nettoyer les anciens builds (Optionnel mais recommandé) :**
    Sur macOS / Linux (Bash) :
    ```bash
    rm -rf dist
    cd src-tauri
    cargo clean
    cd ..
    ```
    Sur Windows (PowerShell) :
    ```powershell
    Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    cd src-tauri
    cargo clean
    cd ..
    ```

2.  **Vérifier le typage strict TypeScript :**
    ```bash
    npx tsc --noEmit
    ```

3.  **Compiler le frontend (Vite) :**
    ```bash
    npm run build
    ```

4.  **Re-compiler et lancer l'application Tauri :**
    ```bash
    npm run tauri dev
    ```

### Compilation (Build pour la production)

Pour générer un exécutable autonome (.exe, .dmg, .app, ou .deb/.AppImage selon votre OS) :

```bash
npm run tauri build
```

Le fichier compilé se trouvera dans le dossier `src-tauri/target/release/bundle/`.

## Architecture Technique

*   **Frontend :** React 18, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand (pour la gestion d'état), et `@dnd-kit` pour le drag & drop.
*   **Backend / Pont Natif :** Tauri v2 (Rust minimaliste, utilisé uniquement pour charger les plugins).
*   **Base de données :** SQLite intégré géré directement depuis le frontend via `@tauri-apps/plugin-sql` pour éviter de maintenir un ORM Rust complexe.
*   **Export :** L'export DOCX est géré par la librairie `docx` coté client, respectant strictement les règles des ATS.

## Licence

*(Ajoutez les détails de la licence ici, ex: MIT License)*
