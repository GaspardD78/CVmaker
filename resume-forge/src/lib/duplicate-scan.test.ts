import { describe, expect, test } from 'bun:test';
import {
  findDuplicateGroups,
  buildGroupProposal,
  canonicalPair,
  dismissalPairKey,
  pairsForGroupDismissal,
  pairsForEntryRemoval,
  pairScoreWithin,
} from './duplicate-scan';
import type { MasterEntry } from '@/types/profile';

let idCounter = 0;
function makeEntry(overrides: Partial<MasterEntry> = {}): MasterEntry {
  idCounter++;
  return {
    id: `entry-${idCounter}`,
    profileId: 'profile-1',
    entryType: 'experience',
    title: 'Talent Acquisition Manager',
    subtitle: 'Cellenza',
    location: 'Paris',
    startDate: '2020-01',
    endDate: '2022-06',
    isCurrent: false,
    description: '- Recrutement tech\n- Sourcing candidats',
    metadata: {},
    sortOrder: idCounter,
    tags: [],
    createdAt: `2024-01-${String(idCounter).padStart(2, '0')}`,
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

describe('findDuplicateGroups', () => {
  test('pair of legacy duplicates (same company, overlapping dates, reworded title) → one group of 2', () => {
    const a = makeEntry({ title: 'Talent Acquisition Manager' });
    const b = makeEntry({ title: 'Responsable Recrutement', description: '- Pilotage marque employeur' });
    const groups = findDuplicateGroups([a, b]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map(e => e.id).sort()).toEqual([a.id, b.id].sort());
    expect(groups[0].pairs).toHaveLength(1);
  });

  test('experience duplicated three times lands in a single group of 3, not isolated pairs', () => {
    const a = makeEntry();
    const b = makeEntry({ title: 'TA Manager' });
    const c = makeEntry({ subtitle: 'Cellenza Consulting', startDate: '2020-02' });
    const groups = findDuplicateGroups([a, b, c]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
    // Complete match: all three pairwise edges hold the group together.
    expect(groups[0].pairs).toHaveLength(3);
  });

  test('transitive grouping: A~B and B~C suffice even if A and C differ more', () => {
    // A and C diverge on both company spelling and dates; B bridges them.
    const a = makeEntry({ subtitle: 'Cellenza', startDate: '2020-01', endDate: '2021-06' });
    const b = makeEntry({ subtitle: 'Cellenza Consulting', startDate: '2020-01', endDate: '2022-06' });
    const c = makeEntry({ subtitle: 'Cellenza Consulting', startDate: '2022-01', endDate: '2022-06' });
    const groups = findDuplicateGroups([a, b, c]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });

  test('clean profile: distinct companies and periods → no groups at all', () => {
    const a = makeEntry({ subtitle: 'Cellenza', startDate: '2020-01', endDate: '2022-06' });
    const b = makeEntry({ subtitle: 'Datadog', title: 'SRE', startDate: '2015-01', endDate: '2017-06' });
    const c = makeEntry({ subtitle: 'OVHcloud', title: 'Dev', startDate: '2010-01', endDate: '2012-06' });

    expect(findDuplicateGroups([a, b, c])).toHaveLength(0);
  });

  test('two distinct positions at the same company with distant periods are not duplicates', () => {
    const junior = makeEntry({ title: 'Développeur junior', startDate: '2012-01', endDate: '2014-06' });
    const lead = makeEntry({ title: 'Lead développeur', startDate: '2019-01', endDate: '2022-06' });

    expect(findDuplicateGroups([junior, lead])).toHaveLength(0);
  });

  test('non-experience entries are never scanned', () => {
    const a = makeEntry({ entryType: 'education', title: 'Master RH', subtitle: 'Université Paris 1' });
    const b = makeEntry({ entryType: 'education', title: 'Master RH', subtitle: 'Université Paris 1' });

    expect(findDuplicateGroups([a, b])).toHaveLength(0);
  });

  test('dismissed pair ("confirmed non-duplicate") never resurfaces on re-scan', () => {
    const a = makeEntry();
    const b = makeEntry({ title: 'TA Manager' });

    expect(findDuplicateGroups([a, b])).toHaveLength(1);

    const dismissed = new Set([dismissalPairKey(a.id, b.id)]);
    expect(findDuplicateGroups([a, b], dismissed)).toHaveLength(0);
    // Idempotent: re-running the scan gives the same empty result.
    expect(findDuplicateGroups([a, b], dismissed)).toHaveLength(0);
  });

  test('removing a false positive from a group of 3 keeps the remaining pair on re-scan', () => {
    const a = makeEntry();
    const b = makeEntry({ title: 'TA Manager' });
    const falsePositive = makeEntry({ title: 'Consultant recrutement' });

    const [group] = findDuplicateGroups([a, b, falsePositive]);
    expect(group.entries).toHaveLength(3);

    const removalPairs = pairsForEntryRemoval(falsePositive.id, [a.id, b.id]);
    const dismissed = new Set(removalPairs.map(([x, y]) => dismissalPairKey(x, y)));
    const rescanned = findDuplicateGroups([a, b, falsePositive], dismissed);

    expect(rescanned).toHaveLength(1);
    expect(rescanned[0].entries.map(e => e.id).sort()).toEqual([a.id, b.id].sort());
  });

  test('group members are sorted oldest first (the kept reference entry)', () => {
    const older = makeEntry({ createdAt: '2023-05-01' });
    const newer = makeEntry({ createdAt: '2024-06-01' });
    const [group] = findDuplicateGroups([newer, older]);

    expect(group.entries[0].id).toBe(older.id);
  });

  test('group id is stable regardless of entry order', () => {
    const a = makeEntry();
    const b = makeEntry();
    const [g1] = findDuplicateGroups([a, b]);
    const [g2] = findDuplicateGroups([b, a]);

    expect(g1.id).toBe(g2.id);
  });
});

describe('dismissal pair helpers', () => {
  test('canonicalPair orders ids so (A,B) and (B,A) collapse to one row', () => {
    expect(canonicalPair('z', 'a')).toEqual(['a', 'z']);
    expect(dismissalPairKey('z', 'a')).toBe(dismissalPairKey('a', 'z'));
  });

  test('ignoring a group of 3 dismisses all 3 member pairs', () => {
    const pairs = pairsForGroupDismissal(['c', 'a', 'b']);
    expect(pairs).toHaveLength(3);
    for (const [x, y] of pairs) expect(x < y).toBe(true);
  });

  test('removing one entry dismisses only its pairs with the remaining members', () => {
    const pairs = pairsForEntryRemoval('x', ['a', 'z']);
    expect(pairs).toEqual([['a', 'x'], ['x', 'z']]);
  });
});

describe('buildGroupProposal', () => {
  test('keeps structured facts from the oldest entry and folds all descriptions without duplicates', () => {
    const primary = makeEntry({
      createdAt: '2023-01-01',
      startDate: '2020-01',
      endDate: '2022-06',
      description: '- Recrutement tech\n- Sourcing candidats',
    });
    const dupe1 = makeEntry({
      createdAt: '2023-06-01',
      title: 'TA Manager',
      description: '- Recrutement tech\n- Pilotage marque employeur',
    });
    const dupe2 = makeEntry({
      createdAt: '2024-01-01',
      description: '- Sourcing candidats\n- Mise en place ATS',
    });

    const [group] = findDuplicateGroups([dupe2, primary, dupe1]);
    const proposal = buildGroupProposal(group.entries);

    expect(proposal.title).toBe(primary.title);
    expect(proposal.startDate).toBe('2020-01');
    const lines = (proposal.description ?? '').split('\n');
    expect(lines).toContain('- Recrutement tech');
    expect(lines).toContain('- Sourcing candidats');
    expect(lines).toContain('- Pilotage marque employeur');
    expect(lines).toContain('- Mise en place ATS');
    // Duplicated bullets appear once.
    expect(lines.filter(l => l === '- Recrutement tech')).toHaveLength(1);
    expect(lines.filter(l => l === '- Sourcing candidats')).toHaveLength(1);
  });
});

describe('pairScoreWithin', () => {
  test('returns the pairwise score for the audit trail, or null for non-edges', () => {
    const a = makeEntry();
    const b = makeEntry({ title: 'TA Manager' });
    const [group] = findDuplicateGroups([a, b]);

    expect(pairScoreWithin(group, a.id, b.id)).not.toBeNull();
    expect(pairScoreWithin(group, b.id, a.id)).not.toBeNull();
    expect(pairScoreWithin(group, a.id, 'unknown-id')).toBeNull();
  });
});
