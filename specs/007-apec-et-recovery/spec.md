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

Constats rapportés par l'utilisateur (à reconfirmer sur la machine de l'utilisateur, voir `fixtures/README.md`) : robots.txt n'interdit que `/wp-admin/` et `/wp-content/uploads/pdf-offers/` ; UA honnête accepté (200) ; recherche `…/nos-offres/filtres/mot-cles/<mots>/` ; filtres `versant/<id>/` (2458 FPT, 2456 État, 2457 hospitalière), `categorie/<id>/` (1805 = A), `page/<n>/` ; mot-clé obligatoirement en premier ; 302 à suivre ; page de liste ~4,5 Mo, 20 offres.

| Décision | Raison |
|---|---|
| Parseur sans DOM (`parsers/csp-html.ts`) | testable sous bun, pas d'arbre DOM de 4,5 Mo en mémoire |
| Liste lue par les liens `/offre-emploi/`, JSON-LD `JobPosting` pour le détail | seule structure non vérifiable sur le site réel : la liste ; le JSON-LD suit schema.org |
| Offre de base conservée si l'enrichissement échoue ; un 403 arrête les enrichissements | pas de martèlement |
| Offres déjà connues revues dans une page : renvoyées sans requête | le pipeline les rattache aux autres pistes ; sinon une collecte sans nouveauté s'afficherait « Vide » |
| Page de résultats sans offre reconnue et sans « aucune offre » : `reponse_invalide` | jamais « 0 offre » sur un changement de structure |
| Catégorie : `Toutes` ou `A` seulement | `A+` = deux identifiants (4327-4328), syntaxe combinée non vérifiée ; pas de défaut « cadre » (aucun signal « cadre » dans le profil de recherche) |
| Lieu : post-filtre client (offre au lieu connu hors zone écartée, lieu inconnu conservé) | syntaxe de `localisation/` inconnue (renvoie 0 résultat) |
| Pause 6 h après 403/429 (`source-cooldown.ts`) | pas de nouvelle tentative immédiate |
| Poids de page non réduit (pas d'endpoint `admin-ajax.php` identifié) | non vérifiable sans accès au site ; 3 pages × 4,5 Mo au plus par intitulé |

## Données

Migration 022 (`src-tauri/migrations/022_offer_origin.sql`, repli `db.ts`), additive : `job_offers.origin`, `job_offers.reference` (+ index).

## Phases

Voir `tasks.md`.
