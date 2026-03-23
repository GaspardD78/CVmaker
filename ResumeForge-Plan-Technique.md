# ResumeForge — Plan Technique Complet

## Vision du produit

Un outil de bureau **local, rapide et sans cloud**, pour :

1. **Construire des CV ATS-compatibles** à partir d'un profil maître, avec système de blocs réorganisables
2. **Suivre ses candidatures** dans un tableau de bord visuel (Kanban + timeline)
3. **Exporter en DOCX et PDF** avec une propreté technique irréprochable

---

## Stack Technique Retenue

| Couche | Technologie | Justification |
|---|---|---|
| **Shell Desktop** | Tauri v2 | Léger (~5 Mo vs 150+ Mo Electron), accès natif au filesystem, sécurité par défaut |
| **Frontend** | React 18 + Vite + TypeScript | Écosystème mature, typage strict (essentiel pour Jules), HMR ultra-rapide |
| **Design** | Tailwind CSS + shadcn/ui | Composants accessibles, design system cohérent sans effort |
| **State** | Zustand | Store léger, pas de boilerplate Redux, parfait pour formulaires complexes |
| **Drag & Drop** | @dnd-kit/core + @dnd-kit/sortable | Moderne, accessible, meilleur que react-beautiful-dnd (abandonné) |
| **Backend** | Rust (Tauri) | Imposé par Tauri, Jules s'en charge intégralement |
| **Base de données** | SQLite via `tauri-plugin-sql` | Plugin officiel Tauri, pas besoin de coder du SQL brut en Rust |
| **Export DOCX** | docx (npm) côté frontend | Librairie JS mature, génération côté navigateur sans passer par Rust |
| **Export PDF** | Tauri webview print-to-PDF / @react-pdf/renderer | Impression native du rendu HTML ou génération programmatique |
| **Migrations DB** | Script SQL versionné embarqué | Fichiers `001_init.sql`, `002_add_xxx.sql` exécutés au lancement |

### Pourquoi PAS d'ORM Rust (diesel/sqlx) ?

Gaspard n'a jamais touché Rust. `tauri-plugin-sql` permet d'écrire les requêtes SQL directement depuis TypeScript via le pont IPC. On économise 80% du code Rust à maintenir, et Jules peut travailler quasi-exclusivement en TypeScript.

---

## Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                      TAURI SHELL (Rust)                     │
│  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │   tauri-plugin-sql    │  │   tauri-plugin-fs          │  │
│  │   (SQLite)            │  │   (Lecture/écriture         │  │
│  │                       │  │    fichiers exports)        │  │
│  └───────────┬───────────┘  └──────────┬─────────────────┘  │
│              │          IPC            │                     │
│  ┌───────────┴─────────────────────────┴─────────────────┐  │
│  │                   FRONTEND (React)                    │  │
│  │                                                       │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐  │  │
│  │  │ CV      │ │ Tracker  │ │ Profil     │ │ Export │  │  │
│  │  │ Builder │ │ Kanban   │ │ Maître     │ │ Engine │  │  │
│  │  └────┬────┘ └────┬─────┘ └─────┬──────┘ └───┬────┘  │  │
│  │       │           │             │             │        │  │
│  │  ┌────┴───────────┴─────────────┴─────────────┴────┐  │  │
│  │  │              ZUSTAND STORE                      │  │  │
│  │  │  profileStore | cvStore | applicationStore      │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Principe fondamental : "Master CV" → CV ciblés

L'utilisateur maintient **un profil maître** contenant TOUTES ses données (toutes les expériences, toutes les compétences, etc.). Quand il crée un CV pour une candidature, il **pioche** dans ce réservoir et organise les blocs sélectionnés. Ça évite de tout retaper à chaque fois.

---

## Modèle de Données (SQLite)

### Diagramme relationnel

```
profiles (1) ──────< master_entries (N)
    │                      │
    │                      │ (sélection)
    │                      ▼
    └──────< cv_documents (N) ──────< cv_blocks (N)
                  │
                  │ (lié optionnellement)
                  ▼
          applications (N) ──────< application_events (N)
```

### Tables détaillées

#### `profiles` — Données d'identité

```sql
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'France',
  linkedin_url  TEXT,
  github_url    TEXT,
  portfolio_url TEXT,
  photo_path    TEXT,          -- chemin local vers la photo
  title         TEXT,          -- ex: "Senior Talent Acquisition Manager"
  summary       TEXT,          -- accroche / résumé professionnel
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

#### `master_entries` — Le réservoir de blocs

C'est la table centrale. Chaque ligne est un "bloc" de contenu (une expérience, une formation, une compétence, etc.).

```sql
CREATE TABLE master_entries (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type    TEXT NOT NULL CHECK (entry_type IN (
    'experience', 'education', 'skill', 'certification',
    'language', 'interest', 'project', 'volunteer'
  )),
  -- Champs communs
  title         TEXT NOT NULL,     -- Intitulé du poste / diplôme / compétence
  subtitle      TEXT,              -- Entreprise / École / Organisme
  location      TEXT,              -- Ville
  start_date    TEXT,              -- Format ISO YYYY-MM
  end_date      TEXT,              -- NULL = "en cours"
  is_current    INTEGER DEFAULT 0,
  description   TEXT,              -- Texte libre / missions
  -- Champs spécifiques (flexibles)
  metadata      TEXT DEFAULT '{}', -- JSON pour les données spécifiques au type
  -- Exemples de metadata par type :
  --   experience : {"contract_type": "CDI", "company_url": "...", "skills_used": ["Azure","Terraform"]}
  --   skill      : {"level": "Expert", "category": "Cloud"}
  --   language   : {"level": "C1", "certification": "TOEIC 850"}
  --   certification : {"issuer": "Microsoft", "credential_id": "...", "expiry": "2026-01"}
  sort_order    INTEGER DEFAULT 0,
  tags          TEXT DEFAULT '[]', -- JSON array pour filtrage rapide ["cyber","devops"]
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_entries_profile ON master_entries(profile_id);
CREATE INDEX idx_entries_type ON master_entries(entry_type);
```

**Pourquoi un champ `metadata` JSON ?** Plutôt que de créer 8 tables différentes (une par type), on centralise avec un champ JSON flexible. SQLite 3.38+ supporte `json_extract()` pour les requêtes. Ça simplifie énormément le code et les migrations futures.

#### `cv_documents` — Les CV créés

```sql
CREATE TABLE cv_documents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,           -- "CV Cybersécurité 2026"
  template_id   TEXT NOT NULL DEFAULT 'ats-classic',
  target_job    TEXT,                    -- Poste visé
  target_company TEXT,                   -- Entreprise visée (optionnel)
  custom_summary TEXT,                   -- Accroche spécifique à ce CV (override profil)
  settings      TEXT DEFAULT '{}',       -- JSON : marges, couleurs, police, etc.
  is_favorite   INTEGER DEFAULT 0,
  last_exported TEXT,                    -- Dernière date d'export
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

#### `cv_blocks` — Quels blocs dans quel CV, dans quel ordre

```sql
CREATE TABLE cv_blocks (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  cv_id           TEXT NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  entry_id        TEXT REFERENCES master_entries(id) ON DELETE SET NULL,
  -- Si entry_id est NULL, c'est un bloc "section header" ou un bloc custom
  block_type      TEXT NOT NULL,         -- 'section_header' | 'entry_ref' | 'custom_text'
  section_name    TEXT,                  -- Nom de la section ("Expériences Professionnelles")
  custom_content  TEXT,                  -- Pour les blocs custom (texte libre)
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_visible      INTEGER DEFAULT 1,    -- Masquer sans supprimer
  -- Override possible des données master pour CE CV spécifique
  override_data   TEXT DEFAULT '{}',    -- JSON : permet de modifier description, etc. sans toucher au master
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_blocks_cv ON cv_blocks(cv_id, sort_order);
```

**Point clé** : `override_data` permet de personnaliser une entrée pour un CV spécifique sans modifier le profil maître. Par exemple, reformuler les missions d'une expérience selon le poste ciblé.

#### `applications` — Suivi des candidatures

```sql
CREATE TABLE applications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cv_id           TEXT REFERENCES cv_documents(id) ON DELETE SET NULL,
  company_name    TEXT NOT NULL,
  job_title       TEXT NOT NULL,
  job_url         TEXT,                    -- Lien de l'offre
  source          TEXT CHECK (source IN (
    'job_board', 'spontaneous', 'network', 'recruiter', 'linkedin', 'other'
  )),
  source_detail   TEXT,                    -- Ex: "Indeed", "Recommandation de Steeve"
  contact_name    TEXT,                    -- Nom du recruteur / contact
  contact_email   TEXT,
  contact_phone   TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',           -- Brouillon / À postuler
    'applied',         -- Candidature envoyée
    'acknowledged',    -- Accusé de réception
    'phone_screen',    -- Pré-qualification téléphonique
    'interview',       -- Entretien(s) en cours
    'technical_test',  -- Test technique
    'offer',           -- Offre reçue
    'accepted',        -- Offre acceptée
    'rejected',        -- Refus (par eux)
    'withdrawn',       -- Retrait (par moi)
    'ghosted'          -- Sans réponse après relance
  )),
  salary_min      INTEGER,                 -- En euros brut annuel
  salary_max      INTEGER,
  location        TEXT,
  remote_policy   TEXT,                    -- "full_remote", "hybrid", "onsite"
  priority        INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1=haute
  notes           TEXT,                    -- Notes libres
  applied_at      TEXT,                    -- Date de candidature
  next_action     TEXT,                    -- Prochaine action à faire
  next_action_date TEXT,                   -- Date de la prochaine action
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_apps_status ON applications(status);
CREATE INDEX idx_apps_profile ON applications(profile_id);
```

#### `application_events` — Historique / Timeline

```sql
CREATE TABLE application_events (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'status_change', 'note', 'email_sent', 'email_received',
    'call', 'interview', 'followup', 'document_sent', 'other'
  )),
  event_date      TEXT NOT NULL DEFAULT (datetime('now')),
  title           TEXT NOT NULL,           -- "Relance envoyée par email"
  description     TEXT,
  old_status      TEXT,                    -- Pour status_change
  new_status      TEXT,                    -- Pour status_change
  calendar_id     TEXT,                    -- ID Google Calendar (V2)
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_app ON application_events(application_id, event_date);
```

#### `settings` — Configuration globale

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Valeurs initiales
INSERT INTO settings (key, value) VALUES
  ('app_version', '1.0.0'),
  ('default_template', 'ats-classic'),
  ('default_language', 'fr'),
  ('theme', 'light');
```

### Migration de base

```sql
-- migrations/001_init.sql
-- Contient tout le CREATE TABLE ci-dessus

-- migrations/002_example_future.sql
-- ALTER TABLE applications ADD COLUMN cover_letter_path TEXT;
```

Au lancement de l'app, le code TypeScript (via tauri-plugin-sql) vérifie la version actuelle et exécute les migrations manquantes séquentiellement.

---

## Jalon 1 — Fondations (Semaines 1-2)

### Objectif
Application Tauri qui démarre, avec navigation, base SQLite initialisée, et CRUD complet sur le profil maître.

### Étapes détaillées pour Jules

#### 1.1 — Scaffolding du projet

```bash
# Prérequis : Node.js 18+, Rust (via rustup), prérequis système Tauri v2
npm create tauri-app@latest resume-forge -- --template react-ts
cd resume-forge
npm install
```

**Structure cible du projet :**

```
resume-forge/
├── src/                        # Frontend React
│   ├── components/
│   │   ├── ui/                 # Composants shadcn/ui
│   │   ├── layout/             # Shell, Sidebar, Header
│   │   ├── profile/            # Formulaires profil
│   │   ├── cv-builder/         # Éditeur de CV
│   │   ├── tracker/            # Suivi candidatures
│   │   └── export/             # Prévisualisation & export
│   ├── stores/                 # Zustand stores
│   │   ├── profileStore.ts
│   │   ├── cvStore.ts
│   │   └── applicationStore.ts
│   ├── lib/
│   │   ├── db.ts               # Couche d'abstraction SQLite
│   │   ├── migrations.ts       # Runner de migrations
│   │   ├── export-docx.ts      # Moteur d'export DOCX
│   │   └── export-pdf.ts       # Moteur d'export PDF
│   ├── hooks/                  # Custom hooks React
│   ├── types/                  # Types TypeScript partagés
│   │   ├── profile.ts
│   │   ├── cv.ts
│   │   └── application.ts
│   ├── templates/              # Templates CV (config + styles)
│   │   ├── ats-classic.ts
│   │   ├── ats-modern.ts
│   │   └── index.ts
│   ├── assets/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Backend Rust (minimal)
│   ├── src/
│   │   └── main.rs             # Config Tauri + plugins
│   ├── migrations/             # Fichiers SQL
│   │   ├── 001_init.sql
│   │   └── ...
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── tailwind.config.js
```

#### 1.2 — Configuration Tauri minimale (Rust)

Le fichier `main.rs` ne fait quasi rien — il charge les plugins :

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**C'est tout le Rust dont tu as besoin pour la V1.** Tout le reste se fait en TypeScript.

#### 1.3 — Couche base de données TypeScript

```typescript
// src/lib/db.ts
import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:resumeforge.db');
  }
  return db;
}

export async function runMigrations() {
  const database = await getDb();
  // Lire la version actuelle, exécuter les SQL manquants
  // ... (logique de migration)
}
```

#### 1.4 — Types TypeScript stricts

```typescript
// src/types/profile.ts
export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  // ... mapping complet de la table
}

export type EntryType =
  | 'experience' | 'education' | 'skill' | 'certification'
  | 'language' | 'interest' | 'project' | 'volunteer';

export interface MasterEntry {
  id: string;
  profileId: string;
  entryType: EntryType;
  title: string;
  subtitle: string | null;
  // ...
  metadata: Record<string, unknown>;
  tags: string[];
}
```

#### 1.5 — Navigation et Layout

Utiliser React Router v6 avec 4 routes principales :

| Route | Vue | Description |
|---|---|---|
| `/` | Dashboard | Vue d'ensemble (stats rapides, actions récentes) |
| `/profile` | Profil Maître | Formulaire d'identité + gestion des entrées master |
| `/cv/:id` | CV Builder | Éditeur drag-and-drop d'un CV spécifique |
| `/tracker` | Suivi | Kanban des candidatures |

Layout : sidebar fixe à gauche (icônes + labels), contenu principal à droite.

#### 1.6 — Livrables du Jalon 1

- [ ] App Tauri démarre sans erreur
- [ ] SQLite initialisé avec toutes les tables
- [ ] CRUD Profil fonctionnel (créer, éditer, sauvegarder)
- [ ] CRUD Master Entries fonctionnel (ajouter/modifier/supprimer des expériences, formations, etc.)
- [ ] Navigation entre les 4 pages
- [ ] Store Zustand synchronisé avec SQLite

---

## Jalon 2 — CV Builder (Semaines 3-5)

### Objectif
Construire un CV visuellement par blocs, prévisualiser en temps réel, exporter en DOCX et PDF.

### 2.1 — Gestion des CV Documents

- Liste des CV créés (page "Mes CV" ou section du dashboard)
- Bouton "Nouveau CV" → modal avec nom, poste ciblé, template
- Duplication d'un CV existant (pour varier un CV sans repartir de zéro)

### 2.2 — L'éditeur de blocs (cœur de l'UX)

**Layout de l'éditeur :**

```
┌──────────────────────────────────────────────────┐
│  [Retour]  CV: "CV Cybersécurité"     [Exporter] │
├──────────────────┬───────────────────────────────┤
│                  │                               │
│  PANNEAU GAUCHE  │     PRÉVISUALISATION          │
│  (Blocs du CV)   │     (Temps réel)              │
│                  │                               │
│  ┌────────────┐  │     ┌─────────────────────┐   │
│  │ § Identité │  │     │  GASPARD DUPONT     │   │
│  │   (fixe)   │  │     │  Talent Acquisition  │   │
│  ├────────────┤  │     │  ...                 │   │
│  │ § Accroche │  │     │                     │   │
│  ├────────────┤  │     │  EXPÉRIENCES        │   │
│  │ § Expér. ↕ │  │     │  ► Cellenza (2022)  │   │
│  │  ☑ Cellenza│  │     │  ► Synetis (2019)   │   │
│  │  ☑ Synetis │  │     │                     │   │
│  │  ☐ OPEN    │  │     │  CERTIFICATIONS     │   │
│  ├────────────┤  │     │  ► AZ-900           │   │
│  │ § Format. ↕│  │     │                     │   │
│  ├────────────┤  │     └─────────────────────┘   │
│  │            │  │                               │
│  │ [+ Section]│  │                               │
│  └────────────┘  │                               │
├──────────────────┴───────────────────────────────┤
│  Template: ATS Classic ▼  │  Police ▼  │ Marges ▼│
└──────────────────────────────────────────────────┘
```

**Mécanique :**

- Le panneau gauche liste les **sections** (titres de catégorie) avec les **entrées** piochées dans le profil maître
- Chaque section est réordonnnable par drag-and-drop (@dnd-kit)
- Chaque entrée dans une section peut être cochée/décochée (visible ou masquée)
- Les entrées au sein d'une section sont aussi réordonnables
- Cliquer sur une entrée ouvre un panneau d'édition inline (avec possibilité d'override pour ce CV)
- Le panneau droit se met à jour en temps réel via le store Zustand

### 2.3 — Sélecteur de contenu depuis le Master

Quand l'utilisateur ajoute une section (ex: "Expériences"), un tiroir latéral s'ouvre avec toutes les entrées de type `experience` du profil maître. Il coche celles qu'il veut inclure.

### 2.4 — Templates ATS

Un template est un **objet de configuration** TypeScript, pas du HTML. Il définit les règles de rendu :

```typescript
// src/templates/ats-classic.ts
export const atsClassic: CVTemplate = {
  id: 'ats-classic',
  name: 'ATS Classique',
  description: 'Structure linéaire optimisée pour les robots ATS',
  // Règles d'export DOCX
  docx: {
    pageSize: 'A4',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    fonts: {
      heading: 'Calibri',
      body: 'Calibri',
    },
    headingSize: 28,   // 14pt
    bodySize: 22,      // 11pt
    lineSpacing: 276,  // 1.15x
    sectionSpacing: 200,
    useColumns: false,  // JAMAIS pour ATS
    useTables: false,   // JAMAIS pour ATS
  },
  // Règles de prévisualisation React
  preview: {
    // Classes Tailwind pour chaque bloc
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg p-12',
    headingClass: 'text-lg font-bold uppercase tracking-wide border-b-2 border-gray-800 pb-1 mb-3',
    // ...
  }
};
```

**Règles ATS impératives pour l'export DOCX :**

1. **Aucune table** — le contenu doit être 100% linéaire
2. **Aucune colonne** — pas de mise en page multi-colonnes
3. **Vrais styles Word** — utiliser Heading1, Heading2, Normal (pas de formatage manuel)
4. **Pas d'en-tête/pied de page** pour le contenu critique (nom, contact)
5. **Pas de zone de texte** ni d'objet flottant
6. **Pas d'image** dans le corps du CV (la photo est un débat, mais pour l'ATS pur, on l'évite)
7. **Puces standard** avec `LevelFormat.BULLET`, jamais de caractères Unicode manuels
8. **Dates en texte** (pas de champs de date Word)

### 2.5 — Moteur d'export DOCX

Utilise la librairie `docx` (JavaScript) côté frontend :

```typescript
// src/lib/export-docx.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export async function generateDocx(cv: CVDocument, entries: MasterEntry[], template: CVTemplate): Promise<Blob> {
  const sections = buildSections(cv, entries, template);

  const doc = new Document({
    styles: buildStyles(template),
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4 en DXA
          margin: template.docx.margins,
        },
      },
      children: sections,
    }],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}
```

**Sauvegarde** : utiliser `tauri-plugin-dialog` pour ouvrir un "Enregistrer sous" natif, puis `tauri-plugin-fs` pour écrire le fichier.

### 2.6 — Moteur d'export PDF

Deux approches possibles (à tester, privilégier la 1) :

1. **HTML → PDF via webview** : Rendre le CV dans un composant React dédié (style print), utiliser la commande Tauri native `webview.print()` ou `window.print()` avec `@media print`
2. **DOCX → PDF** : Générer le DOCX d'abord, puis convertir via LibreOffice headless (`soffice --convert-to pdf`) embarqué comme sidecar Tauri

La première option est plus légère et ne nécessite pas d'embarquer LibreOffice.

### 2.7 — Livrables du Jalon 2

- [ ] Créer / dupliquer / supprimer un CV
- [ ] Éditeur de blocs avec panneau gauche + prévisualisation droite
- [ ] Drag-and-drop des sections et des entrées
- [ ] Sélection d'entrées depuis le profil maître
- [ ] Override de contenu par CV
- [ ] Au moins 2 templates ATS (Classic + Modern)
- [ ] Export DOCX ATS-compatible validé
- [ ] Export PDF fonctionnel
- [ ] Sauvegarder sur le disque via dialogue natif

---

## Jalon 3 — Suivi des Candidatures (Semaines 6-8)

### Objectif
Tableau de bord Kanban pour suivre les candidatures, avec timeline d'événements et statistiques.

### 3.1 — Vue Kanban

**Colonnes par défaut :**

| Brouillon | Postulé | En cours | Entretien | Offre | Terminé |
|---|---|---|---|---|---|
| draft | applied, acknowledged | phone_screen, technical_test | interview | offer | accepted, rejected, withdrawn, ghosted |

Chaque carte affiche : entreprise, poste, source, date, priorité (badge couleur).

Drag-and-drop entre colonnes → mise à jour automatique du statut + création d'un événement `status_change`.

### 3.2 — Fiche candidature détaillée

Cliquer sur une carte ouvre un panneau latéral (ou une page) avec :

- **En-tête** : Entreprise, poste, statut (badge), priorité
- **Informations** : URL de l'offre, source, contact, fourchette salariale, politique remote
- **CV lié** : Quel CV a été utilisé (lien direct vers l'éditeur)
- **Timeline** : Historique chronologique des événements (candidature envoyée, relance, appel, entretien, etc.)
- **Prochaine action** : Champ texte + date (ex: "Relancer par email", "15/04/2026")
- **Notes libres** : Zone de texte pour notes personnelles

### 3.3 — Ajout rapide d'événements

Dans la timeline, bouton "+ Événement" avec :

- Type (dropdown : relance, appel, entretien, email envoyé, etc.)
- Date (par défaut aujourd'hui)
- Titre (pré-rempli selon le type)
- Description (optionnel)

### 3.4 — Statistiques (Dashboard)

Compteurs simples en haut du tracker :

- Candidatures actives (excluant terminé)
- Candidatures ce mois-ci
- Taux de réponse (% ayant dépassé "applied")
- Relances à faire (prochaine action dont la date est passée ou aujourd'hui)
- Entretiens à venir

Un graphique simple (recharts) : nombre de candidatures par semaine/mois.

### 3.5 — Alertes de relance

Sur le dashboard et dans le tracker : badge rouge sur les candidatures dont `next_action_date` est dépassée. Tri possible par "À relancer en priorité".

### 3.6 — Livrables du Jalon 3

- [ ] Vue Kanban avec drag-and-drop
- [ ] Création / édition / suppression de candidatures
- [ ] Timeline d'événements par candidature
- [ ] Liaison CV ↔ candidature
- [ ] Statistiques dashboard
- [ ] Alertes de relance visuelles
- [ ] Recherche / filtrage (par entreprise, statut, source)

---

## V2 — Améliorations Futures (Post-V1)

| Fonctionnalité | Complexité | Notes |
|---|---|---|
| **Google Calendar** | Élevée | OAuth2, refresh tokens, gestion offline. Nécessite un projet Google Cloud. |
| **Import LinkedIn PDF** | Moyenne | Parser le PDF exporté depuis LinkedIn pour pré-remplir le profil maître. |
| **Templates CV premium** | Faible | Ajouter des templates design (2 colonnes pour version PDF, ATS linéaire pour DOCX). |
| **Lettre de motivation** | Moyenne | Éditeur texte avec variables (`{{entreprise}}`, `{{poste}}`) pré-remplies depuis la candidature. |
| **Export JSON Resume** | Faible | Export au format standardisé JSON Resume pour compatibilité Reactive Resume et autres outils. |
| **Backup / Restore** | Faible | Export de la base SQLite complète + import (protection contre la perte de données). |
| **Mode sombre** | Faible | Toggle dark mode via Tailwind `dark:` classes. |
| **Multi-profils** | Faible | Switcher entre plusieurs profils (un pour Gaspard, un pour son épouse par ex.). |
| **IA locale (Ollama)** | Élevée | Suggestions de reformulation, scoring ATS, via un modèle local type Llama. |

---

## Instructions Spécifiques pour Jules

### Contexte à donner à Jules

> Tu construis une application de bureau avec Tauri v2. Le développeur (moi) ne connaît pas Rust, donc **tout le code métier doit être en TypeScript** côté frontend. Rust ne sert qu'à configurer les plugins Tauri dans `main.rs`. La communication avec SQLite se fait via `@tauri-apps/plugin-sql` depuis TypeScript.

### Règles de code pour Jules

1. **TypeScript strict** : `"strict": true` dans `tsconfig.json`, aucun `any` sauf dans les types de mapping DB
2. **Nommage** : camelCase en TS, snake_case dans les colonnes SQLite, PascalCase pour les composants React
3. **Un composant = un fichier** : pas de composants multiples dans un fichier
4. **Zustand stores** : un store par domaine (profile, cv, applications), avec des actions async qui appellent la DB
5. **Erreurs** : toujours envelopper les appels DB dans try/catch avec un toast d'erreur utilisateur
6. **Pas de `console.log` en production** : utiliser un logger structuré ou supprimer avant commit
7. **Commentaires en français** dans le code (langue du développeur)

### Prompts séquentiels pour Jules

Voici les prompts à donner à Jules **dans l'ordre**, un par un, en validant chaque étape :

**Prompt 1 — Scaffold**
> Initialise un projet Tauri v2 avec React, Vite, TypeScript. Ajoute Tailwind CSS, shadcn/ui, Zustand, React Router v6, et @dnd-kit/core. Configure le main.rs avec tauri-plugin-sql, tauri-plugin-fs, tauri-plugin-dialog. Crée la structure de dossiers décrite dans le plan.

**Prompt 2 — Base de données**
> Crée le fichier de migration SQL `001_init.sql` avec le schéma complet (tables profiles, master_entries, cv_documents, cv_blocks, applications, application_events, settings). Crée `src/lib/db.ts` (connexion SQLite) et `src/lib/migrations.ts` (exécution automatique des migrations au lancement). Crée les types TypeScript correspondants dans `src/types/`.

**Prompt 3 — Layout et navigation**
> Crée le layout principal : sidebar fixe à gauche avec icônes (Accueil, Profil, CV, Candidatures), zone de contenu à droite. Configure React Router avec les routes `/`, `/profile`, `/cv/:id`, `/tracker`. Ajoute un composant Header avec le titre de la page courante.

**Prompt 4 — Profil maître**
> Crée la page `/profile` avec un formulaire d'identité (tous les champs de la table profiles) et une section en dessous pour gérer les master_entries. Chaque type d'entrée a un onglet (Expériences, Formations, Compétences, etc.). On peut ajouter, modifier, supprimer, réordonner les entrées. Persiste tout dans SQLite via le store Zustand.

**Prompt 5 — CV Builder**
> Crée l'éditeur de CV sur `/cv/:id` avec le panneau gauche (sections + entrées sélectionnables depuis le master) et la prévisualisation droite. Implémente le drag-and-drop des sections avec @dnd-kit. Ajoute la création et la duplication de CV depuis la liste.

**Prompt 6 — Export DOCX**
> Implémente le moteur d'export DOCX dans `src/lib/export-docx.ts` en utilisant la librairie `docx`. Respecte strictement les règles ATS : pas de tables, pas de colonnes, vrais styles Word, puces LevelFormat.BULLET. Crée le template `ats-classic`. Ajoute le bouton "Exporter DOCX" qui ouvre un dialogue "Enregistrer sous" natif.

**Prompt 7 — Export PDF**
> Crée un composant React `PrintableCV` qui rend le CV avec des styles `@media print` optimisés. Ajoute un bouton "Exporter PDF" qui utilise `window.print()` pour générer un PDF. Assure-toi que les sauts de page sont gérés correctement.

**Prompt 8 — Tracker Kanban**
> Crée la page `/tracker` avec une vue Kanban (colonnes par statut). Chaque carte est draggable entre colonnes. Ajoute un formulaire de création de candidature et un panneau latéral de détail avec timeline d'événements. Implémente les statistiques en haut de page.

**Prompt 9 — Dashboard**
> Crée la page d'accueil `/` avec un résumé : nombre de candidatures actives, relances à faire, derniers CV modifiés, graphique d'activité. Ajoute des raccourcis rapides ("Nouvelle candidature", "Nouveau CV").

**Prompt 10 — Polish**
> Ajoute les toasts d'erreur/succès (sonner ou react-hot-toast). Vérifie la gestion des cas limites (base vide, entrée supprimée référencée dans un CV, etc.). Ajoute un système de confirmation avant suppression. Optimise les performances de la prévisualisation.

---

## Checklist de Qualité Finale

Avant de considérer la V1 comme "terminée" :

- [ ] L'app démarre en < 2 secondes
- [ ] Le DOCX exporté passe un test ATS (tester sur jobscan.co ou similaire)
- [ ] Le PDF est identique à la prévisualisation
- [ ] Les données persistent après fermeture/réouverture
- [ ] Aucune donnée ne quitte l'ordinateur (vérifier network tab = vide)
- [ ] Le drag-and-drop fonctionne sans bugs visuels
- [ ] Les migrations SQL s'exécutent sans erreur sur une base vide ET sur une base existante
- [ ] L'app fonctionne sur Windows, macOS et Linux (tester le build sur chaque OS)

---

## Support Android (v1.1)

### Principe

Tauri 2 supporte nativement Android via le même codebase React/Rust. Le frontend est un WebView Android standard ; le backend Rust est compilé en bibliothèque native (`.so`) via NDK.

### Prérequis supplémentaires

- Android Studio + NDK
- Cibles Rust cross-compilation :
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
    i686-linux-android x86_64-linux-android
  ```
- Variables d'environnement :
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export NDK_HOME=$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk)
  ```

### Commandes

```bash
npm run tauri android init   # Génère src-tauri/gen/android/ (une seule fois)
npm run tauri android dev    # Lance sur émulateur ou appareil
npm run tauri android build  # Compile l'APK
```

### Adaptations apportées

#### `tauri-plugin-shell` non disponible sur Android

Ce plugin n'est pas supporté sur Android. Toutes les ouvertures d'URL et de fichiers ont été migrées vers `tauri-plugin-opener` qui est cross-platform.

**Fichiers modifiés :**
- `src/lib/googleCalendar.ts` : `open()` → `openUrl()` de `plugin-opener`
- `src/components/tracker/ApplicationAttachments.tsx` : `openInShell()` → `openPath()`
- `src/lib/export-pdf.ts` : fallback PDF → `openPath()`

**Rust (`Cargo.toml`) :**
```toml
[target.'cfg(not(target_os = "android"))'.dependencies]
tauri-plugin-shell = "2"
```

**Rust (`lib.rs`) :**
```rust
#[cfg(not(target_os = "android"))]
{
    builder = builder.plugin(tauri_plugin_shell::init());
}
```

#### Configuration Android (`tauri.conf.json`)

```json
{
  "bundle": {
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

#### Capabilities séparées

| Fichier | Plateformes | Différences |
|---|---|---|
| `capabilities/default.json` | linux, windows, macOS | Inclut `shell:default` |
| `capabilities/mobile.json` | android, iOS | Sans `shell:default`, avec `deep-link:default` |

#### Navigation mobile

`Layout.tsx` : la sidebar desktop est masquée sur mobile (`hidden sm:flex`). Une **barre de navigation fixe en bas** (bottom bar) avec 5 onglets s'affiche à la place (`sm:hidden`).

Le contenu principal reçoit `pb-16 sm:pb-0` pour ne pas être masqué par la barre.

---

## Synchronisation Google Drive (v1.2)

### Objectif

Permettre à l'utilisateur de sauvegarder et restaurer ses données entre son PC et son Android via Google Drive. Les données transitent dans le format `.cvmaker` (JSON) déjà utilisé par le système de backup local.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Flux OAuth2 PKCE                         │
│                                                             │
│  Desktop                         Android                    │
│  ────────                         ───────                   │
│  1. start_oauth_server (Rust)     1. Deep-link URI          │
│     → port aléatoire                 com.jules.resume-forge │
│  2. Ouvre navigateur système      2. Ouvre navigateur       │
│  3. Google redirige →             3. Google redirige →      │
│     http://127.0.0.1:PORT/cb         custom URI scheme      │
│  4. Rust émet                     4. App.tsx détecte        │
│     "oauth://callback"               onOpenUrl() et         │
│                                      émet "oauth://callback"│
│  5. Frontend échange code → tokens (commun)                 │
│  6. Tokens stockés dans SQLite settings (commun)            │
└─────────────────────────────────────────────────────────────┘
```

### Fichier `src/lib/gdrive.ts`

Responsabilités :
- **PKCE** : génération du verifier + challenge SHA-256 Base64URL
- **`startOAuthFlow(clientId)`** : détecte desktop vs mobile, lance le bon mécanisme
- **`waitForOAuthCallback()`** : écoute l'événement Tauri `oauth://callback`, timeout 2 min
- **`exchangeCode(code, clientId)`** : échange le code contre tokens, persiste dans SQLite
- **`listDriveBackups(clientId)`** : liste les `.cvmaker` dans le dossier Drive
- **`uploadToDrive(clientId, json, fileName)`** : upload multipart vers Drive
- **`downloadFromDrive(clientId, fileId)`** : télécharge le contenu d'un fichier

### Commande Rust `start_oauth_server` (desktop uniquement)

```rust
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn start_oauth_server(app: tauri::AppHandle) -> Result<u16, String> {
    // Bind sur 127.0.0.1:0 (port aléatoire)
    // Thread qui attend une connexion HTTP
    // Quand callback reçu → app.emit("oauth://callback", path)
    // Retourne le port pour construire le redirect_uri
}
```

Appel frontend :
```typescript
try {
  const port = await invoke<number>('start_oauth_server');
  redirectUri = `http://127.0.0.1:${port}/callback`;
} catch {
  redirectUri = 'com.jules.resume-forge:/oauth/callback'; // Android
}
```

### Deep-link Android (`tauri-plugin-deep-link`)

**`tauri.conf.json` :**
```json
{
  "plugins": {
    "deep-link": {
      "desktop": { "schemes": ["com.jules.resume-forge"] },
      "mobile":  { "schemes": ["com.jules.resume-forge"] }
    }
  }
}
```

**`App.tsx` :** écoute `onOpenUrl()`, extrait la query string, et émet `oauth://callback` vers le listener de `gdrive.ts`.

### Scope Google Drive

`https://www.googleapis.com/auth/drive.file` — accès uniquement aux fichiers créés par l'application, sans accès au reste du Drive de l'utilisateur.

### Stockage des tokens

Les tokens OAuth2 sont sérialisés en JSON et stockés dans la table `settings` (clé `gdrive_tokens`). Le Client ID de l'utilisateur est stocké sous la clé `gdrive_client_id`. Aucune donnée ne quitte l'appareil en dehors des appels API Google.

### Configuration utilisateur requise

L'utilisateur doit créer son propre projet Google Cloud et enregistrer les URI de redirection :
- `http://127.0.0.1` (PC — Google accepte tous les ports loopback pour les apps desktop)
- `com.jules.resume-forge:/oauth/callback` (Android)

---

## Checklist de Qualité — Android & Drive

- [ ] L'APK se compile sans erreur (`npm run tauri android build`)
- [ ] L'app démarre sur Android 7+ (API 24)
- [ ] La navigation bottom bar est fonctionnelle sur petit écran
- [ ] Le drag-and-drop fonctionne avec le tactile (à valider avec @dnd-kit touch sensors)
- [ ] La synchronisation Drive fonctionne sur PC (serveur local OAuth)
- [ ] La synchronisation Drive fonctionne sur Android (deep-link OAuth)
- [ ] Les tokens expirent et se rafraîchissent automatiquement
- [ ] Une sauvegarde exportée depuis PC est restaurable sur Android (et vice-versa)
