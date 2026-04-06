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
import type { LearnedDictionary } from './learning-engine';
import type { Profile, MasterEntry } from '@/types/profile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryRegex(term: string): RegExp {
  return new RegExp('\\b' + escapeRegex(term.trim()) + '\\b', 'i');
}

/**
 * Weighted keyword match: checks title first (full bonus), then snippet (60% bonus).
 * Returns the effective weight multiplier (1.0 for title, 0.6 for snippet-only, 0 for no match).
 */
function weightedMatch(kw: string, title: string, snippet: string): number {
  const trimmed = kw.trim();
  if (!trimmed) return 0;
  const re = wordBoundaryRegex(trimmed);
  if (re.test(title)) return 1.0;
  if (re.test(snippet)) return 0.6;
  return 0;
}

/**
 * Extracts bigrams (pairs of consecutive significant words) from text.
 * Useful for matching multi-word concepts like "chef de projet" or "data engineer".
 */
function extractBigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôùûüç\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

/**
 * Checks if a multi-word search term appears in the text bigrams.
 * Returns true if the term (which may be 2+ words) is found as a bigram in the text.
 */
function matchesViaBigram(term: string, textBigrams: string[]): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized.includes(' ')) return false; // single words use wordBoundaryRegex
  return textBigrams.some(bg => bg.includes(normalized) || normalized.includes(bg));
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

/**
 * Optional learned signals passed to the scorer.
 * `learnedDict` comes from user feedback (thumbs up/down, kanban import, quick archive).
 * `companyReputation` tracks per-company sentiment from the same feedback.
 */
export interface LearnedSignals {
  learnedDict?: LearnedDictionary;
  companyReputation?: Record<string, number>;
}

export function computeScore(
  offer: ScorerOffer,
  searchIntent: SearchIntent,
  companyBlacklist: string[],
  learned?: LearnedSignals,
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
  // Title matches get full bonus, snippet-only matches get 60%.
  // Multi-word terms are also checked via bigram matching.
  // ------------------------------------------------------------------

  const title   = offer.title ?? '';
  const snippet = offer.descriptionSnippet ?? '';
  const titleBigrams   = extractBigrams(title);
  const snippetBigrams = extractBigrams(snippet);

  let score = 50;

  /** Match a keyword against title+snippet, including bigram fallback for multi-word terms. */
  const matchWeight = (kw: string): number => {
    const w = weightedMatch(kw, title, snippet);
    if (w > 0) return w;
    // Bigram fallback for multi-word terms
    if (kw.trim().includes(' ')) {
      if (matchesViaBigram(kw, titleBigrams)) return 1.0;
      if (matchesViaBigram(kw, snippetBigrams)) return 0.6;
    }
    return 0;
  };

  // Rôle principal : +15/match (weighted), plafonné +30
  let roleBonus = 0;
  for (const kw of searchIntent.role.primary) {
    roleBonus += 15 * matchWeight(kw);
  }
  score += Math.min(30, roleBonus);

  // Domaine requis : +10/match (weighted), plafonné +20
  let domReqBonus = 0;
  for (const kw of searchIntent.domain.required) {
    domReqBonus += 10 * matchWeight(kw);
  }
  score += Math.min(20, domReqBonus);

  // Domaine préféré : +5/match (weighted), plafonné +10
  let domPrefBonus = 0;
  for (const kw of searchIntent.domain.preferred) {
    domPrefBonus += 5 * matchWeight(kw);
  }
  score += Math.min(10, domPrefBonus);

  // ------------------------------------------------------------------
  // Couche 2b : Signaux appris (feedback utilisateur)
  // Ratio 4:1 avec la config explicite : cap +/-15
  // ------------------------------------------------------------------

  if (learned?.learnedDict) {
    const textLower = text.toLowerCase();
    let learnedBonus = 0;
    let learnedPenalty = 0;

    // Positive learned terms — bonus proportional to score, normalized to 0-3 range
    for (const [term, rawScore] of Object.entries(learned.learnedDict.positive)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedBonus += Math.min(3, rawScore * 0.5);
      }
    }
    score += Math.min(15, learnedBonus);

    // Negative learned terms — penalty proportional to score
    for (const [term, rawScore] of Object.entries(learned.learnedDict.negative)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedPenalty += Math.min(3, rawScore * 0.5);
      }
    }
    score -= Math.min(15, learnedPenalty);
  }

  // Company reputation: +5 (good) / -5 (bad) when absolute score > 3
  if (learned?.companyReputation && companyLower) {
    const rep = learned.companyReputation[companyLower];
    if (rep !== undefined) {
      if (rep > 3) score += 5;
      else if (rep < -3) score -= 5;
    }
  }

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

// ---------------------------------------------------------------------------
// Profile-to-SearchIntent builder
// ---------------------------------------------------------------------------

/**
 * Builds a SearchIntent pre-filled from the user's profile data.
 * - role.primary: profile title tokens + 2 most recent experience titles
 * - domain.required: top 5 skills (by sort order)
 * - domain.preferred: next 5 skills
 */
export function buildSearchIntentFromProfile(
  profile: Profile | null,
  entries: MasterEntry[],
): Partial<SearchIntent> {
  // Extract role keywords from profile title
  const rolePrimary: string[] = [];
  if (profile?.title) {
    // Split on common separators like "/", "|", "-", ","
    const tokens = profile.title.split(/[/|,\-–—]/).map(t => t.trim()).filter(t => t.length >= 3);
    rolePrimary.push(...tokens);
  }

  // Add the 2 most recent experience titles
  const experiences = entries
    .filter(e => e.entryType === 'experience')
    .sort((a, b) => {
      // Most recent first: sort by endDate desc, then startDate desc
      const aEnd = a.endDate ?? '9999';
      const bEnd = b.endDate ?? '9999';
      if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    })
    .slice(0, 2);

  for (const exp of experiences) {
    if (exp.title && !rolePrimary.some(r => r.toLowerCase() === exp.title.toLowerCase())) {
      rolePrimary.push(exp.title);
    }
  }

  // Skills sorted by sortOrder
  const skills = entries
    .filter(e => e.entryType === 'skill')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(e => e.title);

  const domainRequired = skills.slice(0, 5);
  const domainPreferred = skills.slice(5, 10);

  return {
    role: {
      primary: rolePrimary,
      mustExclude: [],
    },
    domain: {
      required: domainRequired,
      preferred: domainPreferred,
      excluded: [],
    },
  };
}
