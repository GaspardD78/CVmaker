# Fixtures 007

## Choisir le service public (HTML)

Captures **réelles** dans `src/lib/watcher/parsers/__fixtures__/` : `csp-list.html` (liste réduite à son `<title>` et aux 20 cartes), `csp-offer-et.html` (offre territoriale, Morbihan), `csp-offer-pep.html` (offre de l'État, Défense). Les `*-synthetic.html` ne servent qu'aux tests de cas limites. `csp-localisations.json` (ici) est la table nom → identifiant interne des 335 lieux ; `src/lib/watcher/parsers/data/` en porte la copie utilisée par le code (un test vérifie qu'elles sont identiques).

Pour recapturer : `bun run tools/capture-csp-fixtures.ts "chargé de recrutement"` (UA honnête, 1 requête/s, aucun contournement). Le script écrit aussi `csp-list.full.html` (4,5 Mo, ignoré par git) et refuse d'écrire si la version réduite ne donne pas le même résultat.

## E-mails d'alerte (`.eml`)

À déposer ici : au moins un e-mail d'alerte APEC et un e-mail d'alerte Emploi Territorial **réels** (`.eml` complets). **Retirez avant de les déposer** toute donnée personnelle (nom, adresse, jeton de désabonnement). Aucun parseur n'est écrit tant qu'ils ne sont pas là, et aucun faux e-mail n'est fabriqué.
