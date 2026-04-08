/**
 * scorer.ts — Field-aware offer scoring (v2)
 *
 * Architecture à 4 couches :
 *
 * Couche 0 – Hard disqualifiers (score → 0) :
 *   - Entreprise blacklistée
 *   - Terme exclu trouvé dans le titre (excludeTitles / excludeDomains)
 *   - Mauvais type de contrat (mode strict uniquement)
 *
 * Couche 1 – Title match (signal le plus fort) :
 *   - Match dans le titre (confidence high) → +35
 *   - Match dans le titre (confidence medium/low) → +25
 *   - Match dans la description → +10
 *   - Mode strict : aucun match titre → score plafonné à 30 max
 *   - Mode balanced : aucun match titre → -15 pts
 *
 * Couche 2 – Contract match :
 *   - Contrat correspondant → +10
 *   - Mauvais contrat (balanced) → -20
 *   - Mauvais contrat (strict) → score → 0 (handled in Couche 0)
 *
 * Couche 3 – Skills & domain :
 *   - Skill trouvé (any field) → +5 par match, plafonné +20
 *   - Domain trouvé → +3 par match, plafonné +10
 *
 * Couche 4 – Signals secondaires :
 *   - Salaire : +20 si ≥ target, -30 si < min
 *   - Time-decay : -2 pts/jour, plafonné -20
 *   - Learned signals (feedback utilisateur) : ±15 max
 *   - Company reputation : ±5
 *   - Red flags structurels (non rémunéré, ninja, etc.)
 *
 * Résultat clampé entre 0 et 100.
 */

import type { RawJobOffer, SearchProfile } from '@/types/job-watch';
import type { LearnedDictionary } from './learning-engine';
import type { Profile, MasterEntry } from '@/types/profile';
import type { SearchIntent } from '@/types/job-watch';

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryRegex(term: string): RegExp {
  return new RegExp('\\b' + escapeRegex(term.trim()) + '\\b', 'i');
}

/** Returns true if `term` is found in `text` with word boundaries. */
function hasWordMatch(term: string, text: string): boolean {
  if (!term.trim()) return false;
  return wordBoundaryRegex(term).test(text);
}

/**
 * Checks if any term in the list matches the text.
 * Returns the matching term or null.
 */
function findMatch(terms: string[], text: string): string | null {
  for (const term of terms) {
    if (term.trim() && hasWordMatch(term, text)) return term;
  }
  return null;
}

/** True if any term in the list matches the text. */
function anyMatch(terms: string[], text: string): boolean {
  return findMatch(terms, text) !== null;
}

// ── Red flags ────────────────────────────────────────────────────────────────

const STRUCTURAL_RED_FLAGS: { pattern: RegExp; penalty: number }[] = [
  { pattern: /\bnon rémunéré\b/i,               penalty: -60 },
  { pattern: /\b(ninja|gourou|rockstar|jedi)\b/i, penalty: -40 },
];

// ── Contract normalisation ───────────────────────────────────────────────────

/**
 * Normalises a raw contract type string to a canonical label
 * so we can compare across sources uniformly.
 */
function normaliseContract(raw: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes('cdi'))                               return 'CDI';
  if (r.includes('cdd'))                               return 'CDD';
  if (r.includes('interim') || r.includes('intérim'))  return 'Intérim';
  if (r.includes('alternance') || r.includes('apprentissage')) return 'Alternance';
  if (r.includes('stage') || r.includes('internship')) return 'Stage';
  if (r.includes('freelance') || r.includes('indépendant') ||
      r.includes('contractor') || r.includes('lib'))   return 'Freelance';
  return raw;
}

// ── Optional learned signals ─────────────────────────────────────────────────

export interface LearnedSignals {
  learnedDict?: LearnedDictionary;
  companyReputation?: Record<string, number>;
}

// ── Main scorer ──────────────────────────────────────────────────────────────

type ScorerOffer = Pick<
  RawJobOffer,
  | 'title'
  | 'descriptionSnippet'
  | 'publishedAt'
  | 'company'
  | 'salaryMin'
  | 'salaryMax'
  | 'contractType'
  | 'extraction'
>;

export interface ScoreBreakdown {
  /** Final clamped score 0-100 */
  total: number;
  /** True if immediately disqualified (score forced to 0) */
  disqualified: boolean;
  disqualifyReason?: string;
  titleMatchScore: number;    // 0 | 10 | 25 | 35
  titleMatchedTerm?: string;
  contractMatchScore: number; // -20 | 0 | +10
  skillsScore: number;        // 0..20
  domainScore: number;        // 0..10
  salaryScore: number;        // -30 | 0 | +10 | +20
  learnedScore: number;       // -15..+15
  decayPenalty: number;       // 0..-20
}

export function computeScore(
  offer: ScorerOffer,
  profile: SearchProfile,
  learned?: LearnedSignals,
): number {
  return computeScoreWithBreakdown(offer, profile, learned).total;
}

export function computeScoreWithBreakdown(
  offer: ScorerOffer,
  profile: SearchProfile,
  learned?: LearnedSignals,
): ScoreBreakdown {
  const title   = offer.title ?? '';
  const snippet = offer.descriptionSnippet ?? '';
  const fullText = `${title} ${snippet}`;
  const companyLower = offer.company?.trim().toLowerCase() ?? '';

  // ── Couche 0 : Hard disqualifiers ──────────────────────────────────────────

  // Company blacklist
  if (
    companyLower &&
    profile.blacklistedCompanies.some(c => c.trim().toLowerCase() === companyLower)
  ) {
    return zero('Entreprise blacklistée');
  }

  // Excluded title terms (check in title primarily, then full text)
  const excludedTerms = [...profile.excludeTitles, ...profile.excludeDomains];
  const excludedMatchInTitle = findMatch(excludedTerms, title);
  if (excludedMatchInTitle) {
    return zero(`Terme exclu dans le titre: "${excludedMatchInTitle}"`);
  }
  // Also check full text for excluded terms
  const excludedMatchInText = findMatch(excludedTerms, fullText);
  if (excludedMatchInText) {
    return zero(`Terme exclu: "${excludedMatchInText}"`);
  }

  // Contract disqualifier (strict mode only)
  const normContract = normaliseContract(offer.contractType);
  const wantsContracts = profile.contractTypes.length > 0;
  const contractMatches = wantsContracts && normContract
    ? profile.contractTypes.some(ct => ct.toLowerCase() === normContract.toLowerCase())
    : true; // no preference = always ok

  if (!contractMatches && profile.scoring.mode === 'strict') {
    return zero(`Contrat incompatible: "${normContract}" (mode strict)`);
  }

  // ── Couche 1 : Title match ─────────────────────────────────────────────────

  let titleMatchScore = 0;
  let titleMatchedTerm: string | undefined;

  if (profile.jobTitles.length > 0) {
    // Try title field first
    const matchInTitle = findMatch(profile.jobTitles, title);
    if (matchInTitle) {
      // Bonus depends on extraction confidence
      const conf = offer.extraction.titleConfidence;
      titleMatchScore = conf === 'high' ? 35 : 25;
      titleMatchedTerm = matchInTitle;
    } else {
      // Try description/snippet
      const matchInSnippet = findMatch(profile.jobTitles, snippet);
      if (matchInSnippet) {
        titleMatchScore = 10;
        titleMatchedTerm = matchInSnippet;
      }
    }
  }

  // Mode strict: no title match → cap score at 30
  const strictTitleCap = (profile.scoring.mode === 'strict' && profile.jobTitles.length > 0 && titleMatchScore === 0)
    ? 30
    : Infinity;

  // Mode balanced: no title match → penalty
  const balancedNoPrimaryPenalty = (profile.scoring.mode === 'balanced' && profile.jobTitles.length > 0 && titleMatchScore === 0)
    ? -15
    : 0;

  // ── Couche 2 : Contract match ──────────────────────────────────────────────

  let contractMatchScore = 0;
  if (wantsContracts) {
    if (contractMatches) {
      contractMatchScore = 10;
    } else if (offer.extraction.contractConfidence !== 'none') {
      // Only penalise if we're confident about what the contract type is
      contractMatchScore = -20;
    }
  }

  // ── Couche 3 : Skills & domain ────────────────────────────────────────────

  // Skills: check title first (full weight), then snippet (reduced weight)
  let skillsRaw = 0;
  for (const skill of profile.skills) {
    if (!skill.trim()) continue;
    if (hasWordMatch(skill, title))   skillsRaw += 5;
    else if (hasWordMatch(skill, snippet)) skillsRaw += 3;
  }
  const skillsScore = Math.min(20, skillsRaw);

  // Domain signals (soft bonus)
  let domainRaw = 0;
  for (const domain of profile.domains) {
    if (!domain.trim()) continue;
    if (hasWordMatch(domain, fullText)) domainRaw += 3;
  }
  const domainScore = Math.min(10, domainRaw);

  // ── Couche 4 : Secondary signals ──────────────────────────────────────────

  // Salary
  let salaryScore = 0;
  const salaryMin    = profile.salary.min;
  const salaryTarget = profile.salary.target;

  if (offer.salaryMin != null) {
    if (salaryTarget != null) {
      const ratio = offer.salaryMin / salaryTarget;
      if (ratio >= 1.10)        salaryScore = 20;
      else if (ratio >= 0.95)   salaryScore = 10;
    }
    if (salaryMin != null && offer.salaryMin < salaryMin) {
      salaryScore = -30;
    }
  }

  // Red flags structurels
  let redFlagPenalty = 0;
  for (const { pattern, penalty } of STRUCTURAL_RED_FLAGS) {
    if (pattern.test(title) || pattern.test(snippet)) {
      redFlagPenalty += penalty;
    }
  }

  // Time-decay
  let decayPenalty = 0;
  if (offer.publishedAt) {
    const ageMs   = Date.now() - new Date(offer.publishedAt).getTime();
    const ageDays = Math.floor(ageMs / (1_000 * 60 * 60 * 24));
    decayPenalty  = -Math.min(20, ageDays * 2);
  }

  // Learned signals
  let learnedScore = 0;
  if (learned?.learnedDict) {
    const textLower = fullText.toLowerCase();
    let learnedBonus   = 0;
    let learnedPenalty = 0;
    for (const [term, rawScore] of Object.entries(learned.learnedDict.positive)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedBonus += Math.min(3, rawScore * 0.5);
      }
    }
    for (const [term, rawScore] of Object.entries(learned.learnedDict.negative)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedPenalty += Math.min(3, rawScore * 0.5);
      }
    }
    learnedScore = Math.min(15, learnedBonus) - Math.min(15, learnedPenalty);
  }

  // Company reputation
  let repScore = 0;
  if (learned?.companyReputation && companyLower) {
    const rep = learned.companyReputation[companyLower];
    if (rep !== undefined) {
      if (rep > 3) repScore = 5;
      else if (rep < -3) repScore = -5;
    }
  }

  // ── Assemble total ─────────────────────────────────────────────────────────

  const base = 50;
  const raw =
    base +
    titleMatchScore +
    balancedNoPrimaryPenalty +
    contractMatchScore +
    skillsScore +
    domainScore +
    salaryScore +
    redFlagPenalty +
    decayPenalty +
    learnedScore +
    repScore;

  const total = Math.max(0, Math.min(strictTitleCap === Infinity ? 100 : strictTitleCap, raw));

  return {
    total,
    disqualified: false,
    titleMatchScore,
    titleMatchedTerm,
    contractMatchScore,
    skillsScore,
    domainScore,
    salaryScore,
    learnedScore,
    decayPenalty,
  };
}

function zero(reason: string): ScoreBreakdown {
  return {
    total: 0, disqualified: true, disqualifyReason: reason,
    titleMatchScore: 0, contractMatchScore: 0,
    skillsScore: 0, domainScore: 0, salaryScore: 0,
    learnedScore: 0, decayPenalty: 0,
  };
}

// ── Legacy adapter (backward compat for any callers using old SearchIntent) ───

/**
 * @deprecated Use computeScore(offer, profile) instead.
 * Adapts the old SearchIntent into a minimal SearchProfile for backward compat.
 */
export function computeScoreLegacy(
  offer: ScorerOffer,
  searchIntent: SearchIntent,
  companyBlacklist: string[],
  learned?: LearnedSignals,
): number {
  const profile: SearchProfile = {
    name: 'legacy',
    jobTitles: searchIntent.role.primary,
    skills: searchIntent.domain.required,
    domains: searchIntent.domain.preferred,
    excludeTitles: searchIntent.role.mustExclude,
    excludeDomains: searchIntent.domain.excluded,
    location: { label: '', city: '', inseeCode: '', departmentCodes: [], radiusKm: 30 },
    contractTypes: [],
    salary: {
      min: searchIntent.salary.hideIfBelow,
      target: searchIntent.salary.target,
    },
    scoring: { mode: 'balanced' },
    blacklistedCompanies: companyBlacklist,
  };
  return computeScore(offer, profile, learned);
}

// ── Utility: profile-match signal for display ─────────────────────────────────

/**
 * Returns 0-100: percentage of the user's skills present in the offer text.
 * Pure display helper — not part of the main scoring pipeline.
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

// ── Profile builder from CV data ─────────────────────────────────────────────

/**
 * Pre-fills a SearchProfile from the user's CV profile data.
 */
export function buildSearchProfileFromProfile(
  profile: Profile | null,
  entries: MasterEntry[],
): Partial<SearchProfile> {
  const jobTitles: string[] = [];
  if (profile?.title) {
    const tokens = profile.title
      .split(/[/|,\-–—]/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);
    jobTitles.push(...tokens);
  }

  const experiences = entries
    .filter(e => e.entryType === 'experience')
    .sort((a, b) => {
      const aEnd = a.endDate ?? '9999';
      const bEnd = b.endDate ?? '9999';
      if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    })
    .slice(0, 2);

  for (const exp of experiences) {
    if (exp.title && !jobTitles.some(r => r.toLowerCase() === exp.title.toLowerCase())) {
      jobTitles.push(exp.title);
    }
  }

  const skills = entries
    .filter(e => e.entryType === 'skill')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(e => e.title)
    .slice(0, 10);

  const city = profile?.city ?? '';

  return {
    jobTitles,
    skills,
    location: {
      label: city,
      city,
      inseeCode: '',
      departmentCodes: [],
      radiusKm: 30,
    },
  };
}

// ── Keep old export for components that reference it (will be removed later) ──

/** @deprecated Use buildSearchProfileFromProfile */
export function buildSearchIntentFromProfile(
  profile: Profile | null,
  entries: MasterEntry[],
): Partial<SearchIntent> {
  const p = buildSearchProfileFromProfile(profile, entries);
  return {
    role: {
      primary:     p.jobTitles ?? [],
      mustExclude: [],
    },
    domain: {
      required:  p.skills?.slice(0, 5) ?? [],
      preferred: p.skills?.slice(5, 10) ?? [],
      excluded:  [],
    },
  };
}
