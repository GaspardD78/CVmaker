/**
 * Recouvrement entre pistes : Jaccard sur l'ensemble des intitulés normalisés.
 *
 * Deux pistes aux mêmes intitulés ramènent les mêmes offres et consomment deux
 * fois le budget de collecte. Au-delà de `NEAR_IDENTICAL_THRESHOLD`, la piste est
 * déclarée « quasi identique ».
 */

export const NEAR_IDENTICAL_THRESHOLD = 0.6;

/** Minuscules, sans accents, ponctuation et espaces normalisés. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleSet(titles: string[]): Set<string> {
  return new Set(titles.map(normalizeTitle).filter(Boolean));
}

/** Indice de Jaccard entre deux listes d'intitulés (0 si l'une est vide). */
export function titleOverlap(a: string[], b: string[]): number {
  const setA = titleSet(a);
  const setB = titleSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

export interface TrackOverlap {
  name: string;
  /** Jaccard entre 0 et 1, arrondi à 2 décimales. */
  overlap: number;
  nearIdentical: boolean;
}

/** Recouvrement de `titles` avec chacune des autres pistes. */
export function overlapWithOthers(
  titles: string[],
  others: Array<{ name: string; jobTitles: string[] }>,
): TrackOverlap[] {
  return others.map(o => {
    const overlap = Math.round(titleOverlap(titles, o.jobTitles) * 100) / 100;
    return { name: o.name, overlap, nearIdentical: overlap > NEAR_IDENTICAL_THRESHOLD };
  });
}
