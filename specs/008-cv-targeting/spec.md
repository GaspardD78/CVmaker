# 008 - Ciblage du CV : type de structure, intention, premier lecteur

Statut : étape 1 (données et résolution) livrée ; les étapes 2 à 5 sont décrites ci-dessous.

## Principe

Trois axes se combinent aux angles (« quel poste ? ») et à l'orientation des puces (`cv_bullet_focus`) :

- **type de structure** (`TargetType`) : `esn`, `cabinet`, `grand-groupe`, `eti-pme`, `startup`, `public`, `associatif` ;
- **intention** (`Intent`) : `annonce`, `spontanee`, `recommandation`, `mobilite-interne`, `chasseur` ;
- **premier lecteur** (`FirstReader`) : `rh`, `operationnel`, `direction`, `ats`.

Chaque axe vaut `auto` par défaut. Priorité : choix explicite sur le CV > détection (application, puis IA via `analyse.cible`) > défaut. Tout en `auto` sans détection : aucune fiche, `annonce`, prompt identique à l'existant.

Les fiches (`lib/cv-targets.ts`, `DEFAULT_TARGET_SHEETS`) sont des données de rédaction. Elles ne contiennent aucun fait de CV : l'anti-invention ne change pas. `eviter` est un texte de consigne ; `avoidTerms` ne contient que des mots détectables par le garde-fou.

## Règles de résolution

- `defaultFocusFor(target)` : 3e paramètre de `resolveBulletFocus` (réglage CV > réglage profil > défaut de la cible > `missions`).
- `atsEnabledFor(target)` : faux hors `annonce` (spontanée, recommandation, mobilité interne, chasseur) ; en annonce, lecteur `ats` = vrai, `operationnel` / `direction` = faux, sinon la fiche ; sans fiche, vrai (historique).
- `titleRuleFor(target)` : `profile`, `profile+keyword`, `equivalence` (titre du profil traduit via les équivalences de la fiche, à défaut l'intitulé exact d'une expérience du profil, à défaut le titre du profil avec avertissement) ou `free` (choix manuel uniquement).

## Personnalisation

`settings`, clé `cv_target_sheets:{profileId}` : JSON des seuls champs modifiés par type (`SheetOverrides`). Reprise par la sauvegarde par profil. Aucune table.

## Découpage

1. Données, résolution, personnalisation, tests (aucun effet visible).
2. Bloc de prompt `## Cible et intention`, bascule annonce / cible centralisée, ATS conditionnel, focus et titre par défaut, instantanés.
3. Détection automatique et champ `analyse.cible`, instantané `cv.settings.target`.
4. Garde-fou : `target-forbidden-term`, `target-equivalence-applied`, `target-photo`, `target-reader-mentioned`.
5. Interface : sélecteurs, formulaire de cible, ligne « Ciblage retenu », écran des fiches.
