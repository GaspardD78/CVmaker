import { describe, expect, test } from 'bun:test';
import {
  scoreExperienceMatch,
  findSyncCandidates,
  buildAdaptedSnapshot,
  masterEntryToSnapshot,
  hasMeaningfulDivergence,
  mergeDescriptions,
  buildConsolidatedProposal,
  hashSnapshotForIgnore,
  type ExperienceSnapshot,
} from './experience-matching';
import type { MasterEntry } from '@/types/profile';
import type { CVBlock } from '@/types/cv';

function makeEntry(overrides: Partial<MasterEntry> = {}): MasterEntry {
  return {
    id: 'entry-1',
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
    sortOrder: 0,
    tags: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function makeBlock(overrides: Partial<CVBlock> = {}): CVBlock {
  return {
    id: 'block-1',
    cvId: 'cv-1',
    entryId: 'entry-1',
    blockType: 'entry_ref',
    sectionName: null,
    customContent: null,
    sortOrder: 0,
    isVisible: true,
    overrideData: {},
    createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('scoreExperienceMatch', () => {
  test('clear match: same company + overlapping dates, reworded title/description → confident', () => {
    const master = makeEntry();
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      title: 'Senior TA Partner',
      description: '- Recrutement tech senior\n- Pilotage de la marque employeur',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).toBe('confident');
    expect(result.matchedCriteria.company).toBe(true);
    expect(result.matchedCriteria.dates).toBe(true);
  });

  test('company abbreviation / legal suffix variants still score as a strong company match', () => {
    const master = makeEntry({ subtitle: 'Cellenza Consulting' });
    const adapted: ExperienceSnapshot = { ...masterEntryToSnapshot(master), subtitle: 'Cellenza' };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.companyScore).toBeGreaterThanOrEqual(0.82);
  });

  test('date rounding tolerance: "janvier 2020" vs "01/2020" style boundary noise stays confident', () => {
    const master = makeEntry({ startDate: '2020-01', endDate: '2022-06' });
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      startDate: '2019-12', // one month off due to rounding
      endDate: '2022-07',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.dateScore).toBeGreaterThanOrEqual(0.65);
    expect(result.classification).toBe('confident');
  });

  test('ambiguous: same company, very different (non-overlapping, distant) period → surfaced but not confident', () => {
    const master = makeEntry({ subtitle: 'Cellenza', startDate: '2015-01', endDate: '2016-06' });
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      startDate: '2020-01',
      endDate: '2022-06',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).toBe('ambiguous');
    expect(result.matchedCriteria.company).toBe(true);
    expect(result.matchedCriteria.dates).toBe(false);
  });

  test('ambiguous the other direction: overlapping period, unrelated company', () => {
    const master = makeEntry({ subtitle: 'Cellenza', startDate: '2020-01', endDate: '2022-06' });
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      subtitle: 'Totally Unrelated Corp',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).toBe('ambiguous');
    expect(result.matchedCriteria.company).toBe(false);
    expect(result.matchedCriteria.dates).toBe(true);
  });

  test('false positive to avoid: two different experiences, same company, different periods, must never be "confident"', () => {
    // e.g. two separate stints at the same employer years apart — must not be silently merged.
    const master = makeEntry({ subtitle: 'Cellenza', title: 'Consultant', startDate: '2012-01', endDate: '2013-01' });
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      title: 'Senior Manager',
      startDate: '2020-01',
      endDate: '2022-06',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).not.toBe('confident');
  });

  test('no match: unrelated company and unrelated period', () => {
    const master = makeEntry({ subtitle: 'Cellenza', startDate: '2012-01', endDate: '2013-01' });
    const adapted: ExperienceSnapshot = {
      ...masterEntryToSnapshot(master),
      subtitle: 'Totally Unrelated Corp',
      startDate: '2020-01',
      endDate: '2022-06',
    };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).toBe('none');
  });

  test('job title never blocks a match even when very different, since it is a secondary signal', () => {
    const master = makeEntry({ title: 'Talent Acquisition Manager' });
    const adapted: ExperienceSnapshot = { ...masterEntryToSnapshot(master), title: 'Head of People Ops' };
    const result = scoreExperienceMatch(adapted, masterEntryToSnapshot(master));
    expect(result.classification).toBe('confident');
  });
});

describe('buildAdaptedSnapshot / hasMeaningfulDivergence', () => {
  test('no override data → no divergence', () => {
    const master = makeEntry();
    const adapted = buildAdaptedSnapshot({}, master);
    expect(hasMeaningfulDivergence(adapted, masterEntryToSnapshot(master))).toBe(false);
  });

  test('reworded description → divergence detected', () => {
    const master = makeEntry();
    const adapted = buildAdaptedSnapshot({ description: '- Reformulé pour la candidature' }, master);
    expect(hasMeaningfulDivergence(adapted, masterEntryToSnapshot(master))).toBe(true);
  });
});

describe('findSyncCandidates', () => {
  test('finds a candidate for a diverging entry_ref block, ignores unchanged and non-experience blocks', () => {
    const experience = makeEntry({ id: 'exp-1' });
    const skill = makeEntry({ id: 'skill-1', entryType: 'skill', title: 'TypeScript', subtitle: null });
    const blocks: CVBlock[] = [
      makeBlock({ id: 'b1', entryId: 'exp-1', overrideData: { description: '- Nouvelle réalisation ajoutée' } }),
      makeBlock({ id: 'b2', entryId: 'exp-1', overrideData: {} }), // unchanged, must be skipped
      makeBlock({ id: 'b3', entryId: 'skill-1', overrideData: { title: 'TS avancé' } }), // not an experience
    ];
    const candidates = findSyncCandidates(blocks, [experience, skill]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].blockId).toBe('b1');
    expect(candidates[0].bestMatch?.entry.id).toBe('exp-1');
    expect(candidates[0].bestMatch?.score.classification).toBe('confident');
  });

  test('orphaned entry_ref (entryId null) is skipped — out of scope for v1', () => {
    const experience = makeEntry({ id: 'exp-1' });
    const blocks: CVBlock[] = [makeBlock({ id: 'b1', entryId: null })];
    expect(findSyncCandidates(blocks, [experience])).toHaveLength(0);
  });
});

describe('mergeDescriptions / buildConsolidatedProposal', () => {
  test('combines complementary bullets without dropping unique content', () => {
    const merged = mergeDescriptions('- Recrutement tech\n- Sourcing candidats', '- Sourcing candidats\n- Pilotage marque employeur');
    expect(merged).toContain('Recrutement tech');
    expect(merged).toContain('Sourcing candidats');
    expect(merged).toContain('Pilotage marque employeur');
    // No duplicate of the shared bullet.
    expect(merged.split('\n').filter(l => l.includes('Sourcing candidats'))).toHaveLength(1);
  });

  test('drops near-duplicate reformulations of the same idea', () => {
    const merged = mergeDescriptions('- Recrutement de profils techniques', '- Recrutement de profils tech');
    expect(merged.split('\n')).toHaveLength(1);
  });

  test('consolidated proposal keeps master structured facts, merges description', () => {
    const master = makeEntry();
    const adapted = buildAdaptedSnapshot({ description: '- Pilotage marque employeur' }, master);
    const proposal = buildConsolidatedProposal(master, adapted);
    expect(proposal.title).toBe(master.title);
    expect(proposal.subtitle).toBe(master.subtitle);
    expect(proposal.startDate).toBe(master.startDate);
    expect(proposal.description).toContain('Recrutement tech');
    expect(proposal.description).toContain('Pilotage marque employeur');
  });
});

describe('hashSnapshotForIgnore', () => {
  test('is stable for identical content and changes when content changes', () => {
    const master = makeEntry();
    const snapshot = masterEntryToSnapshot(master);
    const hashA = hashSnapshotForIgnore(snapshot);
    const hashB = hashSnapshotForIgnore({ ...snapshot });
    expect(hashA).toBe(hashB);
    const changed = hashSnapshotForIgnore({ ...snapshot, description: 'different' });
    expect(changed).not.toBe(hashA);
  });
});
