/**
 * Dictionnaire annonce / cible, centralisé : sans annonce (candidature spontanée,
 * recommandation), le prompt parle de « cible » partout. Seul le texte d'instruction
 * passe par `applyWording` ; les données (profil, contexte additionnel, règles
 * personnelles) ne sont jamais réécrites. Les clés du JSON (`langue_annonce`) ne changent pas.
 */

export type Wording = 'annonce' | 'cible';

/** Remplacements ordonnés (du plus spécifique au plus général). */
const CIBLE_TABLE: readonly (readonly [RegExp, string])[] = [
  [/formulation EXACTE de l'annonce \(mots-clés tels qu'écrits\)/g, "formulation tirée de la cible (postes envisagés, atouts, attentes du premier lecteur)"],
  [/formulation exacte de l'annonce/g, 'formulation tirée de la cible'],
  [/pour UNE annonce/g, 'pour UNE cible'],
  [/cette annonce/g, 'cette cible'],
  [/l'annonce/g, 'la cible'],
];

export function applyWording(text: string, mode: Wording | undefined): string {
  if (mode !== 'cible') return text;
  return CIBLE_TABLE.reduce((acc, [re, to]) => acc.replace(re, to), text);
}
