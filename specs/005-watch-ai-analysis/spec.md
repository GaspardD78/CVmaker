# Spec 005 - Refonte de l'analyse IA de la Veille Emploi

## Objectif
Les deux boutons d'analyse du `HealthDashboard` (optimisation, diagnostic) produisent des
recommandations **justes, sûres et applicables en un clic**, et le moteur (score,
apprentissage, dédoublonnage) ne fausse plus le diagnostic.

## Périmètre
- `lib/watcher/analysis-context.ts` : contexte factuel (`WatchAnalysisContext`), pur et testable.
- `lib/watcher/analysis-prompt.ts` : `generateWatchAnalysisPrompt(ctx, mode)`, un seul prompt, deux modes.
- `lib/watcher/analysis-patch.ts` : import tolérant du JSON `watch-analysis/v1`, garde-fous, simulation, application annulable.
- Moteur : portée des exclusions, `requiredDomains`, apprentissage protégé, dédoublonnage de repli, score entier + décomposition.
- Dashboard : badge piste quasi identique, bandeau « offres sans action », métriques avec dénominateur, écran « Appliquer les recommandations ».

## Hors périmètre
`parsers/`, fetcher (hors appel au dédoublonnage), module CV.

## Règles non négociables
1. Tests d'abord, `bun test` et `bunx tsc --noEmit` verts à chaque phase.
2. Rétrocompatibilité : aucun champ de `SearchProfile` / `learnedDict` supprimé, ajouts optionnels.
3. Aucune modification de configuration sans aperçu et confirmation ; toute application est annulable.
4. Questions de design ambiguës : défaut proposé et documenté dans `plan.md`.

## Critères d'acceptation
Voir la phase 7 de la demande : prompt (libellés, règles générées, nombre réel, dédoublonnage,
décomposition), zéro action signalé, conflit appris/profil, pistes identiques, exclusion
bloquée par défaut, simulation, migration de portée sans changement de score pour
`excludeDomains`, tsc + tests verts.
