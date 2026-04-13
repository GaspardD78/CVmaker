# Spécification de fonctionnalité : Éditeur de CV Markdown en direct

**Branche de fonctionnalité** : `001-markdown-resume-editor`
**Créée le** : 2026-04-13
**Statut** : Brouillon
**Entrée** : Description utilisateur : "Create a specification for a desktop resume builder using Tauri and React. It should support live Markdown editing and PDF export."

## Scénarios utilisateur & tests *(obligatoire)*

### Scénario 1 — Édition Markdown avec aperçu en direct (Priorité : P1)

Un utilisateur qui préfère la rédaction en texte brut ouvre le mode éditeur Markdown dans
le constructeur de CV. Il saisit ou colle du contenu Markdown dans le volet gauche et voit
immédiatement un aperçu formaté du CV se mettre à jour dans le volet droit au fil de la
saisie. Les modifications sont sauvegardées automatiquement en local afin qu'aucun
contenu ne soit perdu si la fenêtre est fermée.

**Pourquoi cette priorité** : L'aperçu en direct est la proposition de valeur centrale de cette
fonctionnalité. Sans lui, l'utilisateur n'a aucun retour visuel et la fonctionnalité n'est pas
meilleure qu'un simple éditeur de texte.

**Test indépendant** : Ouvrir l'éditeur Markdown avec un document vide, saisir un titre
Markdown (`# John Doe`) et une liste à puces de compétences. Le volet droit DOIT se
mettre à jour dans la seconde et afficher le rendu formaté. Cela constitue une boucle
d'édition pleinement utilisable indépendamment de l'export.

**Scénarios d'acceptance** :

1. **Étant donné** un éditeur Markdown vide, **quand** l'utilisateur saisit `# Jane Smith`, **alors**
   le volet d'aperçu affiche « Jane Smith » rendu comme un grand titre dans la seconde.
2. **Étant donné** un document contenant du contenu Markdown, **quand** l'utilisateur supprime
   une ligne, **alors** l'aperçu se met immédiatement à jour pour refléter la suppression.
3. **Étant donné** une session où l'utilisateur a saisi du contenu, **quand** l'application est
   fermée puis rouverte, **alors** le contenu Markdown précédent est restauré automatiquement.

---

### Scénario 2 — Export PDF du CV Markdown (Priorité : P2)

Un utilisateur ayant rédigé son CV en Markdown souhaite produire un fichier PDF pour le
soumettre à des recruteurs. Il déclenche une action d'export et reçoit un fichier PDF qui
reproduit fidèlement l'aperçu formaté qu'il voyait dans l'éditeur, sans aucun chrome
applicatif (barres d'outils, volets d'édition) inclus.

**Pourquoi cette priorité** : L'export PDF est l'artefact de sortie principal. C'est le livrable
que les utilisateurs remettent aux recruteurs, l'exactitude est donc essentielle — mais il
n'est utile qu'une fois que l'expérience d'édition (P1) fonctionne.

**Test indépendant** : Rédiger un CV avec un titre, des coordonnées, une section expérience
professionnelle et une liste de compétences. Exporter en PDF. Ouvrir le PDF : toutes les
sections DOIVENT apparaître dans le bon ordre, les polices doivent être lisibles, et aucun
symbole de syntaxe Markdown (`#`, `*`, `-`) ne doit être visible dans le rendu.

**Scénarios d'acceptance** :

1. **Étant donné** un CV Markdown complet, **quand** l'utilisateur sélectionne « Exporter en PDF »,
   **alors** un fichier PDF est enregistré à l'emplacement choisi par l'utilisateur, sans aucune
   syntaxe Markdown visible dans le rendu.
2. **Étant donné** un export PDF, **quand** le fichier est ouvert dans n'importe quel lecteur PDF
   standard, **alors** tout le contenu est lisible, correctement ordonné et mis en forme de
   manière cohérente.
3. **Étant donné** un document Markdown vide ou quasi vide, **quand** l'utilisateur tente
   d'exporter, **alors** le système avertit que le document semble incomplet plutôt que de
   produire silencieusement un PDF vierge.

---

### Scénario 3 — Modèle de départ Markdown (Priorité : P3)

Un nouvel utilisateur ouvre l'éditeur Markdown et voit un CV modèle pré-rempli (avec des
noms fictifs, des dates et des exemples d'entrées) afin de comprendre la structure attendue
et de commencer à éditer immédiatement plutôt que de faire face à un document vierge.

**Pourquoi cette priorité** : Réduit la courbe d'apprentissage pour les utilisateurs peu
familiers des conventions Markdown pour les CV. Utile mais non bloquant — la fonctionnalité
fonctionne sans lui.

**Test indépendant** : Ouvrir un nouveau document CV Markdown. Sans rien saisir,
l'éditeur DOIT contenir un modèle complet avec des champs fictifs clairement identifiés
(ex. : `[Votre nom]`, `[Entreprise]`).

**Scénarios d'acceptance** :

1. **Étant donné** un document CV nouvellement créé, **quand** l'éditeur Markdown s'ouvre,
   **alors** un modèle avec les sections standard d'un CV (coordonnées, expérience,
   formation, compétences) est pré-chargé.
2. **Étant donné** un éditeur chargé avec le modèle, **quand** l'utilisateur remplace un champ
   fictif et sauvegarde, **alors** le contenu du modèle est remplacé par le texte de
   l'utilisateur et le modèle n'est pas réinséré à la prochaine ouverture.

---

### Cas limites

- Que se passe-t-il si le document Markdown est très long (ex. : plus de 10 pages de
  contenu) ? L'aperçu doit rester réactif sans ralentissement.
- Comment le système gère-t-il un Markdown invalide (ex. : crochets non fermés) ? Il DOIT
  rendre ce qui est possible sans planter ni se figer.
- Que se passe-t-il si l'emplacement de sauvegarde PDF choisi par l'utilisateur est en
  lecture seule ou plein ? Un message d'erreur clair DOIT être affiché ; le document NE DOIT
  PAS être corrompu.
- Que se passe-t-il avec les sauts de ligne et les caractères spéciaux (lettres accentuées,
  tirets cadratin) dans le PDF ? Tous les caractères DOIVENT être rendus correctement.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

- **FR-001** : Le système DOIT fournir une interface à deux volets avec une zone de saisie
  Markdown d'un côté et un volet d'aperçu formaté de l'autre.
- **FR-002** : Le volet d'aperçu DOIT se mettre à jour dans la seconde suivant toute frappe
  dans l'éditeur, sans nécessiter d'action de rafraîchissement manuel.
- **FR-003** : Le système DOIT sauvegarder automatiquement le document Markdown en local
  à chaque pause de frappe (avec anti-rebond) afin qu'aucun contenu ne soit perdu lors
  d'une fermeture inattendue.
- **FR-004** : Les utilisateurs DOIVENT pouvoir exporter le document courant en fichier PDF
  stocké sur leur système de fichiers local.
- **FR-005** : L'export PDF DOIT reproduire fidèlement l'aperçu formaté — aucune syntaxe
  Markdown visible, ordre des sections correct, typographie lisible.
- **FR-006** : Le système DOIT avertir l'utilisateur avant l'export si le document est vide ou
  ne contient que le modèle de départ non modifié.
- **FR-007** : Les nouveaux documents DOIVENT s'ouvrir avec un modèle de départ pré-rempli
  contenant des champs fictifs étiquetés pour les sections standard d'un CV.
- **FR-008** : Toutes les données du CV DOIVENT être stockées en local ; aucun contenu ne
  peut être envoyé vers un serveur distant dans le cadre de l'édition ou de l'export normaux.

### Entités clés

- **Document CV** : Un document texte Markdown nommé et versionné associé au profil de
  l'utilisateur. Attributs clés : titre, contenu Markdown brut, date de dernière modification,
  date de création.
- **Enregistrement d'export PDF** : Une entrée de journal capturant l'horodatage de l'export
  et le chemin du fichier cible choisi par l'utilisateur (à des fins d'audit/historique).

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : Les utilisateurs peuvent ouvrir l'éditeur Markdown et commencer à saisir dans
  les 3 secondes suivant le lancement de la fonctionnalité depuis la navigation principale.
- **SC-002** : Le volet d'aperçu se met à jour en réponse aux frappes sans latence perceptible
  (cible ≤ 1 seconde entre la dernière frappe et le changement visible de l'aperçu).
- **SC-003** : 90 % des utilisateurs qui rédigent un CV dans l'éditeur Markdown réussissent
  un export PDF dès leur première tentative sans consulter la documentation.
- **SC-004** : Les PDF exportés peuvent être ouverts par n'importe quel lecteur PDF standard
  sur Windows, macOS, Linux et Android sans erreur de rendu.
- **SC-005** : Zéro perte de données : aucun contenu de CV saisi par l'utilisateur n'est perdu
  en raison d'un plantage ou d'une fermeture inattendue (la sauvegarde automatique couvre
  tout le contenu dans les 5 secondes suivant la saisie).

## Hypothèses

- L'éditeur Markdown est un ajout au constructeur de CV existant — les utilisateurs peuvent
  choisir entre le constructeur visuel par glisser-déposer et l'éditeur Markdown pour tout
  document CV donné.
- Les conventions Markdown standard pour les CV sont supposées : titres pour les sections,
  listes à puces pour les éléments, gras pour l'emphase. Aucune extension Markdown
  personnalisée n'est requise pour la v1.
- L'export PDF produit une mise en page à colonne unique, compatible ATS, cohérente avec
  les standards d'export existants de l'application (pas de mises en page multi-colonnes ni
  de tableaux qui cassent les parseurs ATS).
- Le modèle de départ est fourni dans la même langue que l'interface de l'application (pas
  de support multilingue pour le modèle requis en v1).
- Les documents Markdown sont stockés dans la même base de données locale que toutes
  les autres données de l'application — aucun stockage séparé sur le système de fichiers
  n'est requis pour la v1.
