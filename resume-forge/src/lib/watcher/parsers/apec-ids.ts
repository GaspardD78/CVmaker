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
  '75': 75, // Paris
  '77': 77, // Seine-et-Marne
  '78': 78, // Yvelines
  '92': 92, // Hauts-de-Seine
  '93': 93, // Seine-Saint-Denis
  '94': 94, // Val-de-Marne
  '95': 95, // Val-d'Oise
  '91': 91, // Essonne
  '69': 69, // Rhône
  '13': 13, // Bouches-du-Rhône
  '33': 33, // Gironde
  '31': 31, // Haute-Garonne
  '59': 59, // Nord
  '67': 67, // Bas-Rhin
  '34': 34, // Hérault
  '44': 44, // Loire-Atlantique
  '06': 6,  // Alpes-Maritimes
  '35': 35, // Ille-et-Vilaine
  '38': 38, // Isère
  '76': 76, // Seine-Maritime
};

/**
 * IDs des **régions** APEC (utiles pour pousser un filtre large à l'API
 * quand l'utilisateur cible toute une région et non un département précis).
 */
export const APEC_REGIONS: Record<string, number> = {
  'Île-de-France': 711,
  France:          799,
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
  CDI:        101888,
  CDD:        101887,
  Intérim:    101930,
  Alternance: 20053,
  // Stage : non capturé pour l'instant — le parser tombera en silence côté API,
  // le post-filter client prendra le relais quand ce contrat sera demandé.
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
  'Débutant':       101881,
  '3 à 5 ans':      20043,
  '6 à 9 ans':      20044,
  '10 ans et plus': 20045,
};

// ── Types de convention ──────────────────────────────────────────────────────

/**
 * Mapping libellés APEC → IDs `typesConvention` (qui dépose l'offre :
 * entreprise directe, cabinet, agence, partenaire). Réservé pour usage futur.
 */
export const APEC_TYPES_CONVENTION: Record<string, number> = {
  Entreprise:                143684,
  'Cabinet de recrutement':  143685,
  "Agence d'emploi":         143686,
  'ESN/SSII':                143687,
  Partenaire:                143706,
};

// ── Fonctions (hiérarchie) ────────────────────────────────────────────────────

/**
 * Catégorie de fonction APEC avec ses sous-fonctions.
 * `id` = ID APEC de la catégorie parente (`null` = catégorie non encore capturée).
 */
export interface ApecFonctionCategory {
  label: string;
  id: number | null;
  children: Array<{ label: string; id: number }>;
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
    label: 'Ressources Humaines',
    id: 101818,
    children: [
      { label: 'Administration RH',                       id: 101817 },
      { label: 'Direction RH',                            id: 101819 },
      { label: 'Développement RH',                        id: 101835 },
      { label: 'Chargé de recrutement',                   id: 600120 },
      { label: 'Responsable recrutement',                 id: 600121 },
      { label: 'Responsable gestion de carrières',        id: 600125 },
      { label: 'Conseiller en insertion professionnelle', id: 600123 },
    ],
  },
  // ── À capturer via l'extension ──────────────────────────────────────────────
  // {
  //   label: 'Informatique / Télécommunications',
  //   id: null, // TODO: capturer via extension
  //   children: [
  //     // { label: 'Développement informatique', id: ??? },
  //     // { label: 'Infrastructure / Réseaux',   id: ??? },
  //   ],
  // },
  // {
  //   label: 'Finance / Comptabilité',
  //   id: null,
  //   children: [],
  // },
  // {
  //   label: 'Commercial / Ventes',
  //   id: null,
  //   children: [],
  // },
];

/**
 * Mapping plat label → ID APEC dérivé de `APEC_FONCTIONS_HIERARCHY`.
 * Inclut les catégories parentes (quand leur ID est connu) ET les sous-fonctions.
 *
 * Utilisé par `profile-to-query.ts` pour convertir les libellés sélectionnés
 * dans l'UI en IDs numériques envoyés à l'API.
 */
export const APEC_FONCTIONS: Record<string, number> = {};
for (const cat of APEC_FONCTIONS_HIERARCHY) {
  if (cat.id !== null) APEC_FONCTIONS[cat.label] = cat.id;
  for (const child of cat.children) APEC_FONCTIONS[child.label] = child.id;
}

/**
 * Liste de tous les libellés sélectionnables (catégories avec ID + sous-fonctions).
 * Utile pour valider les valeurs stockées dans `SearchProfile.apecFonctions`.
 */
export const APEC_FONCTIONS_ALL_LABELS: string[] = Object.keys(APEC_FONCTIONS);
