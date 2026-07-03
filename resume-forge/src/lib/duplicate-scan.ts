import type { EntryType, MasterEntry } from '@/types/profile';
import {
  masterEntryToSnapshot,
  scoreExperienceMatch,
  mergeDescriptions,
  type ConsolidatedProposal,
  type MatchScore,
} from '@/lib/experience-matching';

/**
 * One-off duplicate scan of the master profile against itself: legacy
 * duplicates predate the CV → master reconciliation flow and never went
 * through it. Every section is scanned, but entries are only ever compared
 * within their own `entryType`. The scoring reuses `scoreExperienceMatch`
 * verbatim; what changes per type is the admission rule built on top of it:
 * dated types (experience, education, volunteer, project) lean on
 * company/organisation + date overlap, title-driven types (skill, language,
 * interest, certification) lean on near-identical titles. Nothing here writes
 * anything: the store applies merges after explicit user validation, and
 * confirmed non-duplicates are persisted as pairs in `duplicate_dismissals`
 * so they never resurface.
 */

// ── Dismissed pairs ("confirmed non-duplicate") ───────────────────────────────

/** Canonical pair: ids sorted so (A,B) and (B,A) are the same row/key. */
export function canonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function dismissalPairKey(idA: string, idB: string): string {
  const [a, b] = canonicalPair(idA, idB);
  return `${a}|${b}`;
}

/** Pairs to persist when the user ignores a whole group (no member pair may resurface). */
export function pairsForGroupDismissal(entryIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < entryIds.length; i++) {
    for (let j = i + 1; j < entryIds.length; j++) {
      pairs.push(canonicalPair(entryIds[i], entryIds[j]));
    }
  }
  return pairs;
}

/** Pairs to persist when one entry is pulled out of a group ("not a duplicate of these"). */
export function pairsForEntryRemoval(removedId: string, remainingIds: string[]): Array<[string, string]> {
  return remainingIds.map(otherId => canonicalPair(removedId, otherId));
}

// ── Pair admission + grouping ─────────────────────────────────────────────────

/** Types whose duplicates are detected mainly through a near-identical title. */
export const TITLE_DRIVEN_TYPES: ReadonlySet<EntryType> = new Set<EntryType>([
  'skill', 'language', 'interest', 'certification',
]);

/** Title similarity above which two entries of a title-driven type are duplicate candidates. */
export const STRONG_TITLE_THRESHOLD = 0.9;
/** Title similarity above which a title-driven pair is classified 'confident'. */
export const CONFIDENT_TITLE_THRESHOLD = 0.95;

/**
 * Per-type admission rule. Experiences keep the historical rule (company AND
 * dates over the reconciliation thresholds, title secondary/non-blocking).
 * Other dated types accept a near-identical title as a substitute for dates,
 * because their dates are often missing. Title-driven types only need a
 * near-identical title.
 */
export function isDuplicatePairScore(entryType: EntryType, score: MatchScore): boolean {
  switch (entryType) {
    case 'experience':
      return score.matchedCriteria.company && score.matchedCriteria.dates;
    case 'education':
    case 'volunteer':
      return score.matchedCriteria.company
        && (score.matchedCriteria.dates || score.titleScore >= STRONG_TITLE_THRESHOLD);
    case 'project':
      return score.titleScore >= STRONG_TITLE_THRESHOLD
        || (score.matchedCriteria.company && score.matchedCriteria.dates);
    case 'certification':
      return score.titleScore >= STRONG_TITLE_THRESHOLD
        || (score.matchedCriteria.company && score.titleScore >= 0.8);
    case 'skill':
    case 'language':
    case 'interest':
      return score.titleScore >= STRONG_TITLE_THRESHOLD;
  }
}

/**
 * The effective classification of an admitted pair. Dated types reuse the
 * score's own classification (company/date thresholds); title-driven types
 * derive it from title similarity, since their company/date scores are mostly
 * noise (no dates, often no subtitle).
 */
function pairClassification(entryType: EntryType, score: MatchScore): 'confident' | 'ambiguous' {
  if (TITLE_DRIVEN_TYPES.has(entryType)) {
    return score.titleScore >= CONFIDENT_TITLE_THRESHOLD ? 'confident' : 'ambiguous';
  }
  return score.classification === 'confident' ? 'confident' : 'ambiguous';
}

/** 0-100 display score of an admitted pair, weighted per type family. */
function pairDisplayScore(entryType: EntryType, score: MatchScore): number {
  if (TITLE_DRIVEN_TYPES.has(entryType)) return Math.round(score.titleScore * 100);
  return score.overallScore;
}

export interface DuplicatePair {
  entryIdA: string;
  entryIdB: string;
  score: MatchScore;
  /** Type-aware classification (see `pairClassification`). */
  classification: 'confident' | 'ambiguous';
  /** Type-aware 0-100 score, display only. */
  displayScore: number;
}

export interface DuplicateGroup {
  /** Stable identity: sorted member ids — the same members always form the same group id. */
  id: string;
  /** All members share this entry type — entries are never compared across sections. */
  entryType: EntryType;
  /** Members, oldest first — the first entry is kept on merge, the others are absorbed into it. */
  entries: MasterEntry[];
  /** The pairwise matches that hold this group together. */
  pairs: DuplicatePair[];
  /** 'confident' only when every pair in the group is confident. */
  classification: 'confident' | 'ambiguous';
  /** Average pairwise score, 0-100, display only. */
  overallScore: number;
}

function sortGroupEntries(entries: MasterEntry[]): MasterEntry[] {
  return [...entries].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
}

/**
 * Scores every entry of the master profile against every other one of the
 * same type and clusters matching pairs into connected components, so a
 * triple (or more) duplicated at different times lands in a single group even
 * if one of its pairs is weaker. Pure and idempotent: dismissed pairs are
 * excluded up front, and already-merged entries simply no longer exist.
 */
export function findDuplicateGroups(
  masterEntries: MasterEntry[],
  dismissedPairKeys: ReadonlySet<string> = new Set(),
): DuplicateGroup[] {
  const byType = new Map<EntryType, MasterEntry[]>();
  for (const entry of masterEntries) {
    const list = byType.get(entry.entryType);
    if (list) list.push(entry);
    else byType.set(entry.entryType, [entry]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [entryType, entries] of byType) {
    if (entries.length < 2) continue;
    groups.push(...findGroupsWithinType(entryType, entries, dismissedPairKeys));
  }

  return groups.sort((a, b) => b.overallScore - a.overallScore);
}

function findGroupsWithinType(
  entryType: EntryType,
  typeEntries: MasterEntry[],
  dismissedPairKeys: ReadonlySet<string>,
): DuplicateGroup[] {
  const snapshots = new Map(typeEntries.map(e => [e.id, masterEntryToSnapshot(e)]));

  const parent = new Map<string, string>(typeEntries.map(e => [e.id, e.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  const edges: DuplicatePair[] = [];
  for (let i = 0; i < typeEntries.length; i++) {
    for (let j = i + 1; j < typeEntries.length; j++) {
      const a = typeEntries[i];
      const b = typeEntries[j];
      if (dismissedPairKeys.has(dismissalPairKey(a.id, b.id))) continue;
      const score = scoreExperienceMatch(snapshots.get(a.id)!, snapshots.get(b.id)!);
      if (!isDuplicatePairScore(entryType, score)) continue;
      const [idA, idB] = canonicalPair(a.id, b.id);
      edges.push({
        entryIdA: idA,
        entryIdB: idB,
        score,
        classification: pairClassification(entryType, score),
        displayScore: pairDisplayScore(entryType, score),
      });
      union(a.id, b.id);
    }
  }

  const membersByRoot = new Map<string, MasterEntry[]>();
  for (const entry of typeEntries) {
    const root = find(entry.id);
    const members = membersByRoot.get(root);
    if (members) members.push(entry);
    else membersByRoot.set(root, [entry]);
  }

  const groups: DuplicateGroup[] = [];
  for (const members of membersByRoot.values()) {
    if (members.length < 2) continue;
    const memberIds = new Set(members.map(m => m.id));
    const pairs = edges.filter(e => memberIds.has(e.entryIdA) && memberIds.has(e.entryIdB));
    groups.push({
      id: [...memberIds].sort().join('+'),
      entryType,
      entries: sortGroupEntries(members),
      pairs,
      classification: pairs.every(p => p.classification === 'confident') ? 'confident' : 'ambiguous',
      overallScore: Math.round(pairs.reduce((sum, p) => sum + p.displayScore, 0) / pairs.length),
    });
  }

  return groups;
}

// ── Consolidation ─────────────────────────────────────────────────────────────

/**
 * Default merge proposal for a whole group — same principle as the
 * reconciliation flow's `buildConsolidatedProposal`: structured facts come
 * from the reference entry (the oldest one, which will be kept), descriptions
 * of every member are folded in without dropping unique content. Fully
 * editable in the review UI before validation.
 */
export function buildGroupProposal(sortedEntries: MasterEntry[]): ConsolidatedProposal {
  const [primary, ...rest] = sortedEntries;
  let description = primary.description;
  for (const entry of rest) {
    description = mergeDescriptions(description, entry.description);
  }
  return {
    title: primary.title,
    subtitle: primary.subtitle,
    location: primary.location,
    startDate: primary.startDate,
    endDate: primary.endDate,
    isCurrent: primary.isCurrent,
    description,
  };
}

/** The pairwise score between the kept entry and one absorbed entry, for the audit trail. */
export function pairScoreWithin(group: DuplicateGroup, idA: string, idB: string): MatchScore | null {
  const [a, b] = canonicalPair(idA, idB);
  return group.pairs.find(p => p.entryIdA === a && p.entryIdB === b)?.score ?? null;
}
