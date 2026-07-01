import type { CVBlock } from '@/types/cv';
import type { MasterEntry } from '@/types/profile';

/**
 * Deterministic, explainable matching between an experience as displayed in an
 * adapted CV (a `cv_blocks` entry_ref + its `override_data`) and the master
 * profile's `master_entries`. No LLM call — company string distance + date
 * overlap are the primary signals, job title is a secondary, non-blocking one
 * (per the reconciliation feature spec).
 */

// ── Snapshots ─────────────────────────────────────────────────────────────────

/** The effective content of an experience, whichever side it comes from. */
export interface ExperienceSnapshot {
  title: string;
  /** Company / organisation. */
  subtitle: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  /**
   * Verbatim display-only override of the whole date range (from AI
   * `datesOverride`, free text). When present it takes precedence over
   * `startDate`/`endDate` for date-range scoring.
   */
  datesOverrideText?: string | null;
}

export function masterEntryToSnapshot(entry: MasterEntry): ExperienceSnapshot {
  return {
    title: entry.title,
    subtitle: entry.subtitle,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
    description: entry.description,
    datesOverrideText: null,
  };
}

/** Merges a cv_block's override_data over its linked master entry (non-destructive display layer). */
export function buildAdaptedSnapshot(
  overrideData: Record<string, unknown> | null | undefined,
  linkedEntry: MasterEntry,
): ExperienceSnapshot {
  const o = overrideData ?? {};
  const title = typeof o.title === 'string' && o.title.trim() ? o.title : linkedEntry.title;
  const subtitle = typeof o.subtitle === 'string' && o.subtitle.trim() ? o.subtitle : linkedEntry.subtitle;
  const description = typeof o.description === 'string' && o.description.trim() ? o.description : linkedEntry.description;
  const datesOverrideText = typeof o.datesOverride === 'string' && o.datesOverride.trim() ? o.datesOverride : null;
  return {
    title,
    subtitle,
    startDate: linkedEntry.startDate,
    endDate: linkedEntry.endDate,
    isCurrent: linkedEntry.isCurrent,
    description,
    datesOverrideText,
  };
}

/** True when the adapted snapshot actually says something new relative to its own linked entry. */
export function hasMeaningfulDivergence(adapted: ExperienceSnapshot, original: ExperienceSnapshot): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').trim();
  return (
    norm(adapted.title) !== norm(original.title) ||
    norm(adapted.subtitle) !== norm(original.subtitle) ||
    norm(adapted.description) !== norm(original.description) ||
    !!adapted.datesOverrideText
  );
}

// ── String normalization ──────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const COMPANY_LEGAL_SUFFIXES =
  /\b(sas|sasu|sarl|sa|eurl|sci|scop|groupe|group|consulting|consultants|conseil|inc|ltd|llc|corp|corporation|co|gmbh|holding|holdings|societe|société)\b/g;

function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripAccents(raw.toLowerCase())
    .replace(/[.,'’&]/g, ' ')
    .replace(COMPANY_LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripAccents(raw.toLowerCase()).replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

function companyScore(a: string | null, b: string | null): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  return stringSimilarity(na, nb);
}

function titleScore(a: string | null, b: string | null): number {
  return stringSimilarity(normalizeTitle(a), normalizeTitle(b));
}

// ── Date range parsing/scoring ────────────────────────────────────────────────

const FRENCH_MONTHS: Record<string, number> = {
  janv: 1, janvier: 1, jan: 1,
  fevr: 2, fevrier: 2, fev: 2, feb: 2,
  mars: 3, mar: 3,
  avr: 4, avril: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6,
  juil: 7, juillet: 7, jul: 7,
  aout: 8, aug: 8,
  sept: 9, septembre: 9, sep: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, decembre: 12,
};

function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function nowMonthIndex(): number {
  const now = new Date();
  return toMonthIndex(now.getFullYear(), now.getMonth() + 1);
}

/** Parses a single date token ("YYYY-MM", "MM/YYYY", "janvier 2020", "2020"...) into a month index. */
function parseDateToMonthIndex(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = stripAccents(raw.trim().toLowerCase());
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return toMonthIndex(parseInt(m[1], 10), parseInt(m[2], 10));

  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return toMonthIndex(parseInt(m[2], 10), parseInt(m[1], 10));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toMonthIndex(parseInt(m[3], 10), parseInt(m[2], 10));

  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const month = FRENCH_MONTHS[m[1]];
    if (month) return toMonthIndex(parseInt(m[2], 10), month);
  }

  m = s.match(/^(\d{4})$/);
  if (m) return toMonthIndex(parseInt(m[1], 10), 1);

  return null;
}

interface MonthRange {
  start: number;
  end: number;
}

/** Splits a free-text date range override ("2019 - 2021", "janvier 2020 à aujourd'hui"...) into a range. */
function parseDatesOverrideText(text: string): MonthRange | null {
  const parts = text.split(/\s*(?:-|–|—|to|à)\s*/i).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseDateToMonthIndex(parts[0]);
    const isPresent = /present|actuel|aujourd|cours/i.test(parts[1]);
    const end = isPresent ? nowMonthIndex() : parseDateToMonthIndex(parts[1]);
    if (start !== null && end !== null) return { start, end: Math.max(start, end) };
    return null;
  }
  if (parts.length === 1) {
    const start = parseDateToMonthIndex(parts[0]);
    return start !== null ? { start, end: start } : null;
  }
  return null;
}

function rangeOf(s: ExperienceSnapshot): MonthRange | null {
  if (s.datesOverrideText) {
    const parsed = parseDatesOverrideText(s.datesOverrideText);
    if (parsed) return parsed;
    // Unparseable override text — fall back to the structured fields below.
  }
  const start = parseDateToMonthIndex(s.startDate);
  if (start === null) return null;
  const end = s.isCurrent || !s.endDate ? nowMonthIndex() : (parseDateToMonthIndex(s.endDate) ?? start);
  return { start, end: Math.max(start, end) };
}

/** Rounding tolerance (months) absorbing "janvier 2020" vs "01/2020"-style boundary noise. */
export const DATE_TOLERANCE_MONTHS = 2;
/** Neutral score when either side's dates can't be parsed at all. */
export const DATE_SCORE_UNKNOWN = 0.4;

interface DateScoreResult {
  score: number;
  overlap: 'overlapping' | 'close' | 'distant' | 'none' | 'unknown';
}

function dateRangeScore(a: ExperienceSnapshot, b: ExperienceSnapshot): DateScoreResult {
  const rangeA = rangeOf(a);
  const rangeB = rangeOf(b);
  if (!rangeA || !rangeB) return { score: DATE_SCORE_UNKNOWN, overlap: 'unknown' };

  const overlapStart = Math.max(rangeA.start, rangeB.start);
  const overlapEnd = Math.min(rangeA.end, rangeB.end);
  const overlapMonths = overlapEnd - overlapStart + 1;

  if (overlapMonths > 0) {
    const shorterLen = Math.min(rangeA.end - rangeA.start + 1, rangeB.end - rangeB.start + 1);
    const ratio = Math.min(1, overlapMonths / shorterLen);
    return { score: 0.7 + 0.3 * ratio, overlap: 'overlapping' };
  }

  const gap = overlapStart - overlapEnd - 1;
  if (gap <= DATE_TOLERANCE_MONTHS) return { score: 0.6, overlap: 'close' };

  const decayed = Math.max(0, 0.5 - 0.05 * (gap - DATE_TOLERANCE_MONTHS));
  return { score: decayed, overlap: decayed > 0 ? 'distant' : 'none' };
}

// ── Overall scoring + classification ──────────────────────────────────────────

export const CONFIDENT_COMPANY_THRESHOLD = 0.82;
export const CONFIDENT_DATE_THRESHOLD = 0.65;
export const AMBIGUOUS_COMPANY_THRESHOLD = 0.55;
export const AMBIGUOUS_DATE_THRESHOLD = 0.55;
export const TITLE_SIGNAL_THRESHOLD = 0.6;

export const MATCH_WEIGHTS = { company: 0.5, date: 0.4, title: 0.1 } as const;

export type MatchClassification = 'confident' | 'ambiguous' | 'none';

export interface MatchScore {
  companyScore: number;
  dateScore: number;
  titleScore: number;
  /** 0-100, weighted, for display only — classification drives behaviour. */
  overallScore: number;
  classification: MatchClassification;
  /** Which criteria actually contributed to the classification, for the "why" shown in the UI. */
  matchedCriteria: { company: boolean; dates: boolean; title: boolean };
  dateOverlap: DateScoreResult['overlap'];
}

export function scoreExperienceMatch(adapted: ExperienceSnapshot, candidate: ExperienceSnapshot): MatchScore {
  const cScore = companyScore(adapted.subtitle, candidate.subtitle);
  const { score: dScore, overlap } = dateRangeScore(adapted, candidate);
  const tScore = titleScore(adapted.title, candidate.title);

  const overallScore = Math.round(
    (cScore * MATCH_WEIGHTS.company + dScore * MATCH_WEIGHTS.date + tScore * MATCH_WEIGHTS.title) * 100,
  );

  let classification: MatchClassification;
  if (cScore >= CONFIDENT_COMPANY_THRESHOLD && dScore >= CONFIDENT_DATE_THRESHOLD) {
    classification = 'confident';
  } else if (cScore >= AMBIGUOUS_COMPANY_THRESHOLD || dScore >= AMBIGUOUS_DATE_THRESHOLD) {
    // Covers both directions the spec calls out as ambiguous: strong company / weak dates,
    // or strong dates / weak company. Never auto-merged — always surfaced "to confirm".
    classification = 'ambiguous';
  } else {
    classification = 'none';
  }

  return {
    companyScore: cScore,
    dateScore: dScore,
    titleScore: tScore,
    overallScore,
    classification,
    matchedCriteria: {
      company: cScore >= AMBIGUOUS_COMPANY_THRESHOLD,
      dates: dScore >= AMBIGUOUS_DATE_THRESHOLD,
      title: tScore >= TITLE_SIGNAL_THRESHOLD,
    },
    dateOverlap: overlap,
  };
}

// ── Candidate discovery ───────────────────────────────────────────────────────

export interface SyncCandidate {
  blockId: string;
  linkedEntryId: string;
  /** Effective content as shown in the adapted CV. */
  adapted: ExperienceSnapshot;
  /** The entry this block is actually linked to (reference — always shown to the user). */
  linkedEntrySnapshot: ExperienceSnapshot;
  linkedEntry: MasterEntry;
  /** Best-scoring master experience entry across the whole profile (may equal linkedEntry). */
  bestMatch: { entry: MasterEntry; score: MatchScore } | null;
}

/**
 * Finds experience `entry_ref` blocks whose displayed content diverges from
 * their own linked master entry, and scores each against every experience in
 * the profile (not just its own link) so a mismatched/orphaned override still
 * surfaces the right candidate.
 */
export function findSyncCandidates(blocks: CVBlock[], masterEntries: MasterEntry[]): SyncCandidate[] {
  const experienceEntries = masterEntries.filter(e => e.entryType === 'experience');
  const byId = new Map(experienceEntries.map(e => [e.id, e]));
  const candidates: SyncCandidate[] = [];

  for (const block of blocks) {
    if (block.blockType !== 'entry_ref' || !block.entryId) continue;
    const linkedEntry = byId.get(block.entryId);
    if (!linkedEntry) continue; // not an experience, or orphaned (master entry deleted) — out of scope for v1

    const linkedSnapshot = masterEntryToSnapshot(linkedEntry);
    const adapted = buildAdaptedSnapshot(block.overrideData, linkedEntry);
    if (!hasMeaningfulDivergence(adapted, linkedSnapshot)) continue;

    let best: { entry: MasterEntry; score: MatchScore } | null = null;
    for (const candidate of experienceEntries) {
      const score = scoreExperienceMatch(adapted, masterEntryToSnapshot(candidate));
      if (!best || score.overallScore > best.score.overallScore) {
        best = { entry: candidate, score };
      }
    }

    candidates.push({
      blockId: block.id,
      linkedEntryId: linkedEntry.id,
      adapted,
      linkedEntrySnapshot: linkedSnapshot,
      linkedEntry,
      bestMatch: best,
    });
  }

  return candidates;
}

// ── Consolidation ─────────────────────────────────────────────────────────────

function splitBullets(desc: string | null): string[] {
  if (!desc) return [];
  return desc.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function normalizeBulletForDedupe(line: string): string {
  return stripAccents(line.toLowerCase())
    .replace(/^[-*•]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Combines two descriptions line by line, dropping exact and near-duplicate ideas. Never drops unique content. */
export function mergeDescriptions(masterDescription: string | null, variantDescription: string | null): string {
  const masterLines = splitBullets(masterDescription);
  const variantLines = splitBullets(variantDescription);
  const merged = [...masterLines];

  for (const line of variantLines) {
    const key = normalizeBulletForDedupe(line);
    const isDuplicate = merged.some(existing => stringSimilarity(normalizeBulletForDedupe(existing), key) >= 0.8);
    if (isDuplicate) continue;
    merged.push(line);
  }

  return merged.join('\n');
}

/**
 * Default proposal when the block is treated as a brand-new, distinct
 * experience rather than a variant of an existing entry: the adapted CV
 * content wins outright (location/dates aren't independently overridable in
 * the current cv_blocks model, so they still come from the block's own
 * linked entry).
 */
export function buildNewEntryProposal(candidate: SyncCandidate): ConsolidatedProposal {
  return {
    title: candidate.adapted.title,
    subtitle: candidate.adapted.subtitle,
    location: candidate.linkedEntry.location,
    startDate: candidate.linkedEntry.startDate,
    endDate: candidate.linkedEntry.endDate,
    isCurrent: candidate.linkedEntry.isCurrent,
    description: candidate.adapted.description,
  };
}

export interface ConsolidatedProposal {
  title: string;
  subtitle: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

/**
 * Default merge proposal: structured facts (dates/title/company/location) are
 * preserved from the master entry as the reference; only the description is
 * consolidated. Everything remains editable in the review UI before validation.
 */
export function buildConsolidatedProposal(masterEntry: MasterEntry, adapted: ExperienceSnapshot): ConsolidatedProposal {
  return {
    title: masterEntry.title,
    subtitle: masterEntry.subtitle,
    location: masterEntry.location,
    startDate: masterEntry.startDate,
    endDate: masterEntry.endDate,
    isCurrent: masterEntry.isCurrent,
    description: mergeDescriptions(masterEntry.description, adapted.description),
  };
}

// ── "Ignore" bookkeeping (stored in the block's own override_data) ───────────

/** Small deterministic hash so re-running sync doesn't re-prompt an unchanged, already-ignored diff. */
export function hashSnapshotForIgnore(adapted: ExperienceSnapshot): string {
  const payload = JSON.stringify([adapted.title, adapted.subtitle, adapted.description, adapted.datesOverrideText]);
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export const RECONCILIATION_IGNORED_HASH_KEY = '_reconciliationIgnoredHash';
