/**
 * Calcul du score de pertinence d'une offre (0-100).
 *
 * Architecture à deux couches :
 *
 * Couche 1 – Disqualifiers (tout ou rien) :
 *   - Entreprise dans la blacklist → score 0
 *   - searchIntent.role.mustExclude ou domain.excluded matche (\b) → score 0
 *
 * Couche 2 – Pertinence graduée (base 50 + bonus) :
 *   - role.primary      : +15/match, plafonné à +30  (signal fort — rôle visé)
 *   - domain.required   : +10/match, plafonné à +20  (domaine obligatoire)
 *   - domain.preferred  : +5/match,  plafonné à +10  (domaine souhaité)
 *   - Time-decay        : -2 pts/jour, plafonné à -30
 *   - Salaire           : comparé à searchIntent.salary.target (défaut 45 k€)
 *   - Red flags structurels : -40 (ninja…) / -60 (non rémunéré)
 *   - Résultat clampé entre 0 et 100
 */

import type { RawJobOffer, SearchIntent } from '@/types/job-watch';

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
  searchIntent: SearchIntent,
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

  const allExcluded = [...searchIntent.role.mustExclude, ...searchIntent.domain.excluded];
  for (const kw of allExcluded) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) return 0;
  }

  // ------------------------------------------------------------------
  // Couche 2 : Pertinence graduée
  // ------------------------------------------------------------------

  let score = 50;

  // Rôle principal : +15/match, plafonné +30
  let roleBonus = 0;
  for (const kw of searchIntent.role.primary) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) roleBonus += 15;
  }
  score += Math.min(30, roleBonus);

  // Domaine requis : +10/match, plafonné +20
  let domReqBonus = 0;
  for (const kw of searchIntent.domain.required) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) domReqBonus += 10;
  }
  score += Math.min(20, domReqBonus);

  // Domaine préféré : +5/match, plafonné +10
  let domPrefBonus = 0;
  for (const kw of searchIntent.domain.preferred) {
    if (kw.trim() && wordBoundaryRegex(kw).test(text)) domPrefBonus += 5;
  }
  score += Math.min(10, domPrefBonus);

  // Time-decay
  if (offer.publishedAt) {
    const ageMs = Date.now() - new Date(offer.publishedAt).getTime();
    const ageDays = Math.floor(ageMs / (1_000 * 60 * 60 * 24));
    score -= Math.min(30, ageDays * 2);
  }

  // Salaire
  const targetSalary = searchIntent.salary.target ?? 45_000;
  const hideIfBelow  = searchIntent.salary.hideIfBelow ?? Math.round(targetSalary * 0.80);
  if (offer.salaryMin != null) {
    const ratio = offer.salaryMin / targetSalary;
    if (ratio >= 1.10)                          score += 20;
    else if (ratio >= 0.95)                     score += 10;
    else if (offer.salaryMin < hideIfBelow)     score -= 30;
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
