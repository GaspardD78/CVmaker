# Spec 007 - Récupérer APEC et Emploi Territorial par des canaux ouverts

Chemins relatifs à `resume-forge/`. Branche : `claude/relaxed-knuth-fcb5ap`.

## Règle non négociable

Aucun contournement de protection anti-robot : pas de captcha résolu, pas de navigateur automatisé, pas d'empreinte usurpée, pas de rotation d'IP. Canaux ouverts, ou l'utilisateur lui-même.

## Canaux

| # | Canal | Automatique | État |
|---|---|---|---|
| 1 | Emploi Territorial via « Choisir le service public » (CSP) | oui | **livré (phases 1-2)** ; fixtures réelles à capturer |
| 2 | Alertes e-mail APEC et Emploi Territorial (IMAP lecture seule) | oui, après configuration | **structure prête** (phase 3) ; parseurs en attente de `.eml` |
| 3 | Import assisté APEC (webview, l'utilisateur navigue) | non | à faire (phase 4) |

APEC (DataDome) et le flux RSS d'Emploi Territorial (pare-feu applicatif) restent fermés ; l'API officielle d'Emploi Territorial n'a pas d'endpoint de recherche (voir `specs/006-watch-sources-health/AUDIT.md`).

## CSP : constats et décisions

Constats rapportés par l'utilisateur, **confirmés par captures réelles** (`parsers/__fixtures__/`) : robots.txt n'interdit que `/wp-admin/` et `/wp-content/uploads/pdf-offers/` ; UA honnête accepté ; recherche `…/nos-offres/filtres/mot-cles/<mots>/` ; mot-clé en premier ; `page/<n>/` ; chemin des offres `/offre-emploi/` ; 20 offres par page, page de ~4,5 Mo.

Corrections issues des captures réelles :

| Constat réel | Décision |
|---|---|
| Le filtre d'URL `versant/<id>/` est **ignoré** (mêmes offres avec ou sans) | segment retiré ; versant filtré côté client d'après « Fonction publique : … » de la carte (puis de la page d'offre) |
| `localisation/<id>/` fonctionne avec un **identifiant interne** (Yvelines 289, Île-de-France 208), pas le code département | table `parsers/data/csp-localisations.json` (335 lieux) ; `csp-locations.ts` : un département si le rayon ≤ 40 km, sinon la ou les régions (≤ 2 recherches par intitulé) ; post-filtre client conservé |
| `datePosted` en `jj/mm/aaaa` | `parseCspDate` : minuit UTC, sans décalage de fuseau ; ISO en repli |
| Lien Emploi Territorial parfois en clair dans le texte, avec `?pk_campaign=ep` | `findOriginalUrl` lit `href` et texte, retire requête et ancre |
| Références avec tiret bas (`DEF_15-00064919`) | acceptées dans l'adresse ; champ « Référence : » lu en priorité |
| « Fonction publique : … » sur chaque page | source de l'origine et du versant (Territoriale → Emploi Territorial ; État / Hospitalière → Place de l'emploi public) ; référence `O0…` et lien en confirmation seulement |
| `hiringOrganization` est une catégorie pour le territorial (« Conseils départementaux ») | employeur = suffixe du titre (« … - CONSEIL DÉPARTEMENTAL DU MORBIHAN ») pour le territorial ; sinon l'employeur affiché |
| JSON-LD non schema.org strict (`Description`, lieu « Morbihan (56), France ») | lu tel quel ; « , France » retiré |
| Une même annonce sous deux références | `offer-dedup` regroupe (source, employeur, titre, lieu) et garde la plus récente (`publishedAt`, `fetchedAt` en repli) |
| Liste de 4,5 Mo | fixture réduite à `<title>` + cartes (~65 Ko) par `reduceCspList` ; capture complète ignorée par git (`*.full.html`) ; l'équivalence est testée quand elle est présente et vérifiée par le script de capture |

Décisions inchangées : parseur sans DOM ; offre de base conservée si l'enrichissement échoue ; un 403 arrête les enrichissements ; offres connues revues renvoyées sans requête ; page non reconnue = `reponse_invalide` ; catégorie `Toutes` ou `A` seulement (`A+` non vérifié) ; pause 6 h après 403/429.

Non vérifié : le filtre `categorie/<id>/` (1805 = A) n'a pas été testé sur le site ; poids de page non réduit (pas d'endpoint plus léger identifié).

## Données

Migration 022 (`src-tauri/migrations/022_offer_origin.sql`, repli `db.ts`), additive : `job_offers.origin`, `job_offers.reference` (+ index).

## Phases

Voir `tasks.md`.
