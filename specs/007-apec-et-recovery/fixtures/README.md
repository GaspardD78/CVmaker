# Fixtures 007

## Choisir le service public (HTML)

Les fichiers `*-synthetic.html` de `src/lib/watcher/parsers/__fixtures__/` sont **reconstitués** à partir des constats de la spec, pas capturés : ils prouvent la logique, pas la structure réelle du site.

Depuis une machine ordinaire (le bac à sable de développement n'a pas accès au site) :

```
bun run tools/capture-csp-fixtures.ts "chargé de recrutement"
```

Le script (UA honnête, 1 requête/s, aucun contournement) écrit `csp-list.html`, `csp-offer-et.html`, `csp-offer-pep.html` dans `__fixtures__/`. Les tests les préfèrent automatiquement aux fixtures synthétiques. Si `parseCspList` ne trouve plus d'offres sur la capture réelle, ajuster `csp-html.ts` (la liste est le point non vérifié).

## E-mails d'alerte (`.eml`)

À déposer ici : au moins un e-mail d'alerte APEC et un e-mail d'alerte Emploi Territorial **réels** (`.eml` complets). **Retirez avant de les déposer** toute donnée personnelle (nom, adresse, jeton de désabonnement). Aucun parseur n'est écrit tant qu'ils ne sont pas là, et aucun faux e-mail n'est fabriqué.
