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
import type { Profile, MasterEntry } from '@/types/profile';

export function computeScore(
  offer: Pick<RawJobOffer, 'title' | 'descriptionSnippet'>,
  positiveKeywords: string[],
  negativeKeywords: string[],
  profile?: Profile | null,
  profileEntries?: MasterEntry[] | null
): number {
  const text = `${offer.title} ${offer.descriptionSnippet ?? ''}`.toLowerCase();

  let score = 50;

  if (profile?.title) {
    if (offer.title.toLowerCase().includes(profile.title.toLowerCase())) {
      score += 15;
    }
  }

  if (profileEntries) {
    const skills = profileEntries.filter(e => e.entryType === 'skill');
    for (const skill of skills) {
      if (skill.title.trim() && text.includes(skill.title.trim().toLowerCase())) {
        score += 5;
      }
    }
  }

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
