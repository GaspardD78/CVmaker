# 008 - Ciblage du CV : type de structure, intention, premier lecteur

Statut : étapes 1 (données et résolution), 2 (bloc de prompt), 3 (détection, `analyse.cible`, instantané) et 4 (garde-fou) livrées ; les étapes 2 à 5 sont décrites ci-dessous.

## Principe

Trois axes se combinent aux angles (« quel poste ? ») et à l'orientation des puces (`cv_bullet_focus`) :

- **type de structure** (`TargetType`) : `esn`, `cabinet`, `grand-groupe`, `eti-pme`, `startup`, `public`, `associatif` ;
- **intention** (`Intent`) : `annonce`, `spontanee`, `recommandation`, `mobilite-interne`, `chasseur` ;
- **premier lecteur** (`FirstReader`) : `rh`, `operationnel`, `direction`, `ats`.

Chaque axe vaut `auto` par défaut. Priorité : choix explicite sur le CV > détection (application, puis IA via `analyse.cible`) > défaut. Tout en `auto` sans détection : aucune fiche, `annonce`, prompt identique à l'existant.

Les fiches (`lib/cv-targets.ts`, `DEFAULT_TARGET_SHEETS`) sont des données de rédaction. Elles ne contiennent aucun fait de CV : l'anti-invention ne change pas. `eviter` est un texte de consigne ; `avoidTerms` ne contient que des mots détectables par le garde-fou.

## Règles de résolution

- `defaultFocusFor(target)` : 3e paramètre de `resolveBulletFocus` (réglage CV > réglage profil > défaut de la cible > `missions`).
- `atsLevelFor(target)` : `strict` (mots-clés exacts de l'annonce : annonce + fiche `ats`, ou sans fiche), `leger` (candidature spontanée + fiche `ats` : intitulés et compétences standards du métier visé, une fois chacun, sans répétition forcée), `off` (recommandation, mobilité interne, approche de chasseur, fiche sans ATS). Le lecteur garde la priorité : `ats` = au moins `leger` (`strict` en annonce), `operationnel` / `direction` = `off`. `atsEnabledFor` = niveau différent de `off`.
- `wordingModeFor(target, texte)` : « annonce » ou « cible » (spontanée et recommandation : toujours cible ; mobilité interne et approche : cible sans texte). Le dictionnaire est dans `lib/cv-wording.ts`.
- `titleRuleFor(target)` : `profile`, `profile+keyword`, `equivalence` (titre du profil traduit via les équivalences de la fiche, à défaut l'intitulé exact d'une expérience du profil, à défaut le titre du profil avec avertissement) ou `free` (choix manuel uniquement).

## Personnalisation

`settings`, clé `cv_target_sheets:{profileId}` : JSON des seuls champs modifiés par type (`SheetOverrides`). Reprise par la sauvegarde par profil. Aucune table.

## Découpage

1. Données, résolution, personnalisation, tests (aucun effet visible).
2. Bloc de prompt `## Cible et intention`, bascule annonce / cible centralisée, ATS conditionnel, focus et titre par défaut, instantanés.
3. Détection automatique et champ `analyse.cible`, instantané `cv.settings.target`.
4. Garde-fou : `target-forbidden-term`, `target-equivalence-applied`, `target-photo`, `target-reader-mentioned`.
5. Interface : sélecteurs, formulaire de cible, ligne « Ciblage retenu », écran des fiches.

## Détection et réponse de l'IA (étape 3)

- Application : `detectTarget({ jobOfferText, company })` renvoie `public` (secteur public dans l'annonce ou le nom), `esn` ou `cabinet` quand les signaux sont nets et non contradictoires, et `annonce` quand un texte est fourni.
- IA : `analyse.cible` (`type`, `intention`, `premierLecteur`, `raison`), demandé pour les axes encore par défaut, y compris quand tout est en auto. C'est la seule différence du prompt « tout en auto » : sans fiche, sans autre changement de règles, le CV produit est identique. La proposition n'est jamais appliquée à ce CV : l'écran affiche « Ciblage proposé » et le bouton « Appliquer et régénérer » (étape 5).
- Priorité : choix explicite > type détecté par l'application > proposition de l'IA > défaut. Un désaccord n'est jamais appliqué : il est rapporté pour correction et régénération.
- Instantané `cv.settings.target` : ciblage effectif et fiche utilisée (`readTargetSnapshot`).

## Garde-fou (étape 4)

`GuardContext.target` active des avertissements (jamais bloquants) : `target-forbidden-term` (termes de la fiche, avec l'équivalence), `target-equivalence-applied` (titre ou `titleOverride` traduit via la table de la fiche ; sinon `unsupported-title`), `target-photo`, `target-reader-mentioned` (nom ou fonction du premier lecteur, personne qui transmet le CV ; une expression du profil du candidat lui-même est ignorée). L'anti-invention est identique quel que soit le ciblage.
