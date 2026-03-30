/**
 * Calcul du score de pertinence d'une offre (0-100).
 *
 * Algorithme :
 *  - Base : 50 (neutre)
 *  - +10 par mot-clé positif trouvé dans titre + snippet
 *  - -20 par mot-clé négatif trouvé
 *  - Résultat clampé entre 0 et 100
 */

import type { RawJobOffer } from '@/types/job-watch';

export function computeScore(
  offer: Pick<RawJobOffer, 'title' | 'descriptionSnippet'>,
  positiveKeywords: string[],
  negativeKeywords: string[]
): number {
  const text = `${offer.title} ${offer.descriptionSnippet ?? ''}`.toLowerCase();

  let score = 50;

  for (const kw of positiveKeywords) {
    if (kw.trim() && text.includes(kw.trim().toLowerCase())) {
      score += 10;
    }
  }

  for (const kw of negativeKeywords) {
    if (kw.trim() && text.includes(kw.trim().toLowerCase())) {
      score -= 20;
    }
  }

  return Math.max(0, Math.min(100, score));
}
