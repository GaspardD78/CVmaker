# Feature Specification: Refonte Veille Emploi — Fiabilité, Pertinence et Transparence

**Feature Branch**: `002-job-watch-reliability`  
**Created**: 2026-04-15  
**Status**: Clarified  

## Clarifications

### Session 2026-04-15

- Q: Comportement si jobTitles est vide → A: base = 50 si `jobTitles.length === 0` (comportement permissif), warning affiché dans HealthDashboard.
- Q: Terme exclu en description uniquement → A: score = 0 pour tout terme exclu, quelle que soit sa position (titre ou description) — pas de distinction.
- Q: Plafond en mode strict avec base = 0 → A: supprimer le cap strict explicite ; le scoring naturel donne déjà un score bas sans jobTitle match.
- Q: Granularité du log fetch → A: 1 ligne par source par collecte (pas de log global).
- Q: Rétention des logs → A: 50 derniers logs par source, purge automatique en fin de collecte (`DELETE ... WHERE id NOT IN (SELECT id ... ORDER BY fetched_at DESC LIMIT 50)`).
- Q: Visibilité dans le HealthDashboard → A: Vue synthétique (dernière collecte par source) par défaut, avec lien "Voir l'historique" expandant vers les 10 dernières collectes par source.
- Q: Stockage du score minimum → A: Persisté dans `job_watch_settings` (clé `min_save_score`), exposé dans `JobWatchSettings`, configurable dans `JobWatchConfigView` (section "Options avancées").
- Q: Comportement sur les offres déjà sauvegardées → A: Le seuil ne touche pas les offres existantes ; ajout d'un bouton "Purger les offres en dessous de X pts" dans `JobOffersView`.
- Q: Endpoint LinkedIn et transport → A: `tauriFetch` (plugin HTTP Tauri, bypass CORS) en premier ; si LinkedIn renvoie 999 ou bloque, message explicite "Utilisez rss.app". Pas de nouvelle commande Rust.
- Q: Parsing de la réponse LinkedIn → A: DOMParser + extraction JSON-LD en priorité (même pattern que `wttj.ts`) ; fallback sélecteurs CSS si JSON-LD absent. Utilitaires partagés dans `json-ld-utils.ts`.
- Q: Rétrocompatibilité configs linkedin_rss → A: Mode du connecteur existant — si `rssUrl` est définie, comportement RSS conservé ; si `rssUrl` est vide, tentative de scraping direct. Pas de nouvelle source, pas de migration.
- Q: Re-scoring des offres existantes → A: Pas de recalcul. Info-bulle dans HealthDashboard : "Le scoring a été mis à jour. Les offres précédentes conservent leur score d'origine."
- Q: Tests unitaires pour le scoring → A: Créer `src/lib/watcher/scorer.test.ts` avec au minimum : score = 0 si terme exclu, score ≤ 25 si aucun jobTitle en balanced, score ≥ 40 si jobTitle exact dans titre, base = 50 si jobTitles vide.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Transparence par source (Priority: P1)

Après chaque collecte automatique ou manuelle, l'utilisateur peut consulter, pour chaque source configurée, un résumé clair : combien d'offres ont été récupérées, combien sont nouvelles, quel est le statut (succès / erreur / vide / non configurée) et quand a eu lieu la dernière collecte réussie. Ces informations sont affichées dans le HealthDashboard existant sous forme d'un tableau "Dernières collectes". Par défaut, une ligne par source affiche la dernière collecte ; un lien "Voir l'historique" révèle les 10 dernières collectes de cette source.

Si l'utilisateur n'a configuré aucun jobTitle dans son profil de recherche, le HealthDashboard affiche un avertissement visible : "Aucun titre de poste cible configuré — tous les scores seront permissifs (base 50)."

**Why this priority**: C'est le problème le plus immédiatement douloureux — l'utilisateur ne comprend pas pourquoi sa veille ne remonte rien. La transparence débloque la confiance dans le système avant même d'améliorer la pertinence des résultats.

**Independent Test**: Déclencher une collecte avec au moins une source fonctionnelle et une source en erreur → le tableau dans le HealthDashboard affiche les deux lignes avec les bonnes couleurs, le bon statut et un timestamp.

**Acceptance Scenarios**:

1. **Given** une collecte vient de se terminer avec succès sur APEC (12 offres récupérées, 4 nouvelles), **When** l'utilisateur ouvre le HealthDashboard, **Then** la ligne APEC affiche : statut vert "Succès", "12 récupérées", "4 nouvelles", timestamp de la collecte.
2. **Given** la source WTTJ a rencontré une erreur réseau lors de la dernière collecte, **When** l'utilisateur consulte le HealthDashboard, **Then** la ligne WTTJ affiche : statut rouge "Erreur", le message d'erreur lisible, la date de la dernière collecte réussie si elle existe.
3. **Given** une source n'a pas encore été configurée, **When** l'utilisateur consulte le HealthDashboard, **Then** la ligne de cette source affiche : statut gris "Non configurée", sans timestamp.
4. **Given** une collecte a retourné 0 offre sans erreur, **When** l'utilisateur consulte le HealthDashboard, **Then** la ligne affiche : statut orange "Aucun résultat", "0 récupérée".
5. **Given** l'utilisateur clique sur "Voir l'historique" d'une source, **When** la section s'expand, **Then** les 10 dernières collectes de cette source sont affichées avec leur statut et timestamp respectifs.
6. **Given** le profil de recherche n'a aucun jobTitle configuré, **When** l'utilisateur ouvre le HealthDashboard, **Then** un avertissement "Aucun titre de poste cible configuré" est visible.

---

### User Story 2 — Scoring affiné par champ (Priority: P2)

Le score de pertinence d'une offre part de 0 et est gagné selon la présence des termes dans le titre ou la description. Exception : si le profil n'a aucun jobTitle configuré, le score de base est 50 (comportement permissif). Tout terme exclu trouvé dans le titre ou la description entraîne immédiatement un score de 0 (veto absolu, sans distinction de position). Le score final est un entier entre 0 et 100.

**Why this priority**: Le scoring actuel (base 50 fixe) produit trop d'offres hors-cible avec un score élevé. Corriger cela améliore directement la qualité perçue de la veille.

**Independent Test**: Calculer le score d'une offre dont le titre contient exactement un jobTitle cible → score ≥ 40 ; offre sans aucun jobTitle en mode balanced → score ≤ 25 ; offre avec terme exclu → score = 0.

**Acceptance Scenarios**:

1. **Given** un profil avec jobTitle "Développeur React" et une offre dont le titre est "Développeur React Senior", **When** le score est calculé, **Then** le score est ≥ 40 (match titre haute confiance).
2. **Given** un profil avec jobTitle "Chef de Projet" et une offre dont le titre ne le mentionne pas mais la description si, **When** le score est calculé, **Then** le score est compris entre 15 et 25.
3. **Given** un profil avec terme exclu "stage" et une offre dont le titre OU la description contient "stage", **When** le score est calculé, **Then** le score est exactement 0 (veto absolu, sans distinction de position).
4. **Given** un profil en mode balanced et une offre sans aucun match jobTitle, **When** le score est calculé, **Then** le score est ≤ 25 même si skills et contrat correspondent.
5. **Given** un profil avec 3 skills et une offre dont le titre en contient 2, **When** le score est calculé, **Then** le bonus skills titre est +12 pts (2 × 6, dans le plafond de +24).
6. **Given** un profil sans aucun jobTitle configuré, **When** le score d'une offre est calculé, **Then** le score de base est 50 (comportement permissif, pas de cap à 25).

---

### User Story 3 — Statuts de collecte persistants (Priority: P2)

Chaque collecte par source génère un enregistrement en base de données. Les 50 logs les plus récents par source sont conservés ; les plus anciens sont purgés automatiquement en fin de collecte. Ces enregistrements constituent la source de vérité pour le HealthDashboard.

**Why this priority**: Sans persistance, les statuts disparaissent au redémarrage. Bloquante pour US-1 mais développable en parallèle.

**Independent Test**: Déclencher une collecte → redémarrer l'application → le HealthDashboard affiche toujours le statut de la collecte avec le bon timestamp.

**Acceptance Scenarios**:

1. **Given** une collecte APEC réussie a eu lieu, **When** l'application redémarre, **Then** le statut APEC est toujours affiché avec le bon timestamp.
2. **Given** plus de 50 collectes ont eu lieu pour une source, **When** la 51ème collecte se termine, **Then** le log le plus ancien est automatiquement supprimé (conservation des 50 plus récents).
3. **Given** la table de logs n'existe pas encore, **When** l'application démarre, **Then** la table est créée automatiquement via un fallback `CREATE TABLE IF NOT EXISTS` dans `db.ts`.

---

### User Story 4 — Alternative LinkedIn sans RSS externe (Priority: P3)

L'utilisateur peut renseigner une URL de recherche LinkedIn dans la configuration de la source. Si `rssUrl` est déjà configurée, le comportement RSS existant est conservé sans changement. Si `rssUrl` est vide, l'application tente de scraper directement la page publique via le plugin HTTP Tauri (bypass CORS natif), en extrayant les offres JSON-LD JobPosting avec le même pattern que `wttj.ts`. Si le scraping échoue, un message d'erreur explicite suggère rss.app.

**Why this priority**: La dépendance à rss.app est un coût potentiel, mais le scraping LinkedIn est fragile par nature.

**Independent Test**: Configurer une URL LinkedIn publique sans `rssUrl` → déclencher une collecte → soit des offres s'affichent, soit un message d'erreur explicite apparaît — jamais un crash silencieux.

**Acceptance Scenarios**:

1. **Given** l'utilisateur a une `rssUrl` rss.app configurée, **When** la collecte se lance, **Then** le comportement RSS existant est utilisé sans modification.
2. **Given** `rssUrl` est vide et une URL de recherche LinkedIn est fournie, **When** la collecte se lance, **Then** l'app utilise le plugin HTTP Tauri pour récupérer la page et extrait les JSON-LD JobPosting.
3. **Given** LinkedIn bloque le scraping (statut 999 ou page nécessitant du JS), **When** la collecte se lance, **Then** le statut est "Erreur" avec le message "Scraping LinkedIn échoué — essayez rss.app comme alternative."
4. **Given** ni `rssUrl` ni URL de recherche LinkedIn ne sont configurées, **When** la collecte se lance, **Then** la source est marquée "Non configurée" et ignorée silencieusement.
5. **Given** une page LinkedIn contient des offres sans JSON-LD valide, **When** le parser tente l'extraction, **Then** le fallback sélecteurs CSS est utilisé ; les offres valides sont extraites, les invalides ignorées.

---

### User Story 5 — Filtre "Pertinence minimale" configurable (Priority: P3)

L'utilisateur peut définir un score minimum (entre 0 et 60, défaut 20) dans la section "Options avancées" de `JobWatchConfigView`. La valeur est persistée dans `job_watch_settings` sous la clé `min_save_score`. Les offres en dessous du seuil ne sont pas insérées en base lors de la collecte. Les offres déjà en base ne sont pas rétroactivement supprimées — mais un bouton "Purger les offres en dessous de X pts" est disponible dans `JobOffersView`.

**Why this priority**: Réduit le volume de la base et le bruit. Non critique — l'utilisateur peut filtrer à l'affichage en attendant.

**Independent Test**: Configurer `min_save_score` à 40 → déclencher une collecte → toutes les offres en base ont un score ≥ 40.

**Acceptance Scenarios**:

1. **Given** `min_save_score` est à 30 et une offre a un score de 18, **When** la collecte traite cette offre, **Then** l'offre n'est pas insérée en base.
2. **Given** `min_save_score` est à 30 et une offre a un score de 35, **When** la collecte traite cette offre, **Then** l'offre est insérée normalement.
3. **Given** l'utilisateur clique sur "Purger les offres en dessous de X pts" dans `JobOffersView`, **When** la confirmation est validée, **Then** toutes les offres non archivées avec un score < `min_save_score` sont supprimées de la base.
4. **Given** aucune valeur n'a été configurée, **When** la collecte se lance, **Then** le seuil par défaut de 20 est appliqué.
5. **Given** l'utilisateur monte `min_save_score` de 20 à 40, **When** la valeur est sauvegardée, **Then** les offres déjà en base avec un score entre 20 et 39 ne sont PAS supprimées automatiquement.

---

### Edge Cases

- Deux collectes simultanées pour la même source : les deux logs sont enregistrés sans corruption (INSERT séquentiel via la file d'écriture existante de `cvStore`).
- `min_save_score` modifié entre deux collectes : les offres déjà en base ne sont pas rétroactivement affectées.
- Table `job_watch_fetch_log` échoue à être créée : la collecte continue, les statuts ne sont pas persistés (dégradation gracieuse).
- Offre LinkedIn avec JSON-LD invalide ou incomplet : l'offre est ignorée sans bloquer les autres.
- `jobTitles` vide dans le profil : base = 50, warning dans HealthDashboard, pas de cap à 25.
- Plus de 50 logs par source : la purge automatique tronque à 50 après chaque collecte.
- Utilisateur avec `rssUrl` configurée pour LinkedIn : comportement RSS conservé sans modification (rétrocompatibilité).

## Requirements *(mandatory)*

### Functional Requirements

**Transparence et persistance (US-1, US-3)**

- **FR-001**: Le système DOIT enregistrer en base, après chaque collecte par source, un log contenant : `source`, `fetched_at`, `offers_fetched` (int), `offers_new` (int), `status` (`success` | `error` | `empty`), `error_message` (nullable), `duration_ms`.
- **FR-002**: Le HealthDashboard DOIT afficher un tableau "Dernières collectes" avec, par défaut, une ligne par source montrant la dernière collecte (statut coloré, offres récupérées, offres nouvelles, timestamp).
- **FR-003**: Un lien "Voir l'historique" par source DOIT expandre vers les 10 dernières collectes de cette source.
- **FR-004**: Le statut "Non configurée" DOIT être affiché pour toute source sans configuration active, sans déclencher de collecte ni d'erreur.
- **FR-005**: Les logs de collecte DOIVENT survivre au redémarrage de l'application.
- **FR-006**: La table `job_watch_fetch_log` DOIT être créée via un fallback `CREATE TABLE IF NOT EXISTS` dans `db.ts` (pas de fichier de migration séparé).
- **FR-007**: Après chaque collecte pour une source donnée, les logs excédant les 50 plus récents DOIVENT être supprimés automatiquement.
- **FR-008**: Si `jobTitles.length === 0` dans le profil de recherche, le HealthDashboard DOIT afficher un avertissement visible invitant l'utilisateur à configurer des titres cibles.

**Scoring (US-2)**

- **FR-009**: Le score de base DOIT être 0 lorsque `jobTitles.length > 0`.
- **FR-010**: Le score de base DOIT être 50 lorsque `jobTitles.length === 0` (comportement permissif).
- **FR-011**: Un match jobTitle dans le titre avec haute confiance DOIT apporter +40 pts.
- **FR-012**: Un match jobTitle dans le titre avec confiance moyenne ou basse DOIT apporter +30 pts.
- **FR-013**: Un match jobTitle uniquement en description DOIT apporter +15 pts.
- **FR-014**: En mode balanced, l'absence de tout match jobTitle (avec `jobTitles` non vide) DOIT plafonner le score à 25.
- **FR-015**: Tout terme exclu trouvé dans le titre OU la description DOIT fixer le score à 0 immédiatement (veto absolu, court-circuit, sans distinction de position).
- **FR-016**: Chaque skill matchant dans le titre DOIT apporter +6 pts (plafond cumulé : +24).
- **FR-017**: Chaque skill matchant en description DOIT apporter +3 pts (plafond cumulé : +12).
- **FR-018**: Un type de contrat correspondant DOIT apporter +10 pts.
- **FR-019**: Un type de contrat non correspondant en mode balanced DOIT soustraire 15 pts.
- **FR-020**: Le score final DOIT être clampé entre 0 et 100.
- **FR-021**: Aucun cap explicite pour le mode strict n'est maintenu — le scoring naturel s'applique.
- **FR-022**: Toutes les modifications de scoring DOIVENT rester dans `scorer.ts`.
- **FR-023**: Un fichier `src/lib/watcher/scorer.test.ts` DOIT être créé avec au minimum 4 cas : score = 0 si terme exclu présent (titre ou description), score ≤ 25 si aucun jobTitle en mode balanced, score ≥ 40 si jobTitle exact dans titre, base = 50 si jobTitles vide.
- **FR-024**: Les offres déjà en base NE DOIVENT PAS être re-scorées lors de la mise à jour du scoring. Une info-bulle DOIT être affichée dans le HealthDashboard : "Le scoring a été mis à jour. Les offres précédentes conservent leur score d'origine."

**LinkedIn sans RSS (US-4)**

- **FR-025**: Si `rssUrl` est définie pour la source `linkedin_rss`, le comportement RSS existant DOIT être conservé sans modification.
- **FR-026**: Si `rssUrl` est vide et qu'une URL de recherche LinkedIn est configurée, l'application DOIT tenter d'extraire les offres via le plugin HTTP Tauri (pas de nouvelle commande Rust).
- **FR-027**: L'extraction DOIT utiliser DOMParser + JSON-LD JobPosting en priorité, avec fallback sélecteurs CSS si JSON-LD est absent.
- **FR-028**: Les fonctions utilitaires JSON-LD partagées avec `wttj.ts` DOIVENT être extraites dans `src/lib/watcher/json-ld-utils.ts`.
- **FR-029**: En cas d'échec du scraping (statut 999, page JS, timeout), l'application DOIT afficher "Scraping LinkedIn échoué — essayez rss.app comme alternative."
- **FR-030**: L'absence de toute configuration LinkedIn DOIT marquer la source "Non configurée" sans erreur.

**Filtre pertinence minimale (US-5)**

- **FR-031**: Le score minimum DOIT être persisté dans `job_watch_settings` sous la clé `min_save_score` (entier entre 0 et 60, défaut 20).
- **FR-032**: La valeur DOIT être exposée dans `JobWatchSettings` et configurable dans `JobWatchConfigView` (section "Options avancées").
- **FR-033**: Les offres dont le score est inférieur à `min_save_score` DOIVENT être rejetées avant l'insertion en base.
- **FR-034**: La modification de `min_save_score` NE DOIT PAS affecter rétroactivement les offres déjà en base.
- **FR-035**: Un bouton "Purger les offres en dessous de X pts" DOIT être disponible dans `JobOffersView` (toolbar), supprimant les offres non archivées dont le score < `min_save_score` après confirmation utilisateur.

### Key Entities

- **FetchLog** : Résultat d'une collecte par source. Attributs : `id`, `source`, `fetched_at`, `offers_fetched`, `offers_new`, `status` (`success` | `error` | `empty`), `error_message` (nullable), `duration_ms`. Rétention : 50 logs maximum par source.
- **Score minimum de sauvegarde** : Paramètre stocké dans `job_watch_settings` (clé `min_save_score`), entier entre 0 et 60, défaut 20. Exposé dans `JobWatchSettings`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Après chaque collecte, l'utilisateur peut voir le statut de chaque source dans le HealthDashboard sans redémarrer l'application.
- **SC-002**: Les statuts de collecte sont affichés dans le HealthDashboard après un redémarrage de l'application.
- **SC-003**: Une offre dont le titre contient exactement un jobTitle cible obtient un score ≥ 40.
- **SC-004**: Une offre sans aucun match jobTitle en mode balanced obtient un score ≤ 25.
- **SC-005**: Toute offre contenant un terme exclu (dans le titre ou la description) obtient un score de 0.
- **SC-006**: Avec `min_save_score` à 20, toutes les offres insérées en base ont un score ≥ 20.
- **SC-007**: La configuration d'une URL LinkedIn aboutit soit à des offres importées, soit à un message d'erreur explicite — jamais à un crash silencieux.
- **SC-008**: Les tests dans `mapping.test.ts` continuent de passer sans modification.
- **SC-009**: Les 4 cas de test définis dans `scorer.test.ts` passent après la refonte du scoring.
- **SC-010**: La base de données ne dépasse pas 50 logs par source (`job_watch_fetch_log`).

## Assumptions

- L'interface principale `JobOffersView` est enrichie uniquement du bouton "Purger" — pas d'autre modification.
- Le schéma `SearchProfile` (jobTitles, skills, contractTypes, excludeTitles, scoring.mode) reste inchangé.
- Le système de feedback/learning existant n'est pas modifié.
- La distinction "haute confiance" / "confiance moyenne ou basse" pour les jobTitles réutilise le mécanisme d'analyse déjà présent dans `scorer.ts`.
- LinkedIn peut bloquer le scraping — la fonctionnalité est "best effort" avec fallback explicite vers rss.app.
- Aucune nouvelle dépendance npm n'est nécessaire.
- Les sources `emploi_territorial` et `mantiks` suivent le même schéma de log mais restent sans parser implémenté.
- Les offres existantes en base conservent leur score d'origine après la refonte du scoring (pas de recalcul).
- `rssUrl` définie dans une config `linkedin_rss` existante implique le comportement RSS conservé sans modification (rétrocompatibilité garantie).
