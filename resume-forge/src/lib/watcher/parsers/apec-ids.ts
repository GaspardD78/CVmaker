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

// ── Secteurs ───────────────────────────────────────────────────────────────────

export const APEC_SECTEURS: Record<string, number> = {
  'Commercial, Marketing': 100001,
  'Communication, Création': 100002,
  'Direction d\'entreprise': 100003,
  'Finance, Audit': 100004,
  'Fonctions supports': 100005,
  'Informatique, Télécom': 100006,
  'Ingénierie, Etudes R&D': 100007,
  'Juridique': 100008,
  'Production, Logistique': 100009,
  'Ressources Humaines': 100010,
};

// ── Télétravail ────────────────────────────────────────────────────────────────

export const APEC_TELETRAVAIL: Record<string, number> = {
  'Télétravail ponctuel autorisé': 101950,
  'Télétravail régulier': 101951,
  '100% télétravail': 101952,
};

// ── Salaires ───────────────────────────────────────────────────────────────────

export const APEC_SALAIRES: Record<string, number> = {
  'Moins de 40k€': 20001,
  '40-50k€': 20002,
  '50-70k€': 20003,
  '70k€ et plus': 20004,
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
    label: 'Commercial, commerce, ventes',
    id: 101801,
    children: [
      { label: 'Chef de vente', id: 600010 },
      { label: 'Commercial sédentaire', id: 600011 },
      { label: 'Responsable grands comptes', id: 600012 },
    ],
  },
  {
    label: 'Marketing, stratégie clients et produits',
    id: 101802,
    children: [
      { label: 'Chef de produit', id: 600020 },
      { label: 'Chef de marché', id: 600021 },
      { label: 'Directeur marketing', id: 600022 },
    ],
  },
  {
    label: 'Communication, création et culture',
    id: 101803,
    children: [
      { label: 'Chargé de communication', id: 600030 },
      { label: 'Chef de pub', id: 600031 },
      { label: 'Responsable événementiel', id: 600032 },
    ],
  },
  {
    label: 'Direction générale, adjoint de direction',
    id: 101804,
    children: [
      { label: 'Directeur général', id: 600040 },
      { label: 'Adjoint de direction', id: 600041 },
      { label: 'Directeur de centre de profit', id: 600042 },
    ],
  },
  {
    label: 'Ingénierie, études, R&D',
    id: 101805,
    children: [
      { label: 'Ingénieur études', id: 600050 },
      { label: 'Chef de projet R&D', id: 600051 },
      { label: 'Ingénieur qualité', id: 600052 },
    ],
  },
  {
    label: 'Finance, comptabilité et gestion',
    id: 101806,
    children: [
      { label: 'Contrôleur de gestion', id: 600060 },
      { label: 'Directeur financier', id: 600061 },
      { label: 'Comptable', id: 600062 },
    ],
  },
  {
    label: 'Administratif, organisation et juridique',
    id: 101807,
    children: [
      { label: 'Assistant de direction', id: 600070 },
      { label: 'Juriste d\'entreprise', id: 600071 },
      { label: 'Responsable achat', id: 600072 },
    ],
  },
  {
    label: 'Informatique et systèmes d\'information',
    id: 101808,
    children: [
      { label: 'Développeur', id: 600080 },
      { label: 'Chef de projet IT', id: 600081 },
      { label: 'Administrateur systèmes', id: 600082 },
      { label: 'Data scientist', id: 600083 },
    ],
  },
  {
    label: 'Production industrielle et maintenance',
    id: 101809,
    children: [
      { label: 'Chef d\'atelier', id: 600090 },
      { label: 'Ingénieur production', id: 600091 },
      { label: 'Responsable maintenance', id: 600092 },
    ],
  },
  {
    label: 'Travaux et chantier',
    id: 101810,
    children: [
      { label: 'Chef de chantier', id: 600100 },
      { label: 'Conducteur de travaux', id: 600101 },
      { label: 'Métreur', id: 600102 },
    ],
  },
  {
    label: 'Ressources Humaines',
    id: 101818,
    children: [
      { label: 'Administration RH', id: 101817 },
      { label: 'Direction RH', id: 101819 },
      { label: 'Développement RH', id: 101835 },
      { label: 'Chargé de recrutement', id: 600120 },
      { label: 'Responsable recrutement', id: 600121 },
      { label: 'Responsable gestion de carrières', id: 600125 },
      { label: 'Conseiller en insertion pro', id: 600123 },
    ],
  },
  {
    label: 'Santé, social et médico-social',
    id: 101811,
    children: [
      { label: 'Cadre de santé', id: 600110 },
      { label: 'Directeur d\'établissement social', id: 600111 },
      { label: 'Psychologue', id: 600112 },
    ],
  },
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
