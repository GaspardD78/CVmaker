# Changelog

Tous les changements notables de ResumeForge sont documentés ici.

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
- Sauvegarde et restauration de la base de données
- Import avec gestion des conflits
- Configuration de l'application

### Stack technique
- **Frontend** : React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Zustand
- **Backend** : Tauri 2 (Rust), SQLite
- **Export** : docx.js (DOCX ATS), jsPDF + html2canvas (PDF)
- **Plateformes** : Windows, macOS, Linux
