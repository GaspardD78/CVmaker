/**
 * scorer.ts — Field-aware offer scoring (v3)
 *
 * Architecture à 4 couches :
 *
 * Couche 0 – Hard disqualifiers (score → 0) :
 *   - Entreprise blacklistée
 *   - Terme exclu : veto absolu selon sa portée (`title` : titre seul ; `anywhere` : titre OU
 *     description). Défaut : excludeTitles → title, excludeDomains → anywhere (cf. exclusions.ts)
 *   - Mauvais type de contrat (mode strict uniquement)
 *
 * Couche 1 – Title match (signal le plus fort) :
 *   - Match dans le titre (confidence high)  → +40
 *   - Match dans le titre (confidence other) → +30
 *   - Match dans la description              → +15
 *   - Mode balanced, aucun match titre, jobTitles non vide → score total plafonné à 25
 *   - Mode strict, aucun match titre → score → 0 (disqualifié)
 *
 * Couche 2 – Contract match :
 *   - Contrat correspondant         → +10
 *   - Mauvais contrat (balanced)    → -15
 *   - Mauvais contrat (strict)      → score → 0 (handled in Couche 0)
 *
 * Couche 3 – Skills & domain :
 *   - Skill trouvé dans titre       → +6 par match, plafonné +24
 *   - Skill trouvé en description   → +3 par match, plafonné +12
 *   - Domain trouvé                 → +3 par match, plafonné +10
 *   - requiredDomains non vide, aucun trouvé → plafond 25 (balanced/loose) ou score 0 (strict)
 *
 * Couche 4 – Signaux secondaires :
 *   - Salaire : +20 si ≥ target, -30 si < min
 *   - Time-decay : -2 pts/jour, plafonné -20
 *   - Learned signals (feedback utilisateur) : ±15 max
 *   - Company reputation : ±5
 *   - Red flags structurels (non rémunéré, ninja, etc.)
 *
 * Base dynamique :
 *   - jobTitles.length > 0  → base = 0  (score entièrement gagné)
 *   - jobTitles.length === 0 → base = 50 (mode permissif — comportement legacy)
 *
 * Résultat clampé entre 0 et 100.
 */

import type { RawJobOffer, SearchProfile } from '@/types/job-watch';
import type { LearnedDictionary } from './learning-engine';
import type { Profile, MasterEntry } from '@/types/profile';
import { resolveExclusions } from './exclusions';
import { applyAIFilter, type AIFilterRule, type AIFilterMatch } from './ai-filter';

// ── Poids du moteur (source unique, lue aussi par le prompt d'analyse) ───────

export const SCORING_WEIGHTS = {
  titleHigh: 40,
  titleOther: 30,
  titleInDescription: 15,
  contractMatch: 10,
  contractMismatch: -15,
  skillInTitle: 6,
  skillInTitleCap: 24,
  skillInDescription: 3,
  skillInDescriptionCap: 12,
  domainMatch: 3,
  domainCap: 10,
  salaryAboveTarget: 20,
  salaryAboveTargetRatio: 1.10,
  salaryNearTarget: 10,
  salaryNearTargetRatio: 0.95,
  salaryBelowMin: -30,
  decayPerDay: 2,
  decayCap: 20,
  learnedPerTermCap: 3,
  learnedTotalCap: 15,
  companyReputation: 5,
  balancedCap: 25,
  baseWithoutTitles: 50,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Bornes de mot Unicode. `\b` ne reconnaît pas les lettres accentuées comme
 * « mot » : « cybersécurité » ne matchait jamais, le `é` final étant suivi d'une
 * frontière non reconnue. Bornes sur \p{L}\p{N} corrigent cela. Pas de lookbehind
 * (absent des WebViews anciennes) : le caractère précédent est consommé par `(^|[^…])`.
 */
function wordBoundaryRegex(term: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(term.trim())}(?![\\p{L}\\p{N}])`, 'iu');
}

/** Returns true if `term` is found in `text` with word boundaries. */
export function hasWordMatch(term: string, text: string): boolean {
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
  /** Optional AI filter rule applied as Couche 0.5 of the scoring pipeline. */
  aiFilterRule?: AIFilterRule | null;
  /** Date d'évaluation (ancienneté). Défaut : maintenant. Sert aux tests et à la simulation. */
  now?: Date;
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
  titleMatchScore: number;    // 0 | 15 | 30 | 40
  titleMatchedTerm?: string;
  contractMatchScore: number; // -15 | 0 | +10
  skillsScore: number;        // 0..24
  domainScore: number;        // 0..10
  salaryScore: number;        // -30 | 0 | +10 | +20
  learnedScore: number;       // -15..+15
  decayPenalty: number;       // 0..-20
  /** Diagnostic: base score used (0 or 50) */
  baseScore?: number;
  /** Le plafond (titre absent en balanced, ou domaine obligatoire absent) a été appliqué. */
  capApplied?: boolean;
  /** `requiredDomains` est non vide et aucun terme n'a été trouvé. */
  requiredDomainMissing?: boolean;
  /** Net delta contributed by the AI filter rule (bounded). */
  aiFilterDelta?: number;
  /** Matching AI filter patterns, for UI transparency. */
  aiFilterMatches?: AIFilterMatch[];
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
  const title    = offer.title ?? '';
  const snippet  = offer.descriptionSnippet ?? '';
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

  // Excluded terms — veto absolu sur la portée du terme
  // La portée dépend du terme : `title` ne regarde que le titre.
  for (const exclusion of resolveExclusions(profile)) {
    const haystack = exclusion.scope === 'title' ? title : fullText;
    if (hasWordMatch(exclusion.term, haystack)) {
      return zero(`Terme exclu: "${exclusion.term}"`);
    }
  }

  // ── Couche 0.5 : AI filter rule (optional) ─────────────────────────────────
  // Runs after built-in exclusions so the user's own rules can disqualify
  // offers that the profile didn't catch, and contribute a bounded delta
  // to the final score.
  const aiResult = applyAIFilter(learned?.aiFilterRule, {
    title,
    company: offer.company ?? null,
    descriptionSnippet: snippet,
    location: null,
  });
  if (aiResult.disqualified) {
    return zero(aiResult.disqualifyReason ?? 'Exclu par la règle IA');
  }

  // Contract disqualifier (strict mode only)
  const normContract  = normaliseContract(offer.contractType);
  const wantsContracts = profile.contractTypes.length > 0;
  const contractMatches = wantsContracts && normContract
    ? profile.contractTypes.some(ct => ct.toLowerCase() === normContract.toLowerCase())
    : true;

  if (!contractMatches && profile.scoring.mode === 'strict') {
    return zero(`Contrat incompatible: "${normContract}" (mode strict)`);
  }

  // ── Base dynamique ─────────────────────────────────────────────────────────

  const base = profile.jobTitles.length > 0 ? 0 : SCORING_WEIGHTS.baseWithoutTitles;

  // ── Couche 1 : Title match ─────────────────────────────────────────────────

  let titleMatchScore = 0;
  let titleMatchedTerm: string | undefined;

  if (profile.jobTitles.length > 0) {
    const matchInTitle = findMatch(profile.jobTitles, title);
    if (matchInTitle) {
      const conf = offer.extraction.titleConfidence;
      titleMatchScore = conf === 'high' ? SCORING_WEIGHTS.titleHigh : SCORING_WEIGHTS.titleOther;
      titleMatchedTerm = matchInTitle;
    } else {
      const matchInSnippet = findMatch(profile.jobTitles, snippet);
      if (matchInSnippet) {
        titleMatchScore = SCORING_WEIGHTS.titleInDescription;
        titleMatchedTerm = matchInSnippet;
      }
    }
  }

  // Mode strict: no title match → disqualify
  if (profile.scoring.mode === 'strict' && profile.jobTitles.length > 0 && titleMatchScore === 0) {
    return zero('Aucun match jobTitle en mode strict');
  }

  // Mode balanced: no title match → apply cap of 25 after full assembly
  const applyBalancedCap = (
    profile.scoring.mode === 'balanced' &&
    profile.jobTitles.length > 0 &&
    titleMatchScore === 0
  );

  // ── Couche 2 : Contract match ──────────────────────────────────────────────

  let contractMatchScore = 0;
  if (wantsContracts) {
    if (contractMatches) {
      contractMatchScore = SCORING_WEIGHTS.contractMatch;
    } else if (offer.extraction.contractConfidence !== 'none') {
      contractMatchScore = SCORING_WEIGHTS.contractMismatch;
    }
  }

  // ── Couche 3 : Skills & domain ────────────────────────────────────────────

  // Skills: title gets higher weight (+6, max +24), snippet lower (+3, max +12)
  let skillsTitleRaw = 0;
  let skillsSnippetRaw = 0;
  for (const skill of profile.skills) {
    if (!skill.trim()) continue;
    if (hasWordMatch(skill, title))        skillsTitleRaw   += SCORING_WEIGHTS.skillInTitle;
    else if (hasWordMatch(skill, snippet)) skillsSnippetRaw += SCORING_WEIGHTS.skillInDescription;
  }
  const skillsScore =
    Math.min(SCORING_WEIGHTS.skillInTitleCap, skillsTitleRaw) +
    Math.min(SCORING_WEIGHTS.skillInDescriptionCap, skillsSnippetRaw);

  // Domain signals (soft bonus)
  let domainRaw = 0;
  for (const domain of profile.domains) {
    if (!domain.trim()) continue;
    if (hasWordMatch(domain, fullText)) domainRaw += SCORING_WEIGHTS.domainMatch;
  }
  const domainScore = Math.min(SCORING_WEIGHTS.domainCap, domainRaw);

  // Domaines obligatoires (optionnel) : au moins un dans le titre ou la description.
  const required = (profile.requiredDomains ?? []).filter(d => d.trim());
  const requiredDomainMissing =
    required.length > 0 && !required.some(d => hasWordMatch(d, fullText));
  if (requiredDomainMissing && profile.scoring.mode === 'strict') {
    return zero('Aucun domaine obligatoire présent en mode strict');
  }

  // ── Couche 4 : Secondary signals ──────────────────────────────────────────

  // Salary
  let salaryScore = 0;
  const salaryMin    = profile.salary.min;
  const salaryTarget = profile.salary.target;

  if (offer.salaryMin != null) {
    if (salaryTarget != null) {
      const ratio = offer.salaryMin / salaryTarget;
      if (ratio >= SCORING_WEIGHTS.salaryAboveTargetRatio)     salaryScore = SCORING_WEIGHTS.salaryAboveTarget;
      else if (ratio >= SCORING_WEIGHTS.salaryNearTargetRatio) salaryScore = SCORING_WEIGHTS.salaryNearTarget;
    }
    if (salaryMin != null && offer.salaryMin < salaryMin) {
      salaryScore = SCORING_WEIGHTS.salaryBelowMin;
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
    const ageMs   = (learned?.now?.getTime() ?? Date.now()) - new Date(offer.publishedAt).getTime();
    const ageDays = Math.floor(ageMs / (1_000 * 60 * 60 * 24));
    decayPenalty  = -Math.min(SCORING_WEIGHTS.decayCap, ageDays * SCORING_WEIGHTS.decayPerDay);
  }

  // Learned signals
  let learnedScore = 0;
  if (learned?.learnedDict) {
    const textLower = fullText.toLowerCase();
    let learnedBonus   = 0;
    let learnedPenalty = 0;
    for (const [term, rawScore] of Object.entries(learned.learnedDict.positive)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedBonus += Math.min(SCORING_WEIGHTS.learnedPerTermCap, rawScore * 0.5);
      }
    }
    for (const [term, rawScore] of Object.entries(learned.learnedDict.negative)) {
      if (term.length >= 3 && textLower.includes(term)) {
        learnedPenalty += Math.min(SCORING_WEIGHTS.learnedPerTermCap, rawScore * 0.5);
      }
    }
    learnedScore =
      Math.min(SCORING_WEIGHTS.learnedTotalCap, learnedBonus) -
      Math.min(SCORING_WEIGHTS.learnedTotalCap, learnedPenalty);
  }

  // Company reputation
  let repScore = 0;
  if (learned?.companyReputation && companyLower) {
    const rep = learned.companyReputation[companyLower];
    if (rep !== undefined) {
      if (rep > 3)  repScore =  SCORING_WEIGHTS.companyReputation;
      else if (rep < -3) repScore = -SCORING_WEIGHTS.companyReputation;
    }
  }

  // ── Assemble total ─────────────────────────────────────────────────────────

  const raw =
    base +
    titleMatchScore +
    contractMatchScore +
    skillsScore +
    domainScore +
    salaryScore +
    redFlagPenalty +
    decayPenalty +
    learnedScore +
    repScore +
    aiResult.delta;

  // Mode balanced, no title match → cap at 25 ; domaine obligatoire absent → même plafond
  const capApplied = applyBalancedCap || requiredDomainMissing;
  const capped = capApplied ? Math.min(SCORING_WEIGHTS.balancedCap, raw) : raw;
  const total  = Math.max(0, Math.min(100, capped));

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
    baseScore: base,
    capApplied,
    requiredDomainMissing,
    aiFilterDelta: aiResult.delta,
    aiFilterMatches: aiResult.matches.length > 0 ? aiResult.matches : undefined,
  };
}

function zero(reason: string): ScoreBreakdown {
  return {
    total: 0, disqualified: true, disqualifyReason: reason,
    titleMatchScore: 0, contractMatchScore: 0,
    skillsScore: 0, domainScore: 0, salaryScore: 0,
    learnedScore: 0, decayPenalty: 0, baseScore: 0,
  };
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
