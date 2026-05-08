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
  '95': 95, // Val-d'Oise
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

// ── Fonctions ────────────────────────────────────────────────────────────────

/**
 * Mapping libellé → ID APEC `fonctions`. Permettra à terme de remplacer la
 * recherche par `motsCles` (qui matche titre + description et génère du bruit)
 * par un filtre `fonctions` exact côté API.
 *
 * À étendre au fur et à mesure des captures via l'extension.
 */
export const APEC_FONCTIONS: Record<string, number> = {
  // Ressources Humaines
  'Ressources Humaines':                101818,
  'Administration RH':                  101817,
  'Direction RH':                       101819,
  'Développement RH':                   101835,

  // Spécialisations RH (sous-fonctions de Développement RH)
  'Chargé de recrutement':              600120,
  'Responsable recrutement':            600121,
  'Responsable gestion de carrières':   600125,
  'Conseiller en insertion pro':        600123,
};
