/**
 * Pertinence des offres « Choisir le service public » (spec 007).
 *
 * Le moteur de recherche du site ne fait pas de recherche exacte : « chargé de
 * recrutement » ramène des « chargé d'exploitation déchèterie ». On vérifie donc
 * côté client que le titre porte un intitulé de la piste, AVANT d'enrichir (une
 * requête par offre), et on interroge aussi le mot le plus discriminant.
 */

import { fold, STOPWORDS } from '../title-match';

export { normalizeTitle, significantStems, titleMatches } from '../title-match';

/** Mots de métier trop génériques pour discriminer une recherche. */
const GENERIC = new Set([
  'charge', 'chargee', 'responsable', 'chef', 'cheffe', 'gestionnaire', 'assistant', 'assistante', 'adjoint',
  'adjointe', 'directeur', 'directrice', 'agent', 'referent', 'referente', 'conseiller', 'conseillere', 'manager',
  'mission', 'missions', 'technicien', 'technicienne', 'coordinateur', 'coordinatrice', 'animateur', 'animatrice',
  'officer', 'specialist', 'senior', 'junior', 'lead', 'head',
]);

/** Mot le plus discriminant d'un intitulé (« recrutement » pour « chargé de recrutement »), ou null. */
export function discriminantWord(intitule: string): string | null {
  const words = fold(intitule)
    .replace(/[^a-z0-9\s'’-]/g, ' ')
    .split(/[\s'’-]+/)
    .filter(w => w.length >= 5 && !STOPWORDS.has(w) && !GENERIC.has(w));
  if (words.length === 0) return null;
  // On renvoie la forme d'origine (accents) du mot retenu.
  const best = words.sort((a, b) => b.length - a.length)[0];
  const original = intitule.toLowerCase().split(/[\s'’-]+/).find(w => fold(w).replace(/[^a-z0-9]/g, '') === best);
  return (original ?? best).replace(/[^\p{L}\p{N}]/gu, '');
}

/** Requêtes à envoyer au site pour un intitulé : l'intitulé, puis son mot discriminant (2 au plus). */
export function searchTermsFor(intitule: string): string[] {
  const full = intitule.trim();
  const word = discriminantWord(full);
  if (!word || fold(word) === fold(full)) return [full];
  return [full, word];
}

/** Requêtes de toute la piste, sans doublon (casse et accents ignorés). */
export function searchTermsForAll(intitules: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const intitule of intitules) {
    for (const term of searchTermsFor(intitule)) {
      const key = fold(term);
      if (!seen.has(key)) { seen.add(key); out.push(term); }
    }
  }
  return out;
}
