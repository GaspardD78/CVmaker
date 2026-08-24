# Couche IA — prompts et contrats d'échange

Principe inchangé et non négociable : **aucun appel réseau vers un LLM**. L'application
assemble un prompt, l'utilisateur le colle dans l'assistant de son choix, puis recolle
le JSON obtenu. Tout est validé et appliqué localement.

Quatre fonctions, dont deux nouvelles.

| # | Fonction | Statut | Entrée | Sortie |
|---|---|---|---|---|
| 1 | Stratège de portefeuille | **nouveau** | Profil CV + intention + contraintes + portefeuille actuel | `AlertPortfolio` (3-4 alertes) |
| 2 | Filtre IA par alerte | enrichi | Intention + contexte de l'alerte + autres pistes | `AIFilterRule` |
| 3 | Revue de portefeuille | **nouveau** | Définitions + métriques calculées localement | `PortfolioReview` |
| 4 | Diagnostic / optimisation Santé | scopé | Une alerte, ou le portefeuille | texte libre |

---

## 1. Stratège de portefeuille

`buildPortfolioStrategyPrompt(profile, entries, intent, constraints, currentPortfolio?)`

### Ce que le prompt doit obtenir

Le risque, quand on demande à un assistant « propose-moi 4 recherches d'emploi », est
qu'il produise quatre reformulations du même poste. Le prompt est donc construit autour
de **contraintes de non-recouvrement explicites** et d'une typologie imposée.

### Texte

```text
Agis comme un stratège en recherche d'emploi. Ta mission n'est pas de trouver un poste,
mais de concevoir un PORTEFEUILLE DE PISTES complémentaires à surveiller en parallèle.

# PROFIL DU CANDIDAT
- Titre actuel : {{profile.title}}
- Compétences : {{skills}}
- Expériences : {{experiences}}
- Formations : {{education}}

# INTENTION EXPRIMÉE
{{intent}}

# CONTRAINTES
- Localisation de référence : {{location}} (rayon acceptable : {{radiusKm}} km)
- Mobilité déclarée : {{mobility}}
- Types de contrat acceptés : {{contractTypes}}
- Salaire plancher : {{salaryMin}} — cible : {{salaryTarget}}

# PORTEFEUILLE ACTUEL
{{currentPortfolio ou "Aucun — portefeuille à créer de zéro."}}

# CE QU'EST UN BON PORTEFEUILLE
Un portefeuille de 3 à 4 pistes, chacune d'un type distinct :
- "core" (obligatoire, exactement une) : le poste le plus légitime au regard du profil.
  C'est la piste à plus fort taux de conversion.
- "adjacent" (1 ou 2) : même compétences, intitulé ou métier voisin. Elle capte ce que
  la piste cœur rate à cause du vocabulaire des recruteurs.
- "exploratory" (obligatoire, au moins une) : une ouverture assumée — autre secteur,
  autre géographie, autre format de contrat, ou repositionnement. Elle doit être
  plausible au vu du profil, pas fantaisiste.
- "opportunistic" (facultative) : un angle étroit à forte valeur — une technologie rare,
  un type de structure, une taille d'entreprise, un contexte particulier.

# RÈGLES IMPÉRATIVES
1. Entre 3 et 4 pistes. Jamais plus.
2. Deux pistes ne partagent pas plus d'UN terme dans leurs `jobTitles`. Si tu ne peux
   pas respecter cette règle, c'est que la piste est redondante : supprime-la.
3. Chaque piste a au moins 2 `jobTitles` et au moins 3 `excludeTitles`.
4. Les `excludeTitles` doivent être spécifiques : "développeur junior" et non "junior".
5. Les `sources` sont choisies EXCLUSIVEMENT dans la liste fournie ci-dessous, et
   doivent être cohérentes avec la piste (voir les notes d'usage).
6. `rationale` explique en une à deux phrases POURQUOI cette piste existe et ce qu'elle
   capte que les autres ne captent pas.
7. `blindSpots` liste honnêtement ce que ce portefeuille NE couvre PAS et pourquoi tu
   as écarté ces angles. Ne le laisse pas vide par complaisance.
8. Réponds UNIQUEMENT par le JSON, sans texte avant ni après.

# SOURCES DISPONIBLES
- "apec"               — cadres, France. Filtres serveur par fonction très efficaces.
- "france_travail"     — généraliste, très gros volume, tous niveaux.
- "wttj"               — tech, startups, scale-ups. Peu pertinent hors de ces milieux.
- "linkedin"           — généraliste, cadres et tech. Volume moyen, source fragile.
- "indeed"             — généraliste, gros volume, qualité inégale.
- "hellowork"          — généraliste France, bon sur les profils non-cadres.
- "jobicy"             — remote international, anglophone. Uniquement pour du remote.
- "emploi_territorial" — fonction publique territoriale UNIQUEMENT.

# SCHÉMA DE SORTIE
{{JSON_SCHEMA}}

# EXEMPLE ABRÉGÉ
Profil : Responsable recrutement, 8 ans, Paris, ATS et sourcing.
Portefeuille pertinent :
- core          : "Talent Acquisition / Recrutement" (apec, linkedin, france_travail)
- adjacent      : "RRH et développement RH" (apec, france_travail)
- exploratory   : "Recrutement tech en remote" (wttj, jobicy, linkedin)
- opportunistic : "RH en scale-up en hypercroissance" (wttj, linkedin)
Recouvrement volontairement faible : le vocabulaire, le secteur et la géographie
diffèrent d'une piste à l'autre.
```

### Contrat de sortie

Défini dans `contracts/ai-portfolio.ts`. Points de validation stricte :

- `version` doit valoir la version courante, sinon rejet explicite ;
- `alerts.length` entre 3 et `MAX_ALERTS` ;
- exactement une piste `core`, au moins une `exploratory` ;
- `jobTitles.length ≥ 2` et `excludeTitles.length ≥ 3` par piste ;
- toute source inconnue → rejet nommant la source ;
- recouvrement des `jobTitles` > 1 terme entre deux pistes → **avertissement affiché
  dans l'aperçu**, pas un rejet : c'est un jugement de qualité, pas une erreur de
  format, et l'utilisateur reste décideur.

### Import

L'aperçu affiche, pour chaque piste : nom, type, justification, titres, exclusions,
localisation, contrats, sources — et l'action (**créer** / **remplacer <nom>**).
L'application est transactionnelle : tout ou rien. Aucune offre n'est supprimée
(FR-043) ; les liaisons des alertes remplacées sont supprimées, mais les offres
subsistent, éventuellement en « Non rattachées ».

---

## 2. Filtre IA contextualisé par alerte

`buildAIFilterPrompt(intent, context)` où
`context = { alert, otherAlerts: Array<{ name, kind, jobTitles }> }`.

Le schéma `AIFilterRule` et les contraintes actuelles sont **conservés**. Trois blocs
sont insérés avant la tâche :

```text
# PISTE CONCERNÉE
Nom : {{alert.name}} (type : {{alert.kind}})
Titres visés : {{alert.searchProfile.jobTitles}}
Exclusions déjà en place : {{alert.searchProfile.excludeTitles}}
Compétences : {{alert.searchProfile.skills}}
Secteurs : {{alert.searchProfile.domains}}

# AUTRES PISTES DU PORTEFEUILLE
{{#each otherAlerts}}- {{name}} ({{kind}}) : {{jobTitles}}{{/each}}

# RÈGLES SUPPLÉMENTAIRES
- Ne réexclus PAS un terme déjà présent dans les exclusions ci-dessus : ce serait
  redondant et illisible.
- Cette règle ne s'applique QU'À cette piste. Ne cherche pas à couvrir les autres.
- N'exclus jamais un terme qui est un `jobTitle` d'une autre piste : tu couperais
  une exploration volontaire du portefeuille.
```

Cette dernière règle est le vrai apport du contexte : sans elle, une règle générée pour
la piste cœur exclut spontanément le vocabulaire de la piste exploratoire — et l'IA
détruit silencieusement la stratégie d'ouverture qu'elle vient d'aider à construire.

---

## 3. Revue de portefeuille — recouvrement et angles morts

`buildPortfolioReviewPrompt(alerts, metrics)`

### Métriques calculées **localement**

`portfolio-metrics.ts`, sur 30 jours glissants, sans aucune IA :

| Métrique | Définition |
|---|---|
| `total` | offres captées par la piste |
| `exclusive` | offres captées **uniquement** par cette piste |
| `readRate` | part des offres lues |
| `kanbanRate` | part des offres importées dans le Kanban |
| `quickArchiveRate` | part archivées sans avoir été ouvertes |
| `medianScore` | score médian de la piste |
| `overlaps` | par paire : `shared / MIN(total_a, total_b)` |

Le recouvrement est affiché **avant** toute sollicitation de l'IA (FR-045) : deux pistes
au-delà de 60 % déclenchent un avertissement immédiat. L'IA sert à interpréter et à
proposer, pas à calculer.

### Texte

```text
Agis comme un analyste de stratégie de recherche d'emploi. Tu évalues la SANTÉ D'UN
PORTEFEUILLE de pistes de veille, pas la qualité d'offres individuelles.

# PORTEFEUILLE ACTUEL
{{#each alerts}}
## {{name}} ({{kind}})
- Titres visés : {{jobTitles}}
- Exclusions : {{excludeTitles}}
- Compétences : {{skills}} | Secteurs : {{domains}}
- Localisation : {{location.label}} ({{location.radiusKm}} km) | Contrats : {{contractTypes}}
- Sources : {{sources}}
{{/each}}

# MÉTRIQUES SUR 30 JOURS
{{#each metrics.perAlert}}
- {{name}} : {{total}} offres ({{exclusive}} exclusives) | lues {{readRate}}% |
  importées Kanban {{kanbanRate}}% | archivées sans lecture {{quickArchiveRate}}% |
  score médian {{medianScore}}
{{/each}}

# RECOUVREMENT ENTRE PISTES
{{#each metrics.overlaps}}- {{alertA}} ↔ {{alertB}} : {{sharedPercent}}% d'offres communes{{/each}}

# CE QUE TU DOIS PRODUIRE
1. `overlaps` : pour chaque paire dont le recouvrement dépasse 40 %, dis laquelle des
   deux pistes est redondante et ce qu'il faut modifier pour les différencier.
2. `perAlert` : un verdict par piste — "keep", "tune", "merge" ou "drop" — avec sa
   justification et, si applicable, les changements concrets suggérés.
3. `blindSpots` : les angles que ce portefeuille ne couvre pas et qui seraient
   plausibles au vu des pistes existantes. Sois concret et justifie chaque angle.

# GRILLE DE LECTURE
- Volume élevé + taux d'import Kanban nul = la piste produit du bruit, pas des
  opportunités. Elle doit être resserrée, pas élargie.
- Volume faible + taux d'import élevé = piste précise et efficace. Ne la dilue pas ;
  envisage plutôt d'élargir ses sources.
- Taux d'archivage sans lecture élevé = le titre des offres ne correspond pas à
  l'intention. Le problème est dans les `jobTitles`, pas dans le scoring.
- Peu d'offres exclusives = la piste n'apporte rien que les autres n'apportent déjà.
- Une piste "exploratory" a le droit d'avoir un taux de conversion faible : c'est sa
  fonction. Ne recommande jamais de la supprimer sur ce seul critère.

Réponds UNIQUEMENT par le JSON conforme au schéma ci-dessous.

# SCHÉMA DE SORTIE
{{JSON_SCHEMA}}
```

### Application des recommandations

Affichées, jamais appliquées automatiquement (FR-046). Une suggestion dont les
`suggestedChanges` sont structurés (ajout / retrait de termes, changement de sources)
propose un bouton d'application individuelle ; les suggestions en texte libre restent
informatives.

---

## 4. Prompts Santé scopés

`generateDiagnosticPrompt(alert, recentOffers)` et
`generatePerformanceOptimizationPrompt(profile, entries, alert, metrics)` : structure
inchangée, mais le bloc « Ma configuration actuelle » décrit **l'alerte sélectionnée**
et le prompt s'ouvre par un rappel de contexte :

```text
Cette analyse porte sur UNE piste d'un portefeuille de {{n}} pistes.
Les autres pistes couvrent : {{résumé des autres pistes}}.
Ne recommande pas d'élargir cette piste vers un domaine déjà couvert par une autre.
```

Sans cette précaution, chaque diagnostic pousse mécaniquement sa piste vers le centre —
et au bout de trois optimisations, les quatre pistes convergent vers la même recherche.
Le mode portefeuille du tableau de bord Santé bascule sur la revue du §3.
