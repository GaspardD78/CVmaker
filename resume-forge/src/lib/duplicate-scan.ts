import type { MasterEntry } from '@/types/profile';
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
 * through it. Reuses `scoreExperienceMatch` verbatim (company + dates as
 * primary signals, title secondary) — only the pairing/grouping around it is
 * new. Nothing here writes anything: the store applies merges after explicit
 * user validation, and confirmed non-duplicates are persisted as pairs in
 * `duplicate_dismissals` so they never resurface.
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

/**
 * Two master entries are duplicate candidates when both primary signals pass
 * the same thresholds the reconciliation flow uses for its matched-criteria
 * tags: company AND dates. Title stays secondary/non-blocking, exactly like
 * the CV → master matching.
 */
export function isDuplicatePairScore(score: MatchScore): boolean {
  return score.matchedCriteria.company && score.matchedCriteria.dates;
}

export interface DuplicatePair {
  entryIdA: string;
  entryIdB: string;
  score: MatchScore;
}

export interface DuplicateGroup {
  /** Stable identity: sorted member ids — the same members always form the same group id. */
  id: string;
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
 * Scores every experience of the master profile against every other one and
 * clusters matching pairs into connected components, so a triple (or more)
 * duplicated at different times lands in a single group even if one of its
 * pairs is weaker. Pure and idempotent: dismissed pairs are excluded up
 * front, and already-merged entries simply no longer exist.
 */
export function findDuplicateGroups(
  masterEntries: MasterEntry[],
  dismissedPairKeys: ReadonlySet<string> = new Set(),
): DuplicateGroup[] {
  const experiences = masterEntries.filter(e => e.entryType === 'experience');
  const snapshots = new Map(experiences.map(e => [e.id, masterEntryToSnapshot(e)]));

  const parent = new Map<string, string>(experiences.map(e => [e.id, e.id]));
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
  for (let i = 0; i < experiences.length; i++) {
    for (let j = i + 1; j < experiences.length; j++) {
      const a = experiences[i];
      const b = experiences[j];
      if (dismissedPairKeys.has(dismissalPairKey(a.id, b.id))) continue;
      const score = scoreExperienceMatch(snapshots.get(a.id)!, snapshots.get(b.id)!);
      if (!isDuplicatePairScore(score)) continue;
      const [idA, idB] = canonicalPair(a.id, b.id);
      edges.push({ entryIdA: idA, entryIdB: idB, score });
      union(a.id, b.id);
    }
  }

  const membersByRoot = new Map<string, MasterEntry[]>();
  for (const entry of experiences) {
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
      entries: sortGroupEntries(members),
      pairs,
      classification: pairs.every(p => p.score.classification === 'confident') ? 'confident' : 'ambiguous',
      overallScore: Math.round(pairs.reduce((sum, p) => sum + p.score.overallScore, 0) / pairs.length),
    });
  }

  return groups.sort((a, b) => b.overallScore - a.overallScore);
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
