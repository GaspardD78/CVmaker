/**
 * Calcul du score de pertinence d'une offre (0-100).
 *
 * Architecture à deux couches :
 *
 * Couche 1 – Disqualifiers (tout ou rien) :
 *   - Entreprise dans la blacklist → score 0
 *   - Mot-clé négatif matche le texte (\b) → score 0
 *
 * Couche 2 – Pertinence graduée :
 *   - Base : 50
 *   - Mots-clés positifs : +10/match, plafonné à +30
 *   - Time-decay : -2 pts/jour depuis publishedAt, plafonné à -30
 *   - Salaire : comparé à TARGET_SALARY (ratio vs salaryMin)
 *   - Red flags structurels : -40 (ninja…) / -60 (non rémunéré)
 *   - Résultat clampé entre 0 et 100
 */

import type { RawJobOffer } from '@/types/job-watch';

// ---------------------------------------------------------------------------
// TODO: exposer targetSalary dans JobWatchSettings (Sprint 2)
// ---------------------------------------------------------------------------
const TARGET_SALARY = 45_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryRegex(term: string): RegExp {
  return new RegExp('\\b' + escapeRegex(term.trim()) + '\\b', 'i');
}

// ---------------------------------------------------------------------------
// Red flags structurels (Couche 2 uniquement — après les disqualifiers)
// ---------------------------------------------------------------------------

const STRUCTURAL_RED_FLAGS: { pattern: RegExp; penalty: number }[] = [
  { pattern: /\bnon rémunéré\b/i,               penalty: -60 },
  { pattern: /\b(ninja|gourou|rockstar|jedi)\b/i, penalty: -40 },
];

// ---------------------------------------------------------------------------
// Scorer principal
// ---------------------------------------------------------------------------

type ScorerOffer = Pick<
  RawJobOffer,
  'title' | 'descriptionSnippet' | 'publishedAt' | 'company' | 'salaryMin' | 'salaryMax'
>;

export function computeScore(
  offer: ScorerOffer,
  positiveKeywords: string[],
  negativeKeywords: string[],
  companyBlacklist: string[],
): number {
  const text = `${offer.title} ${offer.descriptionSnippet ?? ''}`;

  // ------------------------------------------------------------------
  // Couche 1 : Disqualifiers — retour immédiat à 0
  // ------------------------------------------------------------------

  const companyLower = offer.company?.trim().toLowerCase();
  if (
    companyLower &&
    companyBlacklist.some(c => c.trim().toLowerCase() === companyLower)
  ) {
    return 0;
  }

  for (const kw of negativeKeywords) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) {
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // Couche 2 : Pertinence graduée
  // ------------------------------------------------------------------

  let score = 50;

  // Mots-clés positifs (cap +30)
  let posBonus = 0;
  for (const kw of positiveKeywords) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) {
      posBonus += 10;
    }
  }
  score += Math.min(30, posBonus);

  // Time-decay
  if (offer.publishedAt) {
    const ageMs = Date.now() - new Date(offer.publishedAt).getTime();
    const ageDays = Math.floor(ageMs / (1_000 * 60 * 60 * 24));
    score -= Math.min(30, ageDays * 2);
  }

  // Salaire
  if (offer.salaryMin != null) {
    const ratio = offer.salaryMin / TARGET_SALARY;
    if (ratio >= 1.10)     score += 20;
    else if (ratio >= 0.95) score += 10;
    else if (ratio < 0.80)  score -= 30;
  }
  // salaire masqué → neutre

  // Red flags structurels
  for (const { pattern, penalty } of STRUCTURAL_RED_FLAGS) {
    if (pattern.test(offer.title) || pattern.test(offer.descriptionSnippet ?? '')) {
      score += penalty;
    }
  }

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Utilitaire display-only (non modifié — utilisé par JobOfferCard)
// ---------------------------------------------------------------------------

/**
 * Lightweight profile-match signal for display purposes only.
 * Returns 0-100: what percentage of the user's skills appear in the offer text.
 * Pure function — no scoring side-effects.
 */
export function computeLightProfileMatch(
  offerSnippet: string,
  profileSkills: string[],
): number {
  if (profileSkills.length === 0) return 0;
  const text = offerSnippet.toLowerCase();
  const matched = profileSkills.filter(
    skill => skill.trim() && text.includes(skill.trim().toLowerCase()),
  ).length;
  return Math.round((matched / profileSkills.length) * 100);
}
