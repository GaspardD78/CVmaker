/**
 * Correspondance d'un titre d'offre avec les intitulés d'une piste, partagée par le
 * scorer et le filtre de pertinence « Choisir le service public ».
 */

import { cleanTitle } from './parsers/csp-html';

export const STOPWORDS = new Set([
  'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'au', 'aux', 'un', 'une', 'pour', 'a', 'sur', 'par',
]);

export function fold(text: string): string {
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

/** Premier intitulé de `intitules` porté par le titre (voir `titleMatches`), ou null. */
export function findTitleMatch(intitules: readonly string[], offerTitle: string): string | null {
  const title = stems(normalizeTitle(offerTitle));
  for (const intitule of intitules) {
    const words = significantStems(intitule);
    if (words.length === 0) continue;
    if (containsSequence(title, words) || words.every(w => title.includes(w))) return intitule;
  }
  return null;
}

