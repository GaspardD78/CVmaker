/**
 * Identifiants internes APEC capturés via l'extension Chrome
 * `tools/apec-id-mapper-extension/` ou par inspection DevTools du frontend
 * cadres.apec.fr.
 *
 * Ces IDs sont **opaques** côté API : APEC ne publie aucune table de
 * référence. La compatibilité avec l'API `rechercheOffre` impose d'envoyer
 * des entiers exacts ; un code département standard en string (`"75"`) est
 * silencieusement ignoré.
 *
 * Stabilité observée : les IDs sont stables dans le temps (capture initiale
 * mai 2026). Quand on en ajoute, recapturer dans la même session pour
 * vérifier qu'ils n'ont pas bougé.
 *
 * Pour étendre cette table : voir `tools/apec-id-mapper-extension/README.md`.
 */

// ── Lieux ────────────────────────────────────────────────────────────────────

/**
 * Codes département (`departmentCodes` du SearchProfile, ex. `"75"`) → ID APEC.
 *
 * **Bonne nouvelle** : pour les départements, l'ID APEC est simplement le code
 * département en entier. La table existe surtout pour formaliser la liste
 * connue, vérifier l'existence avant envoi à l'API et documenter les régions.
 */
export const APEC_LIEUX_BY_DEPT_CODE: Record<string, number> = {
  "13": 13,
  "24": 24,
  "31": 31,
  "33": 33,
  "34": 34,
  "35": 35,
  "38": 38,
  "42": 42,
  "44": 44,
  "59": 59,
  "64": 64,
  "65": 65,
  "66": 66,
  "67": 67,
  "69": 69,
  "73": 73,
  "74": 74,
  "75": 75,
  "76": 76,
  "77": 77,
  "78": 78,
  "87": 87,
  "91": 91,
  "92": 92,
  "93": 93,
  "94": 94,
  "95": 95,
  "06": 6
};

/**
 * IDs des **régions** APEC (utiles pour pousser un filtre large à l'API
 * quand l'utilisateur cible toute une région et non un département précis).
 */
export const APEC_REGIONS: Record<string, number> = {
  "Île-de-France": 711,
  "France": 799,
  "Auvergne-Rhône-Alpes": 712,
  "Occitanie": 713,
  "Nouvelle-Aquitaine": 714
};

/**
 * Convertit un code département (`"75"`) en ID APEC entier. Renvoie `undefined`
 * si le département n'est pas (encore) dans la table — auquel cas le parser
 * appliquera son post-filter client comme filet de sécurité.
 */
export function apecLieuFromDeptCode(code: string): number | undefined {
  return APEC_LIEUX_BY_DEPT_CODE[code.trim()];
}

// ── Types de contrat ─────────────────────────────────────────────────────────

/**
 * Mapping libellé profil → ID APEC `typesContrat`.
 *
 * ⚠ Les codes Intérim et Alternance ont été corrigés par rapport à la version
 * précédente du parser (qui utilisait des IDs erronés copiés à vue,
 * `101886` / `101884`). Avec les bons codes, le filtre serveur fonctionne
 * désormais.
 */
export const APEC_TYPES_CONTRAT: Record<string, number> = {
  "CDI": 101888,
  "CDD": 101887,
  "Alternance": 20053,
  "Intérim": 101930
};

/** Inverse : ID APEC → libellé canonique. */
export const APEC_TYPES_CONTRAT_LABEL: Record<number, string> = Object.fromEntries(
  Object.entries(APEC_TYPES_CONTRAT).map(([k, v]) => [v, k]),
);

// ── Niveaux d'expérience ─────────────────────────────────────────────────────

/**
 * Mapping libellés APEC → IDs `niveauxExperience`. Pour l'instant non utilisé
 * par le parser (le SearchProfile n'a pas encore de champ "expérience"), mais
 * tabulé dès maintenant pour usage futur.
 */
export const APEC_NIVEAUX_EXPERIENCE: Record<string, number> = {
  "Débutant": 101881,
  "3 à 5 ans": 20043,
  "6 à 9 ans": 20044,
  "10 ans et plus": 20045
};

// ── Types de convention ──────────────────────────────────────────────────────

/**
 * Mapping libellés APEC → IDs `typesConvention` (qui dépose l'offre :
 * entreprise directe, cabinet, agence, partenaire). Réservé pour usage futur.
 */
export const APEC_TYPES_CONVENTION: Record<string, number> = {
  "Entreprise": 143684,
  "Cabinet de recrutement": 143685,
  "Agence d'emploi": 143686,
  "ESN/SSII": 143687,
  "Partenaire": 143706
};

// ── Secteurs ─────────────────────────────────────────────────────────────────

export const APEC_SECTEURS: Record<string, number> = {
  "Commercial, Marketing": 100001,
  "Communication, Création": 100002,
  "Direction d'entreprise": 100003,
  "Finance, Audit": 100004,
  "Fonctions supports": 100005,
  "Informatique, Télécom": 100006,
  "Ingénierie, Etudes R&D": 100007,
  "Juridique": 100008,
  "Production, Logistique": 100009,
  "Ressources Humaines": 100010
};

// ── Télétravail ──────────────────────────────────────────────────────────────

export const APEC_TELETRAVAIL: Record<string, number> = {
  "Télétravail ponctuel autorisé": 101950,
  "Télétravail régulier": 101951,
  "100% télétravail": 101952
};

// ── Salaires ─────────────────────────────────────────────────────────────────

export const APEC_SALAIRES: Record<string, number> = {
  "Moins de 40k€": 20001,
  "40-50k€": 20002,
  "50-70k€": 20003,
  "70k€ et plus": 20004
};

// ── Fonctions (hiérarchie) ────────────────────────────────────────────────────

/**
 * Catégorie de fonction APEC avec ses sous-fonctions.
 * `id` = ID APEC de la catégorie parente (`null` = catégorie non encore capturée).
 */
export interface ApecFonctionCategory {
  label: string;
  id: number | null;
  children?: ApecFonctionCategory[];
}

/**
 * Hiérarchie des fonctions APEC groupée par domaine, destinée à l'UI multi-select.
 * Ces IDs correspondent au paramètre `fonctions` de `rechercheOffre`.
 *
 * Source de vérité : captures faites via `tools/apec-id-mapper-extension/`.
 * Les domaines marqués `id: null` n'ont pas encore d'ID parent capturé —
 * seuls leurs enfants peuvent être envoyés à l'API.
 *
 * Pour étendre : capter l'ID via l'extension, ajouter ici ET mettre à jour
 * le README `tools/apec-id-mapper-extension/README.md`.
 */
export const APEC_FONCTIONS_HIERARCHY: ApecFonctionCategory[] = [
  {
    "id": 101801,
    "label": "Commercial, commerce, ventes",
    "children": [
      {
        "id": 600010,
        "label": "Chef de vente"
      },
      {
        "id": 600011,
        "label": "Commercial sédentaire"
      },
      {
        "id": 600012,
        "label": "Responsable grands comptes"
      }
    ]
  },
  {
    "id": 101802,
    "label": "Marketing, stratégie clients et produits",
    "children": [
      {
        "id": 600020,
        "label": "Chef de produit"
      },
      {
        "id": 600021,
        "label": "Chef de marché"
      },
      {
        "id": 600022,
        "label": "Directeur marketing"
      }
    ]
  },
  {
    "id": 101803,
    "label": "Communication, création et culture",
    "children": [
      {
        "id": 600030,
        "label": "Chargé de communication"
      },
      {
        "id": 600031,
        "label": "Chef de pub"
      },
      {
        "id": 600032,
        "label": "Responsable événementiel"
      }
    ]
  },
  {
    "id": 101804,
    "label": "Direction générale, adjoint de direction",
    "children": [
      {
        "id": 600040,
        "label": "Directeur général"
      },
      {
        "id": 600041,
        "label": "Adjoint de direction"
      },
      {
        "id": 600042,
        "label": "Directeur de centre de profit"
      }
    ]
  },
  {
    "id": 101805,
    "label": "Ingénierie, études, R&D",
    "children": [
      {
        "id": 600050,
        "label": "Ingénieur études"
      },
      {
        "id": 600051,
        "label": "Chef de projet R&D"
      },
      {
        "id": 600052,
        "label": "Ingénieur qualité"
      }
    ]
  },
  {
    "id": 101806,
    "label": "Finance, comptabilité et gestion",
    "children": [
      {
        "id": 600060,
        "label": "Contrôleur de gestion"
      },
      {
        "id": 600061,
        "label": "Directeur financier"
      },
      {
        "id": 600062,
        "label": "Comptable"
      }
    ]
  },
  {
    "id": 101807,
    "label": "Administratif, organisation et juridique",
    "children": [
      {
        "id": 600070,
        "label": "Assistant de direction"
      },
      {
        "id": 600071,
        "label": "Juriste d'entreprise"
      },
      {
        "id": 600072,
        "label": "Responsable achat"
      }
    ]
  },
  {
    "id": 101808,
    "label": "Informatique et systèmes d'information",
    "children": [
      {
        "id": 600080,
        "label": "Développeur"
      },
      {
        "id": 600081,
        "label": "Chef de projet IT"
      },
      {
        "id": 600082,
        "label": "Administrateur systèmes"
      },
      {
        "id": 600083,
        "label": "Data scientist"
      }
    ]
  },
  {
    "id": 101809,
    "label": "Production industrielle et maintenance",
    "children": [
      {
        "id": 600090,
        "label": "Chef d'atelier"
      },
      {
        "id": 600091,
        "label": "Ingénieur production"
      },
      {
        "id": 600092,
        "label": "Responsable maintenance"
      }
    ]
  },
  {
    "id": 101810,
    "label": "Travaux et chantier",
    "children": [
      {
        "id": 600100,
        "label": "Chef de chantier"
      },
      {
        "id": 600101,
        "label": "Conducteur de travaux"
      },
      {
        "id": 600102,
        "label": "Métreur"
      }
    ]
  },
  {
    "id": 101818,
    "label": "Ressources Humaines",
    "children": [
      {
        "id": 101817,
        "label": "Administration RH"
      },
      {
        "id": 101819,
        "label": "Direction RH"
      },
      {
        "id": 101835,
        "label": "Développement RH",
        "children": [
          {
            "id": 600120,
            "label": "Chargé de recrutement"
          },
          {
            "id": 600121,
            "label": "Responsable recrutement"
          },
          {
            "id": 600125,
            "label": "Responsable gestion de carrières"
          },
          {
            "id": 600123,
            "label": "Conseiller en insertion pro"
          }
        ]
      }
    ]
  },
  {
    "id": 101811,
    "label": "Santé, social et médico-social",
    "children": [
      {
        "id": 600110,
        "label": "Cadre de santé"
      },
      {
        "id": 600111,
        "label": "Directeur d'établissement social"
      },
      {
        "id": 600112,
        "label": "Psychologue"
      }
    ]
  }
];

/**
 * Mapping plat label → ID APEC dérivé de `APEC_FONCTIONS_HIERARCHY`.
 * Inclut les catégories parentes (quand leur ID est connu) ET les sous-fonctions.
 *
 * Utilisé par `profile-to-query.ts` pour convertir les libellés sélectionnés
 * dans l'UI en IDs numériques envoyés à l'API.
 */
export const APEC_FONCTIONS: Record<string, number> = {};

function flattenFonctions(node: ApecFonctionCategory) {
  if (node.id !== null && node.id !== undefined) {
    APEC_FONCTIONS[node.label] = node.id;
  }
  if (node.children) {
    for (const child of node.children) {
      flattenFonctions(child);
    }
  }
}

for (const cat of APEC_FONCTIONS_HIERARCHY) {
  flattenFonctions(cat);
}

/**
 * Liste de tous les libellés sélectionnables (catégories avec ID + sous-fonctions).
 * Utile pour valider les valeurs stockées dans `SearchProfile.apecFonctions`.
 */
export const APEC_FONCTIONS_ALL_LABELS: string[] = Object.keys(APEC_FONCTIONS);
