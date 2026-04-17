# Quickstart — Scénarios d'intégration

**Feature**: `002-job-watch-reliability` | **Date**: 2026-04-15

Ces scénarios couvrent les flux de bout en bout pour valider que l'implémentation respecte la spec.

---

## Scénario 1 : Collecte avec logs persistés

**Contexte** : L'utilisateur déclenche une collecte manuelle depuis le HealthDashboard.

**Préconditions** :
- Au moins une source activée (ex. WTTJ)
- `minSaveScore = 20` (valeur par défaut)
- Table `job_watch_fetch_log` vide

**Flux** :
1. Clic sur "Lancer une collecte" → `runFetch()` démarre
2. Pour la source WTTJ : 12 offres parsées, 8 nouvelles (score ≥ 20), 4 filtrées (score < 20)
3. Après l'INSERT des 8 offres, un log est écrit :
   ```
   source='wttj', offersFetched=12, offersNew=8, status='success', durationMs=~1200
   ```
4. Purge automatique : si > 50 entrées pour 'wttj', les plus anciennes sont supprimées

**Résultat attendu** :
- `job_watch_fetch_log` contient 1 ligne pour 'wttj'
- `HealthDashboard` affiche : "WTTJ | ✅ succès | 12 récupérées | 8 nouvelles | il y a X min"
- `JobOffersView` contient 8 nouvelles offres (score ≥ 20)

---

## Scénario 2 : Source en erreur

**Contexte** : LinkedIn scraping retourne statut 999 (anti-bot).

**Flux** :
1. `parseLinkedinRss(config)` tente le scraping → HTTP 999
2. Catch : retourne `[]`, pas de throw
3. Log écrit : `status='error', error_message="Scraping LinkedIn échoué — essayez rss.app comme alternative.", offersFetched=0, offersNew=0`

**Résultat attendu** :
- `HealthDashboard` affiche badge rouge "❌ erreur" pour LinkedIn avec le message d'erreur au survol
- Les autres sources ne sont pas impactées
- `JobOffersView` n'affiche aucune nouvelle offre LinkedIn

---

## Scénario 3 : Score minimum — filtrage et purge

**Contexte** : L'utilisateur abaisse `minSaveScore` de 20 à 10, puis veut purger les offres trop anciennes.

**Flux A — Changement du seuil** :
1. Slider dans "Options avancées" → valeur 10 → enregistrement dans `job_watch_settings.min_save_score`
2. Prochaine collecte : offres avec score 10-19 sont maintenant sauvegardées

**Flux B — Purge manuelle** :
1. Clic sur "Purger les offres non pertinentes" dans `JobOffersView`
2. Dialog de confirmation : "Supprimer les offres avec score < 20 ?"
3. Confirmation → `DELETE FROM job_offers WHERE score < 20`
4. Toast : "142 offres supprimées"
5. `JobOffersView` se recharge avec les offres restantes

**Résultat attendu** :
- Purge supprime uniquement les offres en dessous du seuil actuel
- Le compteur d'offres est mis à jour immédiatement

---

## Scénario 4 : Scoring v3 — jobTitles non vide

**Contexte** : Profil avec `jobTitles = ["Recruteur", "RRH"]`, mode balanced.

**Offre A** : titre "Recruteur Senior — CDI Paris" (extraction high)
- base = 0, titleMatch = +40, contract = +10 → total ≥ 50

**Offre B** : titre "Chargé RH — CDI Lyon" (extraction medium)
- base = 0, titleMatch = +30 (RRH pas trouvé exactement) → dépend du match exact

**Offre C** : titre "Commercial BtoB — Paris" (no title match, balanced)
- base = 0, cap à 25 → total ≤ 25, probablement filtré si minSaveScore = 20

**Offre D** : profil jobTitles vide
- base = 50, scoring classique par skills/domain

**Résultat attendu** :
- Offres A/B ont des scores significativement supérieurs à C
- Offre D démarre à 50 (comportement legacy pour profils sans jobTitles configurés)

---

## Scénario 5 : Tests unitaires scorer.test.ts

**Bun test runner** — 4 cas obligatoires (SC-009) :

```typescript
// Cas 1 : terme exclu → score = 0
test('excluded term in title → score 0', () => {
  const profile = makeProfile({ excludeTitles: ['stagiaire'], jobTitles: ['Recruteur'] });
  const offer = makeOffer({ title: 'Recruteur stagiaire' });
  expect(computeScore(offer, profile)).toBe(0);
});

// Cas 2 : no jobTitle match + balanced → ≤ 25
test('balanced mode no title match → capped at 25', () => {
  const profile = makeProfile({ jobTitles: ['Recruteur'], scoring: { mode: 'balanced' } });
  const offer = makeOffer({ title: 'Commercial BtoB' });
  expect(computeScore(offer, profile)).toBeLessThanOrEqual(25);
});

// Cas 3 : jobTitle exact dans titre, high confidence → ≥ 40
test('jobTitle high confidence match → titleMatchScore ≥ 40', () => {
  const profile = makeProfile({ jobTitles: ['Recruteur'] });
  const offer = makeOffer({ title: 'Recruteur Senior', extraction: { titleConfidence: 'high' } });
  const { titleMatchScore } = computeScoreWithBreakdown(offer, profile);
  expect(titleMatchScore).toBeGreaterThanOrEqual(40);
});

// Cas 4 : jobTitles vide → base ≥ 50
test('empty jobTitles → base score 50', () => {
  const profile = makeProfile({ jobTitles: [] });
  const offer = makeOffer({ title: 'N\'importe quelle offre' });
  expect(computeScore(offer, profile)).toBeGreaterThanOrEqual(50);
});
```

**Fichier** : `resume-forge/src/lib/watcher/scorer.test.ts`

---

## Scénario 6 : HealthDashboard — warning jobTitles vide

**Contexte** : L'utilisateur n'a pas configuré de `jobTitles` dans son profil de recherche.

**Flux** :
1. Montage du `HealthDashboard`
2. `settings.searchProfile.jobTitles.length === 0` → vrai
3. Bannière affichée : "Aucun intitulé de poste configuré — le scoring démarrera à 50 pour toutes les offres. Configurez vos intitulés pour des résultats plus pertinents."

**Résultat attendu** :
- Bannière visible en haut du dashboard
- Clic sur lien "Configurer" → navigation vers la section profil

---

## Scénario 7 : LinkedIn sans RSS — fallback CSS

**Contexte** : Scraping LinkedIn OK (200) mais JSON-LD absent de la réponse HTML.

**Flux** :
1. `extractJsonLdJobs(html)` retourne `[]` (pas de `<script type="application/ld+json">`)
2. Fallback : sélecteurs CSS `[data-job-id]` pour extraire les offres
3. Extraction avec confidence medium au lieu de high

**Résultat attendu** :
- Offres extraites avec `extraction.titleConfidence = 'medium'`
- Log : `status='success'`, `offersFetched > 0`
- Pas d'erreur visible dans le dashboard

---

## Vérification de non-régression

Les comportements suivants doivent rester identiques :

| Comportement                          | Test de vérification                              |
|---------------------------------------|---------------------------------------------------|
| LinkedIn avec rssUrl → RSS existant   | `config.rssUrl` défini → `fetchRssFeed` appelé    |
| Terme exclu → score 0                 | `excludeTitles/excludeDomains` toujours appliqués |
| Entreprise blacklistée → score 0      | `blacklistedCompanies` toujours appliqués         |
| Contrat strict → disqualification     | Mode strict + mauvais contrat → score 0           |
| Salary penalty                        | Offre sous `salary.min` → -30 pts                 |
| Time-decay                            | -2 pts/jour, max -20                              |
| France Travail token refresh          | Token persisté après collecte                     |
