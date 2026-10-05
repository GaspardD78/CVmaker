# AUDIT 005 - analyse IA de la Veille

Tous les défauts ont été reconfirmés dans le code. Les tests de reproduction sont dans
`resume-forge/src/lib/watcher/watch-analysis-audit.test.ts` (`test.failing` tant que le défaut existe).

| # | Défaut | Cause confirmée | Où |
|---|---|---|---|
| 1 | Exclusions dangereuses proposées | `computeScoreWithBreakdown` fusionne `excludeTitles` + `excludeDomains` et cherche dans `titre + description` (couche 0). Aucun prompt ne le dit | `scorer.ts` l.150-155 ; `prompt-templates.ts` |
| 2 | « Domaine requis » trompeur | `generateDiagnosticPrompt` affiche `skills` sous « Domaine requis » ; `skills` n'est qu'un bonus (+6 titre / +3 description). Libellés différents entre les deux prompts (Compétences/Secteurs vs Domaine requis/préféré) | `prompt-templates.ts` |
| 3 | Score incompréhensible | Seul `l.score` est envoyé, valeur brute non arrondie ; le salaire (+20/-30) et l'ancienneté (-2/jour) dominent | `HealthDashboard.handleDiagnosticPrompt` |
| 4 | « 20 dernières offres » | Libellé en dur ; `LIMIT 20` avant tout dédoublonnage | `prompt-templates.ts`, requête SQL |
| 5 | Doublons | (a) `LEFT JOIN job_offer_feedback` produit une ligne par feedback ; (b) `detectCrossSourceDuplicates` ignore les offres sans entreprise | `HealthDashboard`, `deduplicator.ts` |
| 6 | Titres seuls | Le type d'entrée ne porte que `title/score/action` | `generateDiagnosticPrompt` |
| 7 | Zéro action non signalé | Le prompt demande des « patterns de rejet » même quand aucune action n'existe | `generateDiagnosticPrompt` |
| 8 | Terme du profil appris en négatif | `processFeedback` apprend tous les mots/bigrammes du titre, sans connaître le profil ; compteurs non transmis | `learning-engine.ts` |
| 9 | Pistes identiques | `portfolioPreamble` liste les autres pistes sans mesurer le recouvrement | `prompt-templates.ts` |
| 10 | Incohérences de configuration | Aucune détection (salaire/tranche APEC, appris vs profil, exclusion vs descriptions) | - |
| 11 | Profil incomplet | Le diagnostic n'a pas de profil ; aucun prompt n'a localisation/contrat/séniorité | `prompt-templates.ts` |
| 12 | Sortie non applicable | CSV libre à recopier | `generatePerformanceOptimizationPrompt` |
| 13 | Métriques sans échantillon | `pertinence`/`conversion` sont des pourcentages nus, calculés sur `offers` en mémoire sans période | `HealthDashboard` (useMemo metrics) |

## Constats complémentaires
- `ScoreBreakdown` expose déjà titre/skills/domaine/salaire/ancienneté : la décomposition est gratuite.
- `extraction.titleConfidence` n'est pas persisté : un score recalculé a un titre à 30 au lieu de 40 pour une offre `high`.
- Aucun champ télétravail sur les offres : indice déduit du texte (regex), signalé comme tel.
- `SearchProfile` est stocké en JSON fusionné avec `DEFAULT_SEARCH_PROFILE` (`alerts.ts`) : ajouter des champs optionnels ne demande aucune migration SQL.

## Défaut supplémentaire découvert en cours de route
| # | Défaut | Cause | Correction | Test |
|---|---|---|---|---|
| 14 | Un terme finissant par une lettre accentuée (« cybersécurité ») ne correspondait jamais | `\b` JavaScript ne traite pas `é` comme un caractère de mot | bornes `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` (flag `u`) | `scorer.test.ts` « bornes de mot Unicode » |
