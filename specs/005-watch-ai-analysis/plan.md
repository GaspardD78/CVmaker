# Plan 005

## Décisions de design
- **Portée des exclusions** : `SearchProfile.excludeScopes?: Record<terme_minuscule, 'title'|'anywhere'>`.
  Défaut résolu à la lecture (`resolveExclusions`) : `excludeTitles` → `title`, `excludeDomains` → `anywhere`.
  Aucune réécriture de données stockées : la « migration » est donc sans risque et idempotente.
  Un terme présent dans les deux listes prend la portée la plus large (`anywhere`).
- **`requiredDomains?: string[]`** : vide par défaut. Absence de tous → plafond 25 (balanced/loose), score 0 (strict).
- **Recouvrement de pistes** : Jaccard sur l'ensemble des intitulés normalisés (minuscules, sans accents). Seuil 0,6.
- **Règles du moteur** : poids exportés (`SCORING_WEIGHTS`) et décrits par `describeEngineRules()`.
- **Dédoublonnage de repli** (offres sans entreprise) : clé `titre normalisé | lieu | source` pour la liste
  d'analyse ; entre sources, titre normalisé identique + lieu identique non vide.
- **Score de l'analyse** : recalculé avec la configuration actuelle (décomposition cohérente) ; le score
  enregistré n'est cité que s'il diffère de plus de 4 points. `extraction` n'étant pas persistée, le rejeu
  suppose un titre `high` (cas de presque tous les parseurs) et un contrat `high` s'il est renseigné (`score-replay.ts`).
- **Bandeau « sans action »** : plus de 80 % des offres récentes ET au moins 3 offres (évite le bruit sur 1 ou 2 offres).
- **Garde-fou d'exclusion** : bloquant si le terme figure dans le titre OU la description d'une offre importée ou aimée
  (conservateur, comme demandé, même si la portée par défaut « titre » est moins dangereuse) ; forçable.
- **Intitulé couvert ailleurs** : bloqué par défaut mais forçable ; retirer le dernier intitulé : refusé, non forçable.
- **`salary: {min: null, target: null}`** du JSON signifie « inchangé » ; le patch ne peut pas effacer un salaire.
- **`apecSalaires.set: []`** signifie « ne rien changer », jamais « tout effacer ».
- **`requiredDomains` absent** : plafond 25 en balanced et loose, score 0 en strict.
- **Patch** : JSON `watch-analysis/v1`, validation par champ, garde-fous, simulation sur 30 jours, snapshot de la piste.

## Phases
P0 préparation · P1 audit + tests (`test.failing`) · P2 contexte · P3 prompt · P4 patch/simulation/UI ·
P5 moteur · P6 dashboard · P7 tests + docs.
