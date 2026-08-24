# Feature Specification: Veille Emploi — Portefeuille multi-alertes et aide IA stratégique

**Feature Branch**: `claude/job-alerts-multi-ai-optimization-a8nbxl`
**Created**: 2026-08-24
**Status**: À valider
**Prérequis**: 002-job-watch-reliability (scoring v2, fetch log, seuil de sauvegarde)

---

## 1. Intention

La veille emploi actuelle ne sait faire qu'**une seule recherche**. C'est une contrainte
structurante : elle oblige l'utilisateur à choisir *une* cible, et donc à renoncer à
l'exploration. Or une recherche d'emploi efficace ne se joue pas sur une cible unique,
elle se joue sur un **portefeuille de pistes** menées en parallèle :

- une piste **cœur de cible** — le poste que l'on vise vraiment, celui pour lequel on est
  le plus légitime ;
- une ou plusieurs pistes **adjacentes** — le même métier sous un autre intitulé, ou un
  métier voisin accessible avec les mêmes compétences ;
- une piste **exploratoire** — une ouverture assumée : autre secteur, autre géographie,
  autre format de contrat ;
- éventuellement une piste **opportuniste** — un angle étroit mais à forte valeur
  (une entreprise cible, une technologie rare, un type de structure).

L'objectif de cette évolution est double :

1. **Permettre 3 à 4 alertes indépendantes**, chacune avec sa propre définition de
   recherche, ses propres sources, son propre scoring et son propre apprentissage.
2. **Faire de l'IA un stratège, pas seulement un filtre** : qu'elle aide à *construire*
   ce portefeuille, à vérifier que les pistes sont réellement complémentaires, et à
   signaler ce qui n'est pas exploré.

### Ce que cette évolution n'est pas

- Ce n'est pas un multi-utilisateur (il existe déjà, via `profile_id`). Un utilisateur
  possède plusieurs alertes ; les alertes d'un utilisateur ne sont jamais visibles par
  un autre.
- Ce n'est pas une refonte du scoring. `computeScore()` reste inchangé dans sa logique ;
  seul son **contexte d'appel** devient l'alerte plutôt que le réglage global.
- Aucun appel réseau vers un LLM n'est introduit. Le modèle « copier le prompt → coller
  le JSON » est conservé pour toutes les fonctions IA, sans exception.

---

## 2. Décisions structurantes (validées)

| # | Sujet | Décision retenue |
|---|---|---|
| D1 | Périmètre d'une alerte | Profil de recherche **complet et autonome** : titres, compétences, domaines, exclusions, localisation + rayon, contrats, salaire, mode de scoring, blacklist entreprises, filtres APEC, **et sélection de sources** |
| D2 | Offre captée par plusieurs alertes | **Une seule fiche** en base, rattachée à N alertes via une table de liaison, avec un **score par alerte** |
| D3 | Apprentissage | **Par alerte** — dictionnaire appris et réputation entreprise isolés par piste |
| D4 | Collecte | Sources choisies par alerte, requêtes identiques **mutualisées**, exécution **séquencée** avec throttle par source |
| D5 | Digest email | **Un seul email**, une section par alerte, offre multi-pistes affichée une seule fois |
| D6 | Aide IA | Prompt **stratège** (génération du portefeuille) + **filtre IA par alerte** + analyse **recouvrement / angles morts** + prompts Santé **scopés par alerte avec vue portefeuille** |
| D7 | Limite | **4 alertes maximum** par utilisateur (`MAX_ALERTS = 4`) |
| D8 | Migration | La configuration actuelle devient l'alerte « Recherche principale » ; toutes les offres existantes y sont rattachées ; aucune donnée perdue |
| D9 | Fréquence de collecte | **Globale** (un seul `setInterval`, réglage inchangé). Pas d'intervalle par alerte dans cette itération |

### Réglages qui restent globaux (hors alerte)

Ces paramètres décrivent l'environnement technique de l'utilisateur, pas son intention
de recherche. Les dupliquer par alerte n'aurait aucun sens et multiplierait les erreurs
de configuration :

- SMTP (`emailSmtpHost/Port/User/Password`, `emailTo`, `emailDigestEnabled`, `emailDigestTime`)
- Identifiants France Travail (`ftClientId`, `ftClientSecret`, tokens)
- Navitia et trajet domicile (`navitiaApiKey`, `commuteOriginAddress`, `commuteDepartureTime`, `commuteMaxMinutes`)
- Sessions de connexion aux sites (LinkedIn, Indeed, HelloWork)
- Hygiène des données : `fetchIntervalHours`, `minSaveScore`, `autoCleanExpiredEnabled`, `expiredMaxAgeDays`
- Overrides de sélecteurs CSS (débogage des parsers)

---

## 3. User Stories

### US1 — Créer et gérer un portefeuille de pistes (P1)

L'utilisateur ouvre la Configuration de la Veille et voit la **liste de ses alertes**.
Chacune affiche son nom, son type (cœur de cible / adjacent / exploratoire /
opportuniste), sa couleur, ses sources actives, son état et la date de sa dernière
collecte. Il peut créer une alerte, la dupliquer pour en dériver une variante, la
désactiver temporairement, la renommer ou la supprimer.

**Why P1** : sans gestion des alertes, rien d'autre n'existe. C'est le socle.

**Independent Test** : créer 2 alertes, en dupliquer une, en désactiver une → la
liste reflète l'état, la collecte n'interroge que les alertes actives.

**Acceptance Scenarios**

1. **Given** un utilisateur avec une seule alerte issue de la migration, **When** il clique « Nouvelle alerte », **Then** une alerte vierge est créée avec un profil de recherche par défaut et le nom « Nouvelle piste ».
2. **Given** 4 alertes existantes, **When** l'utilisateur tente d'en créer une cinquième, **Then** le bouton est désactivé et un message explique la limite de 4 pistes et sa raison (charge de collecte, recouvrement).
3. **Given** une alerte « Piste RH », **When** l'utilisateur la duplique, **Then** une copie « Piste RH (copie) » est créée avec le même profil de recherche et les mêmes sources, mais **sans** son dictionnaire appris ni son historique de collecte.
4. **Given** une alerte désactivée, **When** une collecte se déclenche, **Then** aucune requête n'est émise pour cette alerte et ses offres déjà en base restent consultables.
5. **Given** une alerte supprimée, **When** la suppression est confirmée, **Then** ses liaisons vers les offres sont supprimées ; une offre qui n'est plus rattachée à aucune alerte reste en base et devient consultable dans « Non rattachées ».
6. **Given** l'utilisateur édite le profil de recherche d'une alerte, **When** il enregistre, **Then** seules les collectes suivantes sont affectées — les scores des offres déjà captées ne sont pas recalculés (cohérent avec la décision de la spec 002).

---

### US2 — Consulter les offres par piste (P1)

Dans la vue Offres, une **barre de pistes** permet de basculer entre « Toutes les
pistes » et une alerte donnée. Chaque carte d'offre porte les **badges colorés** des
pistes qui l'ont captée. Quand une piste est sélectionnée, le score affiché est celui
**de cette piste** ; en vue « Toutes », c'est le meilleur score toutes pistes confondues.

**Why P1** : sans lecture par piste, le portefeuille est illisible et l'utilisateur ne
peut pas juger de la performance de chaque exploration.

**Independent Test** : une offre captée par 2 alertes apparaît une seule fois en vue
« Toutes » avec 2 badges, et dans chacune des 2 vues par piste avec le score correspondant.

**Acceptance Scenarios**

1. **Given** une offre captée par « Piste RH » (score 78) et « Piste Ops » (score 54), **When** l'utilisateur est en vue « Toutes », **Then** l'offre apparaît **une fois**, score 78, avec les deux badges.
2. **Given** la même offre, **When** l'utilisateur sélectionne « Piste Ops », **Then** l'offre apparaît avec le score 54.
3. **Given** une piste sélectionnée, **When** l'utilisateur applique les filtres existants (source, score minimum, statut, date, trajet), **Then** ces filtres se combinent avec le filtre de piste.
4. **Given** plusieurs pistes avec des offres non lues, **When** l'utilisateur regarde la barre de pistes, **Then** chaque chip affiche son compteur de non-lues, et le total est cohérent avec la vue « Toutes » (une offre non lue captée par 2 pistes compte 1 dans chaque piste et 1 au total).
5. **Given** une offre marquée lue depuis la vue « Piste RH », **When** l'utilisateur bascule sur « Piste Ops », **Then** l'offre y est également marquée lue — le statut lu/archivé est porté par l'**offre**, pas par la liaison.

---

### US3 — Collecte multi-alertes maîtrisée (P1)

La collecte interroge chaque source **une seule fois par requête distincte**, même si
plusieurs alertes produisent la même requête. Les requêtes sont espacées dans le temps
pour ne pas déclencher les protections anti-bot des sites scrapés. Le tableau de bord
Santé affiche le résultat **par alerte et par source**.

**Why P1** : sans mutualisation ni throttle, passer de 1 à 4 alertes multiplie les
requêtes par 4 et fait tomber les sources scrapées (LinkedIn, Indeed, HelloWork).

**Independent Test** : 2 alertes ciblant la même ville sur APEC avec des mots-clés
différents → 2 requêtes ; 2 alertes strictement identiques sur APEC → 1 requête, 2
rattachements.

**Acceptance Scenarios**

1. **Given** deux alertes produisant une requête APEC identique, **When** une collecte se déclenche, **Then** une seule requête réseau est émise et ses offres sont évaluées par les deux alertes.
2. **Given** une source scrapée, **When** deux requêtes distinctes la visent dans le même cycle, **Then** elles sont espacées d'au moins le délai de throttle configuré pour cette source.
3. **Given** une offre déjà en base captée par une alerte existante, **When** une **nouvelle** alerte la match lors d'une collecte, **Then** la liaison manquante est créée sans dupliquer l'offre, et sans réinitialiser son statut lu/archivé.
4. **Given** une offre notée 12 par l'alerte A et 71 par l'alerte B, avec un seuil de sauvegarde à 20, **When** la collecte l'évalue, **Then** l'offre est **sauvegardée** (le seuil s'évalue sur le meilleur score) et **rattachée uniquement à B**.
5. **Given** une offre disqualifiée par l'alerte A (terme exclu) mais valide pour B, **When** la collecte l'évalue, **Then** elle n'est jamais rattachée à A.
6. **Given** une collecte terminée, **When** l'utilisateur ouvre le tableau de bord Santé, **Then** il voit une ligne par couple (alerte, source) avec offres récupérées, nouvelles, filtrées, doublons et statut.
7. **Given** une configuration à 4 alertes actives, **When** l'utilisateur consulte la Configuration, **Then** une estimation de charge est affichée : nombre de requêtes par cycle et nombre de requêtes mutualisées.

---

### US4 — Apprentissage isolé par piste (P2)

Les actions de l'utilisateur (import Kanban, pouce haut/bas, archivage rapide) nourrissent
le dictionnaire appris **de la piste dans laquelle l'action a été faite**. Rejeter des
offres « commercial » sur la piste RH ne pénalise pas la piste exploratoire où ce terme
est légitime.

**Why P2** : c'est ce qui rend la stratégie d'ouverture viable dans la durée. Sans
isolation, la piste dominante — celle qui génère le plus de volume et donc le plus de
signal — finit par imposer ses pondérations aux autres et les stérilise.

**Independent Test** : archiver 5 offres contenant « commercial » depuis la piste A →
le dictionnaire négatif de A contient « commercial », celui de B est inchangé.

**Acceptance Scenarios**

1. **Given** une action utilisateur effectuée avec la piste A sélectionnée, **When** le feedback est enregistré, **Then** il porte `alert_id = A`.
2. **Given** une action effectuée en vue « Toutes les pistes », **When** le feedback est enregistré, **Then** il est attribué à la piste qui a le **meilleur score** sur cette offre.
3. **Given** des dictionnaires appris distincts, **When** une collecte score une offre pour la piste A, **Then** seuls les signaux appris de A sont utilisés.
4. **Given** l'utilisateur blackliste une entreprise depuis la piste A, **When** on lui propose l'action, **Then** l'application demande explicitement si la blacklist vaut pour cette piste seulement ou pour toutes.
5. **Given** la décroissance temporelle du dictionnaire (`decayLearnedDict`), **When** elle s'applique, **Then** elle s'applique indépendamment à chaque alerte.

---

### US5 — L'IA construit le portefeuille (P1)

Depuis la Configuration, l'utilisateur décrit son intention en langage naturel. L'app
génère un **prompt stratège** contenant son profil (titre, compétences, expériences),
ses contraintes et, s'il existe, son portefeuille actuel. Collé dans ChatGPT / Claude /
Gemini, ce prompt renvoie un JSON décrivant 3 à 4 alertes complémentaires. L'utilisateur
colle ce JSON, obtient un **aperçu** de ce qui sera créé ou remplacé, et applique.

**Why P1** : c'est la demande centrale. Configurer 4 pistes cohérentes à la main est
long et l'utilisateur reproduit spontanément la même piste 4 fois — exactement ce que
le portefeuille doit éviter.

**Independent Test** : coller un JSON valide de 4 alertes → l'aperçu liste 4 créations,
l'application produit 4 alertes configurées et actives.

**Acceptance Scenarios**

1. **Given** un profil renseigné et une intention saisie, **When** l'utilisateur clique « Générer le prompt stratège », **Then** le prompt est copié dans le presse-papier et affiché, incluant le profil, l'intention, les contraintes, la liste des sources disponibles et le schéma JSON attendu.
2. **Given** un JSON de portefeuille valide, **When** l'utilisateur le colle et valide, **Then** un aperçu montre pour chaque alerte : nom, type, justification, titres visés, exclusions, localisation, contrats, sources — et indique si elle sera créée ou si elle remplacera une alerte existante.
3. **Given** l'aperçu affiché, **When** l'utilisateur applique, **Then** les alertes sont créées en une seule transaction ; en cas d'erreur, aucune alerte n'est créée.
4. **Given** un JSON proposant 5 alertes, **When** il est validé, **Then** l'import est refusé avec un message explicite (limite de 4).
5. **Given** un JSON malformé ou de version inconnue, **When** il est validé, **Then** un message d'erreur précis désigne le champ fautif, et rien n'est modifié.
6. **Given** un import appliqué, **When** l'utilisateur consulte ses offres, **Then** aucune offre existante n'a été supprimée.
7. **Given** un portefeuille déjà existant, **When** l'utilisateur relance le prompt stratège, **Then** le prompt inclut le portefeuille actuel et demande explicitement à l'IA de proposer des ajustements plutôt que de repartir de zéro.

---

### US6 — Un filtre IA propre à chaque piste (P2)

Le filtre IA existant (`AIFilterRule`) cesse d'être global : chaque alerte a le sien.
Le prompt de génération est enrichi du contexte de l'alerte — ses titres visés, ses
exclusions déjà en place, et les autres pistes du portefeuille — pour que la règle
produite soit complémentaire et non redondante.

**Why P2** : une règle globale ne peut pas exclure « alternance » sur la piste cadre
tout en la gardant sur une piste exploratoire. Elle force au plus petit dénominateur
commun.

**Acceptance Scenarios**

1. **Given** une alerte sélectionnée, **When** l'utilisateur génère un prompt de filtre IA, **Then** le prompt contient le nom et le profil de cette alerte, ainsi que les noms et titres visés des autres pistes.
2. **Given** une règle validée, **When** elle est enregistrée, **Then** elle est appliquée au scoring **de cette alerte uniquement**.
3. **Given** une règle existante sur une alerte, **When** l'utilisateur supprime la règle, **Then** les autres alertes conservent la leur.
4. **Given** la migration depuis l'ancienne règle globale, **When** elle s'exécute, **Then** la règle existante est attribuée à l'alerte issue de la migration.

---

### US7 — Recouvrement et angles morts (P2)

L'application calcule localement, sur les 30 derniers jours : pour chaque paire de
pistes, le pourcentage d'offres communes ; pour chaque piste, son volume, ses offres
exclusives, son taux de lecture, son taux d'import Kanban et son taux d'archivage
rapide. Ces métriques alimentent un **prompt de revue de portefeuille** dont la réponse
JSON désigne les redondances, les pistes à ajuster, fusionner ou abandonner, et les
angles morts non couverts.

**Why P2** : deux pistes qui ramènent 80 % des mêmes offres consomment un quart du
budget de collecte pour rien, et donnent l'illusion d'une recherche large.

**Independent Test** : deux alertes volontairement identiques → le taux de recouvrement
calculé approche 100 % et une alerte de redondance est affichée sans même passer par l'IA.

**Acceptance Scenarios**

1. **Given** deux pistes partageant plus de 60 % de leurs offres, **When** l'utilisateur ouvre la vue portefeuille, **Then** un avertissement de redondance est affiché avec le pourcentage exact, **avant** toute intervention de l'IA.
2. **Given** un portefeuille de 3 pistes, **When** l'utilisateur génère le prompt de revue, **Then** celui-ci contient la définition de chaque piste et l'ensemble des métriques calculées.
3. **Given** un JSON de revue valide collé, **When** il est appliqué, **Then** les recommandations sont **affichées**, jamais appliquées automatiquement ; chaque suggestion structurée dispose d'un bouton d'application individuelle.
4. **Given** une piste dont le taux d'import Kanban est nul sur 30 jours avec un volume significatif, **When** la revue est générée, **Then** cette information figure explicitement dans le prompt.

---

### US8 — Digest email par piste (P3)

Le digest quotidien devient sectionné : une section par alerte, dans l'ordre du
portefeuille, chacune listant ses nouvelles offres triées par score décroissant. Une
offre captée par plusieurs pistes n'apparaît qu'une fois, dans la section de son
meilleur score, avec la mention des autres pistes concernées.

**Acceptance Scenarios**

1. **Given** 3 pistes avec de nouvelles offres, **When** le digest est envoyé, **Then** l'email contient 3 sections nommées et colorées.
2. **Given** une offre captée par 2 pistes, **When** le digest est composé, **Then** elle apparaît une seule fois, dans la section de meilleur score, avec la mention « Aussi : <autre piste> ».
3. **Given** une piste sans nouvelle offre, **When** le digest est composé, **Then** sa section affiche « Aucune nouvelle offre » plutôt que d'être omise — l'absence de résultat est une information.
4. **Given** aucune nouvelle offre sur toutes les pistes, **When** l'heure du digest arrive, **Then** aucun email n'est envoyé (comportement actuel conservé).

---

## 4. Exigences fonctionnelles

**Modèle et cycle de vie**

- **FR-001** — Un utilisateur peut détenir de 1 à 4 alertes. La suppression de la dernière alerte est interdite.
- **FR-002** — Une alerte porte : nom, couleur, type, position, état actif/inactif, un `SearchProfile` complet, une sélection de sources, une règle de filtre IA optionnelle, un dictionnaire appris et une réputation entreprise propres.
- **FR-003** — Une alerte est strictement rattachée à un `profile_id` utilisateur et n'est jamais visible depuis un autre profil.
- **FR-004** — La suppression d'une alerte supprime ses liaisons, ses logs de collecte et ses signaux appris, mais **jamais** les offres elles-mêmes.
- **FR-005** — La duplication d'une alerte copie le profil de recherche, les sources et la règle IA, mais ni l'apprentissage ni l'historique.

**Collecte et scoring**

- **FR-010** — La collecte n'interroge que les alertes actives et, pour chacune, ses sources actives.
- **FR-011** — Deux requêtes identiques (même source, mêmes paramètres normalisés) produisent **une seule** requête réseau par cycle, dont le résultat est partagé.
- **FR-012** — Deux requêtes distinctes visant la même source sont espacées d'un délai propre à cette source (plus élevé pour les sources scrapées).
- **FR-013** — Chaque offre brute est scorée indépendamment pour chaque alerte du groupe de requête, avec le `SearchProfile` et les signaux appris de cette alerte.
- **FR-014** — Une offre est sauvegardée si **au moins une** alerte lui attribue un score ≥ `minSaveScore`.
- **FR-015** — Une offre n'est rattachée à une alerte que si le score de cette alerte est ≥ `minSaveScore` et que l'alerte ne l'a pas disqualifiée.
- **FR-016** — `job_offers.score` porte le **meilleur** score toutes alertes confondues ; le score par alerte est porté par la liaison.
- **FR-017** — Une offre déjà en base nouvellement matchée par une alerte reçoit la liaison manquante sans duplication, sans modification de son statut lu/archivé et sans écraser un meilleur score existant.
- **FR-018** — Le filtre géographique de post-collecte s'applique avec la zone de l'alerte évaluée, pas une zone globale.
- **FR-019** — Le log de collecte est écrit par couple (alerte, source).

**Apprentissage**

- **FR-020** — Chaque feedback utilisateur porte l'identifiant de l'alerte dans le contexte de laquelle il a été émis ; en vue « Toutes », c'est l'alerte de meilleur score sur l'offre.
- **FR-021** — L'analyse de feedback, la décroissance temporelle et la réputation entreprise s'appliquent alerte par alerte.
- **FR-022** — L'ajout d'une entreprise à la blacklist propose explicitement le choix entre portée « cette piste » et portée « toutes les pistes ».

**Interface**

- **FR-030** — La vue Offres propose un filtre de piste (« Toutes » + une entrée par alerte) combinable avec tous les filtres existants.
- **FR-031** — Chaque carte d'offre affiche les badges des pistes qui l'ont captée.
- **FR-032** — Le score affiché est celui de la piste sélectionnée, ou le meilleur score en vue « Toutes ».
- **FR-033** — Le statut lu/archivé est porté par l'offre et donc partagé entre les pistes.
- **FR-034** — La Configuration présente la liste des alertes puis un éditeur d'alerte ; les réglages globaux (SMTP, Navitia, France Travail, sessions, hygiène des données) restent hors alerte.
- **FR-035** — La Configuration affiche une estimation de la charge de collecte : requêtes par cycle, dont mutualisées.
- **FR-036** — Le tableau de bord Santé présente les résultats par alerte, avec une bascule vers une vue portefeuille comparative.

**IA**

- **FR-040** — Aucune fonction IA n'émet d'appel réseau : toutes fonctionnent par génération de prompt et import de JSON.
- **FR-041** — Un prompt stratège produit un portefeuille de 3 à 4 alertes complémentaires, importable en JSON versionné.
- **FR-042** — L'import d'un portefeuille présente un aperçu avant application et s'applique de façon transactionnelle.
- **FR-043** — Un import de portefeuille ne supprime jamais d'offre existante.
- **FR-044** — Le prompt de filtre IA est contextualisé par l'alerte et par les autres pistes du portefeuille.
- **FR-045** — Les taux de recouvrement entre pistes sont calculés localement, sans IA.
- **FR-046** — Le prompt de revue de portefeuille embarque les définitions des pistes et leurs métriques ; ses recommandations sont affichées et jamais appliquées automatiquement.
- **FR-047** — Les prompts Santé existants (diagnostic, optimisation) sont scopés par alerte, avec un mode portefeuille supplémentaire.

**Migration**

- **FR-050** — La configuration existante devient une alerte nommée « Recherche principale », de type cœur de cible, active.
- **FR-051** — Les sources configurées, la règle IA globale, le dictionnaire appris et la réputation entreprise existants sont transférés à cette alerte.
- **FR-052** — Toutes les offres existantes de l'utilisateur y sont rattachées avec leur score actuel.
- **FR-053** — Aucun score existant n'est recalculé.
- **FR-054** — Un utilisateur possédant des sources configurées mais aucun profil de recherche enregistré reçoit une alerte au profil par défaut.

---

## 5. Critères de succès

- **SC-001** — Un utilisateur passe d'une configuration mono-recherche à un portefeuille de 4 pistes configurées en moins de 5 minutes en utilisant le prompt stratège.
- **SC-002** — Avec 4 alertes actives, le nombre de requêtes réseau par cycle reste inférieur à 4 × le nombre de sources actives, grâce à la mutualisation.
- **SC-003** — Aucune offre n'apparaît en double dans la vue Offres, quel que soit le nombre de pistes qui l'ont captée.
- **SC-004** — Après migration, l'utilisateur retrouve exactement ses offres, ses scores et ses réglages.
- **SC-005** — Le recouvrement entre deux pistes est mesurable et affiché sans intervention de l'IA.
- **SC-006** — Le rejet d'un terme sur une piste n'altère pas le scoring des autres pistes.

---

## 6. Hors périmètre

- Intervalle de collecte propre à chaque alerte (le scheduler reste global).
- Appels API directs vers un fournisseur LLM.
- Recalcul rétroactif des scores des offres existantes.
- Partage ou export d'un portefeuille entre utilisateurs.
- Alertes au-delà de 4.

---

## 7. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Multiplication des requêtes → blocage anti-bot des sources scrapées | Sources indisponibles, veille muette | Mutualisation des requêtes identiques, throttle par source, sélection de sources par alerte, estimation de charge affichée |
| Portefeuille redondant (4 fois la même piste) | Budget de collecte gaspillé, fausse impression d'ouverture | Contraintes anti-recouvrement dans le prompt stratège, calcul local du recouvrement, avertissement dans la vue portefeuille |
| Apprentissage par alerte plus lent (signal divisé par 4) | Le scoring s'affine moins vite | Décroissance temporelle inchangée, seuils d'apprentissage identiques, et le scoring de base reste piloté par le `SearchProfile` explicite |
| Migration irréversible | Perte de configuration | Migration purement additive (aucune colonne supprimée, aucune donnée écrasée), doublée d'un filet de sécurité en TypeScript côté `db.ts` selon la convention du projet |
| Complexité de l'UI de configuration | Abandon par l'utilisateur | Liste puis éditeur, réglages globaux clairement séparés, une seule piste visible à la fois |
