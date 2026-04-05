/**
 * Calcul du score de pertinence d'une offre (0-100).
 *
 * Algorithme :
 *  - Base : 50 (neutre)
 *  - +10 par mot-clé positif trouvé dans titre + snippet
 *  - -20 par mot-clé négatif trouvé
 *  - Time-decay : -2 pts/jour depuis publishedAt, plafonné à -30 pts
 *  - Red flags structurels : pénalités sur patterns regex dans titre/snippet
 *  - Résultat clampé entre 0 et 100
 */

import type { RawJobOffer } from '@/types/job-watch';
import type { Profile, MasterEntry } from '@/types/profile';

const STRUCTURAL_RED_FLAGS: { pattern: RegExp; penalty: number }[] = [
  { pattern: /\b(stage|alternance)\b/i, penalty: -60 },
  { pattern: /\b(ninja|gourou|rockstar|jedi)\b/i, penalty: -40 },
];

export function computeScore(
  offer: Pick<RawJobOffer, 'title' | 'descriptionSnippet' | 'publishedAt'>,
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

  if (offer.publishedAt) {
    const ageMs = Date.now() - new Date(offer.publishedAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    score -= Math.min(30, ageDays * 2);
  }

  for (const { pattern, penalty } of STRUCTURAL_RED_FLAGS) {
    if (pattern.test(offer.title) || pattern.test(offer.descriptionSnippet ?? '')) {
      score += penalty;
    }
  }

  return Math.max(0, Math.min(100, score));
}
