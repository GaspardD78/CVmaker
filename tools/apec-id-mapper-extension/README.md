# APEC ID Mapper

Petite extension Chrome (Manifest V3) + tutoriel manuel pour cartographier les
identifiants internes que l'APEC utilise dans son API non-documentée
`POST /cms/webservices/rechercheOffre`.

L'API attend des **IDs entiers opaques** dans des champs comme `lieux`,
`fonctions`, `secteursActivite` ou `niveauxExperience`. Sans ces IDs, le filtre
côté serveur est ignoré silencieusement (c'est ce qui fait remonter des offres
de Lyon ou Lille quand on a coché « Paris » dans le profil de veille). Le but
est de récolter les bons IDs pour pouvoir les pousser à l'API depuis le parser
`resume-forge/src/lib/watcher/parsers/apec.ts`.

## Pourquoi ces IDs ne sont-ils pas publiés ?

L'API `rechercheOffre` est une API **interne** alimentant directement le site
public APEC. Elle n'est pas documentée et son schéma évolue sans préavis. Les
IDs sont stables dans le temps (`711` pour le département 75 par exemple),
mais leur signification est implicite — il faut les déduire en observant ce
que le frontend envoie quand on coche un filtre dans l'UI.

---

## Méthode rapide — extension Chrome (recommandée)

1. **Charger l'extension non packagée**
   - Ouvre `chrome://extensions` (ou `edge://extensions`, `brave://extensions`).
   - Active **Mode développeur** (toggle en haut à droite).
   - Clique **Charger l'extension non empaquetée** et sélectionne ce dossier
     `tools/apec-id-mapper-extension/`.
   - L'icône APEC ID Mapper apparaît dans la barre d'extensions.

2. **Capturer les IDs**
   - Va sur <https://cadres.apec.fr/home/mes-offres/recherche-des-offres-demploi.html>.
   - Coche un filtre (par exemple **Lieux → Paris**, ou **Fonctions → Études, R&D**).
     Le frontend appelle `rechercheOffre` ; l'extension intercepte le body
     POST et en extrait les IDs.
   - Répète l'opération pour chaque département / fonction / secteur que tu
     veux cartographier. **Coche-les un par un** : si tu en coches plusieurs
     d'un coup, tu auras la liste mais pas l'association libellé ↔ ID.

3. **Récupérer le mapping**
   - Clique sur l'icône de l'extension : tu vois la liste des IDs collectés
     par catégorie, triés par fréquence d'apparition.
   - **Copier en TypeScript** → texte prêt à coller dans le code, format
     `Record<string, number[]>`.
   - **Copier en JSON** → format brut pour archivage.

4. **Reconstituer le mapping libellé ↔ ID**
   - L'extension capture les IDs mais pas les libellés affichés à l'écran
     (les filtres APEC sont rendus côté serveur, l'association est implicite).
   - **Astuce** : coche **un seul** filtre, regarde l'extension, note
     l'ID qui apparaît, puis associe-le au libellé que tu venais de cocher
     dans l'UI APEC. Décocher avant de passer au suivant.
   - Documenter le mapping dans un commentaire au-dessus de
     `CITY_TO_DEPT` (ou créer un nouveau dictionnaire `APEC_LIEUX_BY_DEPT`)
     dans `parsers/apec.ts`.

5. **(Optionnel) Brancher le mapping dans le parser**
   - Une fois la table `dept (75) → APEC ID (711)` complète pour les
     départements importants, modifier `parseApec` pour pousser
     `lieux: [APEC_LIEUX_BY_DEPT[d]]` au lieu d'envoyer un tableau vide.
   - Garder le post-filter client en filet de sécurité pour les départements
     non encore cartographiés.

---

## Méthode manuelle — sans extension (DevTools natif)

Si tu n'installes pas l'extension, la même information est accessible via
l'inspecteur réseau de Chrome.

1. Ouvre <https://cadres.apec.fr/home/mes-offres/recherche-des-offres-demploi.html>.
2. **F12** → onglet **Network**.
3. Filtre la liste sur `rechercheOffre` (champ « Filter »).
4. Coche un département (ex. Paris) dans la barre latérale gauche.
5. Une nouvelle requête POST `rechercheOffre` apparaît : sélectionne-la.
6. Onglet **Payload** (Chrome) ou **Request** (Firefox) → tu vois le JSON :
   ```json
   {
     "motsCles": "",
     "lieux": [711],
     "fonctions": [],
     ...
     "typeClient": "CADRE"
   }
   ```
7. Note l'ID (`711` ici) et le libellé du filtre que tu venais de cocher.
8. Décoche, coche le suivant, recommence.

---

## Schéma technique de l'extension

```
┌────────────────────┐       window.postMessage      ┌────────────────────┐
│   injected.js      │ ────────────────────────────► │   content.js       │
│ (main world,       │   { url, body, response }     │ (isolated world,   │
│  intercepte fetch) │                               │  bridge messages)  │
└────────────────────┘                               └─────────┬──────────┘
                                                               │
                                                  chrome.runtime.sendMessage
                                                               ▼
                                          ┌────────────────────────────────┐
                                          │   background.js (SW)           │
                                          │   parse body → agrège les IDs  │
                                          │   → chrome.storage.local       │
                                          └─────────┬──────────────────────┘
                                                    │ chrome.storage.onChanged
                                                    ▼
                                          ┌────────────────────────────────┐
                                          │   popup.html / popup.js        │
                                          │   rendu live + export TS/JSON  │
                                          └────────────────────────────────┘
```

Le content script tourne dans un *isolated world* qui voit le DOM mais pas
les variables JS de la page. Pour wrappper `fetch` / `XMLHttpRequest` (qui
appartiennent à la page), on injecte `injected.js` via une balise `<script>`
exposée en `web_accessible_resources`. Les messages remontent via
`window.postMessage` puis `chrome.runtime`.

---

## Limitations connues

- L'extension **ne capture pas** les libellés des filtres (le frontend APEC
  ne les passe pas dans la requête JSON). L'association libellé ↔ ID se fait
  manuellement en suivant la procédure ci-dessus.
- L'extension **ne fait pas** de requêtes vers APEC : elle observe
  uniquement les requêtes que l'utilisateur déclenche en cliquant.
- Si APEC change sa route (`/cms/webservices/rechercheOffre`), il faudra
  mettre à jour la regex `APEC_API_RE` dans `injected.js`.
- L'extension ne fonctionne que sur `apec.fr` et `cadres.apec.fr` (déclaré
  dans `host_permissions`). Pas d'accès aux autres sites.

---

## Mapping connu

La source de vérité vit dans `resume-forge/src/lib/watcher/parsers/apec-ids.ts`.
Toute capture validée doit y être ajoutée — pas dans ce README, qui n'est
qu'un récapitulatif humain.

### Lieux

Bonne nouvelle : pour les **départements**, l'ID APEC est simplement le code
département en entier (et non un ID opaque comme on le craignait initialement).
Le piège était le typage : `["75"]` (string) est silencieusement ignoré
côté API ; il faut envoyer `[75]` (number).

| Code dept | Libellé          | ID APEC (`lieux`) |
|-----------|------------------|-------------------|
| `75`      | Paris            | `75`              |
| `77`      | Seine-et-Marne   | `77`              |
| `78`      | Yvelines         | `78`              |
| `92`      | Hauts-de-Seine   | `92`              |
| `95`      | Val-d'Oise       | `95`              |

Régions (utiles pour pousser un filtre large) :

| Libellé         | ID APEC (`lieux`) |
|-----------------|-------------------|
| Île-de-France   | `711`             |
| France entière  | `799`             |

### Types de contrat

⚠ Les codes `Intérim` et `Alternance` étaient **faux** dans la première
version du parser (copiés à vue depuis l'UI sans validation). Capture
réelle :

| Libellé    | ID APEC | Ancien code (faux) |
|------------|---------|--------------------|
| CDI        | `101888` | —                  |
| CDD        | `101887` | —                  |
| Intérim    | `101930` | `101886` ❌        |
| Alternance | `20053`  | `101884` ❌        |

### Fonctions (extrait — domaine RH)

| Libellé                                 | ID APEC |
|------------------------------------------|---------|
| Ressources Humaines (catégorie)          | `101818` |
| Administration RH                        | `101817` |
| Direction RH                             | `101819` |
| Développement RH                         | `101835` |
| Chargé de recrutement                    | `600120` |
| Responsable recrutement                  | `600121` |
| Responsable gestion de carrières         | `600125` |
| Conseiller en insertion pro              | `600123` |

### Niveaux d'expérience

| Libellé           | ID APEC |
|-------------------|---------|
| Débutant          | `101881` |
| 3 à 5 ans         | `20043`  |
| 6 à 9 ans         | `20044`  |
| 10 ans et plus    | `20045`  |

### Types de convention

| Libellé                  | ID APEC |
|--------------------------|---------|
| Entreprise               | `143684` |
| Cabinet de recrutement   | `143685` |
| Agence d'emploi          | `143686` |
| ESN/SSII                 | `143687` |
| Partenaire               | `143706` |

Quand tu cartographies un nouvel ID via l'extension, ajoute-le dans
`apec-ids.ts` avec son libellé et mets à jour les tableaux ci-dessus dans
la même PR.

---

## Confidentialité

L'extension :
- Ne contacte aucun serveur externe.
- Ne lit que les requêtes vers `apec.fr/cms/webservices/rechercheOffre`.
- Stocke ses captures uniquement dans `chrome.storage.local` (machine locale).
- Aucune donnée personnelle n'est extraite (pas de cookies, pas de tokens) ;
  l'extension ne s'intéresse qu'aux IDs entiers des filtres.

Pour purger les captures : ouvre la popup → bouton **Effacer**, ou désinstalle
l'extension.
