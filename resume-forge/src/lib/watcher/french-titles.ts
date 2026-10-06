/**
 * Intitulés exploitables par les sources francophones (spec 006, phase 4).
 *
 * France Travail et Emploi Territorial indexent des annonces rédigées en
 * français : y envoyer « Talent Acquisition Specialist » entre guillemets ne
 * ramène rien et fait croire que la source est vide. On n'interroge donc ces
 * sources qu'avec les intitulés français de la piste. Quand il n'y en a aucun,
 * la source est signalée `intitules_inadaptes` plutôt que « 0 offre ».
 *
 * Détection volontairement simple et déterministe (aucun appel réseau) :
 * un intitulé est écarté s'il porte des mots anglais caractéristiques des
 * métiers du recrutement et aucun signe de français.
 */

/** Mots d'intitulés presque exclusivement anglais. */
const ENGLISH_MARKERS = new Set([
  'talent', 'acquisition', 'recruiter', 'recruiting', 'recruitment', 'specialist', 'partner',
  'manager', 'head', 'lead', 'senior', 'junior', 'officer', 'sourcer', 'coordinator',
  'engineer', 'developer', 'business', 'people', 'operations', 'director', 'associate',
  'executive', 'analyst', 'consultant', 'generalist', 'hrbp', 'tech', 'technical', 'staffing',
  'hiring', 'employer', 'branding', 'onboarding', 'workforce', 'culture', 'experience',
]);

/** Mots d'intitulés français (ou d'usage courant en France) qui prouvent le français. */
const FRENCH_MARKERS = new Set([
  'chargé', 'chargée', 'charge', 'chargés', 'recruteur', 'recruteuse', 'recrutement', 'responsable',
  'gestionnaire', 'assistant', 'assistante', 'directeur', 'directrice', 'conseiller', 'conseillère',
  'conseil', 'ressources', 'humaines', 'humain', 'sourceur', 'sourceuse', 'chasseur', 'chasseuse',
  'talents', 'emploi', 'carrière', 'carrieres', 'rrh', 'drh', 'formation', 'paie', 'rh',
  'chef', 'projet', 'cheffe', 'attaché', 'attachée', 'référent', 'référente', 'technicien',
  'ingénieur', 'développeur', 'administrateur', 'administratrice', 'cabinet', 'cadre',
]);

const FRENCH_STOPWORDS = new Set(['de', 'du', 'des', 'd', 'en', 'et', 'la', 'le', 'les', 'au', 'aux', 'pour']);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-zà-öø-ÿ0-9]+/)
    .filter(Boolean);
}

/**
 * Vrai si l'intitulé est utilisable pour interroger une source francophone :
 * pas de marqueur anglais, ou au moins un signe de français (mot métier,
 * article, caractère accentué).
 */
export function isFrenchJobTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  const words = tokens(t);
  if (words.length === 0) return false;

  const hasFrenchSign =
    /[àâäçéèêëîïôöùûüÿœ]/i.test(t)
    || words.some(w => FRENCH_MARKERS.has(w))
    || words.some(w => FRENCH_STOPWORDS.has(w));
  if (hasFrenchSign) return true;

  return !words.some(w => ENGLISH_MARKERS.has(w));
}

/** Intitulés français d'une piste, dans l'ordre, sans doublon ni vide. */
export function frenchJobTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    const t = raw.trim();
    if (!t || !isFrenchJobTitle(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Message affiché quand une source francophone n'a aucun intitulé exploitable. */
export const NO_FRENCH_TITLE_MESSAGE =
  'Ajoutez un intitulé français (ex : chargé de recrutement IT) pour interroger cette source';
