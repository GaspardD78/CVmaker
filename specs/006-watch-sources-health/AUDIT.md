# Audit 006 - sources APEC et Emploi Territorial

## Ce qui a pu être vérifié, et ce qui ne l'a pas été

L'environnement de travail passe par un proxy qui **bloque `apec.fr` et `emploi-territorial.fr`** (`CONNECT tunnel failed, response 403`, aussi via `curl` et `WebFetch`). Aucun test réseau réel n'a donc été exécuté par l'auteur du correctif. Les résultats ci-dessous sont ceux **rapportés par l'utilisateur depuis une autre IP** ; le comportement des correctifs face aux vrais sites reste à confirmer sur la machine de l'utilisateur.

## APEC

| Essai | En-têtes | Résultat |
|---|---|---|
| POST `rechercheOffre` direct (état initial du code) | `User-Agent` navigateur, `Content-Type`, `Accept`, `Accept-Language`, `Referer`, `Origin` | **403** (rapporté, autre IP, aussi avec UA navigateur) |
| GET page de recherche puis POST avec cookies de session (nouveau code, `fetch_apec_api`) | mêmes en-têtes + `Cookie` issu des `Set-Cookie` de la page | **non testé ici** ; script de sonde de l'utilisateur : `apec-diag.ts` à la racine |

Décision : le code reproduit un usage de navigateur ordinaire (une page ouverte, ses cookies, puis l'appel) et s'arrête là : pas de rotation d'IP, pas de résolution de captcha, pas d'empreinte TLS imitée. Si le 403 persiste, la source passe `bloquee` avec le message « APEC refuse les requêtes automatiques. Créez une alerte e-mail APEC en attendant. » et n'est plus interrogée pendant 24 h (`job_watch_source_cooldown`). Un succès efface la pause.

## Emploi Territorial

| Essai | Résultat (rapporté) |
|---|---|
| `/rss/offres-emploi.rss` sans UA navigateur | **404** |
| même URL avec UA navigateur | **200** + page HTML « Request Rejected » (pare-feu applicatif) |
| flux filtré (`?q=...&lieu=...`) | 404 (logs de l'utilisateur) |
| API officielle `https://www.emploi-territorial.fr/api/` | **documentation inaccessible** depuis l'environnement ; clé, endpoints et quotas inconnus |

Décision : pas de migration vers l'API (aucune base vérifiable pour écrire un parser ; l'inventer serait pire que le statut honnête). La page « Request Rejected » est reconnue (`bloquee`), n'est jamais comptée comme 0 offre, le repli sur le flux global n'est plus tenté quand le site bloque (ni annoncé quand il échoue), la source est mise en pause 24 h, n'est plus proposée par l'assistant de configuration, et son ajout manuel demande confirmation. À reprendre : lire la page API depuis un poste qui y accède, puis écrire le parser (clé gratuite à saisir dans les Paramètres si nécessaire).

## Indeed et HelloWork

Les parsers existent ; « Non configurée » signifie seulement que la source n'a pas été ajoutée à la piste (aucune clé requise). Elles passent par le navigateur intégré derrière un contrôle anti-robot : si une page de challenge est renvoyée, la collecte s'arrête en `bloquee`. Aucun contournement n'est tenté.
