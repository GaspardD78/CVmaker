/**
 * Pertinence des offres « Choisir le service public » (spec 007).
 *
 * Le moteur de recherche du site ne fait pas de recherche exacte : « chargé de
 * recrutement » ramène des « chargé d'exploitation déchèterie ». On vérifie donc
 * côté client que le titre porte un intitulé de la piste, AVANT d'enrichir (une
 * requête par offre), et on interroge aussi le mot le plus discriminant.
 */

import { cleanTitle } from './csp-html';

const STOPWORDS = new Set([
  'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'au', 'aux', 'un', 'une', 'pour', 'a', 'sur', 'par',
]);

/** Mots de métier trop génériques pour discriminer une recherche. */
const GENERIC = new Set([
  'charge', 'chargee', 'responsable', 'chef', 'cheffe', 'gestionnaire', 'assistant', 'assistante', 'adjoint',
  'adjointe', 'directeur', 'directrice', 'agent', 'referent', 'referente', 'conseiller', 'conseillere', 'manager',
  'mission', 'missions', 'technicien', 'technicienne', 'coordinateur', 'coordinatrice', 'animateur', 'animatrice',
  'officer', 'specialist', 'senior', 'junior', 'lead', 'head',
]);

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Titre normalisé : casse, accents, mentions de genre (`(h/f)`, `F/H`, `(H/F/X)`),
 * « (e) » → « e », ponctuation, numéro de référence en tête.
 */
export function normalizeTitle(title: string): string {
  return fold(cleanTitle(title))
    .replace(/\((e|es|e\.s)\)/g, '$1')
    .replace(/\(?\b[hfx]\s*\/\s*[hfx](?:\s*\/\s*[hfx])?\b\)?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Racine grossière : sans pluriel ni « e » final (chargée / chargé / chargés). */
function stem(word: string): string {
  let w = word.replace(/[sx]$/, '');
  for (let i = 0; i < 2 && w.length > 4 && w.endsWith('e'); i++) w = w.slice(0, -1);
  return w;
}

function stems(normalized: string): string[] {
  return normalized.split(' ').filter(w => w && !STOPWORDS.has(w) && w.length >= 2).map(stem);
}

/** Mots significatifs d'un intitulé (racines, sans mots vides). */
export function significantStems(intitule: string): string[] {
  return stems(normalizeTitle(intitule));
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Le titre de l'offre porte-t-il un des intitulés de la piste ? Oui si l'un d'eux
 * y figure en entier (hors casse, accents, genre), ou à défaut si TOUS ses mots
 * significatifs y figurent. Sans intitulé, tout passe (rien ne permet de juger).
 */
export function titleMatches(offerTitle: string, intitules: readonly string[]): boolean {
  const wanted = intitules.map(i => significantStems(i)).filter(w => w.length > 0);
  if (wanted.length === 0) return true;
  const title = stems(normalizeTitle(offerTitle));
  return wanted.some(words => containsSequence(title, words) || words.every(w => title.includes(w)));
}

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
