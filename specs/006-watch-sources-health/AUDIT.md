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

Spec OpenAPI officielle v5.3 (source : https://www.emploi-territorial.fr/api/emploi-territorial.yml), copiée dans `specs/006-watch-sources-health/emploi-territorial-openapi-v5.3.yml` et relue dans ce dépôt.

Constats vérifiés dans le fichier :

- **Authentification obligatoire partout** : `security: tokenHeader` global, `apiKey` dans l'en-tête `X-API-Key`, « token d'authentification transmis par le support GIPCDG » ; la description générale renvoie au GIP Informatique des CDG pour l'accès.
- **Aucun endpoint de recherche des offres publiées** : `/col/listoffres` ne renvoie que « les offres de la collectivité authentifiée » ; `/stats/offres` ne renvoie que des comptages (« nombre d'offres actuellement publiées par département, région, métier et/ou grade »). Les autres chemins sont des référentiels, des fiches collectivité/CDG, des demandeurs et des statistiques.
- **Qui obtient un token** : le fichier dit seulement que le support du GIP le délivre ; la réservation aux collectivités, CDG et partenaires conventionnés, et l'absence de token pour un demandeur d'emploi, viennent du constat de l'utilisateur et ne sont pas écrites dans la spec.

| Essai (rapporté, autre IP) | Résultat |
|---|---|
| `/rss/offres-emploi.rss` sans UA navigateur | **404** |
| même URL avec UA navigateur | **200** + page « Request Rejected » (pare-feu applicatif) |
| flux filtré (`?q=...&lieu=...`) | 404 (logs de l'utilisateur) |

**Décision finale** : l'API ne peut pas servir de source d'offres pour ResumeForge ; aucun parser API n'est écrit. Emploi Territorial est une source **indisponible** pour toutes les pistes :

- migration 022 : `enabled = 0` pour `emploi_territorial` dans `job_watch_config`, sans supprimer la configuration (URL de flux et rattachement conservés) ;
- `UNAVAILABLE_SOURCES` (`source-status.ts`) : statut « Indisponible » dans le tableau des collectes avec le message « Emploi Territorial bloque les accès automatiques et son API est réservée aux collectivités. Créez une alerte e-mail sur emploi-territorial.fr. », même si le dernier journal dit autre chose ;
- le collecteur ne l'interroge jamais, même si une configuration est réactivée à la main ; l'assistant de configuration et la liste d'ajout ne la proposent plus ;
- le parser RSS et sa détection de page de pare-feu sont conservés : retirer l'entrée de `UNAVAILABLE_SOURCES` (et réactiver les configurations) suffit si le flux revient.

À suivre (hors périmètre) : une ingestion générique des alertes e-mail (APEC, Emploi Territorial) couvrirait les deux sources bloquées sans contournement.

## Indeed et HelloWork

Les parsers existent ; « Non configurée » signifie seulement que la source n'a pas été ajoutée à la piste (aucune clé requise). Elles passent par le navigateur intégré derrière un contrôle anti-robot : si une page de challenge est renvoyée, la collecte s'arrête en `bloquee`. Aucun contournement n'est tenté.
