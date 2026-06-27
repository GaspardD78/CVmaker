import { describe, it, expect } from 'bun:test';
import {
  parseAiCvResponse,
  aiEntryToOverrideData,
  planCvBlockOrder,
  type OrderableBlock,
} from './ai-cv-response';

describe('parseAiCvResponse', () => {
  it('parses the legacy schema (no overrides, no suggestions) unchanged', () => {
    const raw = JSON.stringify({
      title: 'Dev',
      summary: 'Accroche',
      entries: [
        { id: 'a', visible: true, description: '• x' },
        { id: 'b', visible: false },
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.title).toBe('Dev');
    expect(result.summary).toBe('Accroche');
    expect(result.entries).toEqual([
      { id: 'a', visible: true, description: '• x' },
      { id: 'b', visible: false },
    ]);
    expect(result.suggestedEntries).toEqual([]);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"entries":[{"id":"a","visible":true}]}\n```';
    const result = parseAiCvResponse(raw);
    expect(result.entries).toEqual([{ id: 'a', visible: true }]);
  });

  it('defaults visible to true and only hides on explicit false', () => {
    const raw = JSON.stringify({ entries: [{ id: 'a' }, { id: 'b', visible: false }] });
    const result = parseAiCvResponse(raw);
    expect(result.entries[0].visible).toBe(true);
    expect(result.entries[1].visible).toBe(false);
  });

  it('parses display overrides and keeps multiline descriptions', () => {
    const raw = JSON.stringify({
      entries: [
        {
          id: 'a',
          visible: true,
          description: '• line 1\n• line 2',
          titleOverride: 'Chargé de recrutement',
          companyOverride: 'ACME',
          datesOverride: '2021 - 2023',
        },
      ],
    });
    const [entry] = parseAiCvResponse(raw).entries;
    expect(entry.description).toBe('• line 1\n• line 2');
    expect(entry.titleOverride).toBe('Chargé de recrutement');
    expect(entry.companyOverride).toBe('ACME');
    expect(entry.datesOverride).toBe('2021 - 2023');
  });

  it('drops malformed / empty override fields (clean fallback)', () => {
    const raw = JSON.stringify({
      entries: [
        { id: 'a', visible: true, titleOverride: '   ', companyOverride: 42, datesOverride: null },
      ],
    });
    const [entry] = parseAiCvResponse(raw).entries;
    expect(entry.titleOverride).toBeUndefined();
    expect(entry.companyOverride).toBeUndefined();
    expect(entry.datesOverride).toBeUndefined();
  });

  it('drops entries without a usable id', () => {
    const raw = JSON.stringify({
      entries: [{ id: '', visible: true }, { visible: true }, { id: 'ok', visible: true }, null, 'bad'],
    });
    const result = parseAiCvResponse(raw);
    expect(result.entries).toEqual([{ id: 'ok', visible: true }]);
  });

  it('returns empty arrays when entries / suggestedEntries are missing or not arrays', () => {
    expect(parseAiCvResponse('{}').entries).toEqual([]);
    expect(parseAiCvResponse('{}').suggestedEntries).toEqual([]);
    expect(parseAiCvResponse('{"entries":"nope"}').entries).toEqual([]);
  });

  it('validates suggestedEntries and filters invalid ones', () => {
    const raw = JSON.stringify({
      suggestedEntries: [
        { entryType: 'experience', title: 'Lead', subtitle: 'ACME', isCurrent: true, reason: 'pertinent' },
        { entryType: 'not-a-type', title: 'X' }, // invalid type → dropped
        { entryType: 'skill' }, // missing title → dropped
        { title: 'no type' }, // missing type → dropped
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.suggestedEntries).toEqual([
      { entryType: 'experience', title: 'Lead', subtitle: 'ACME', isCurrent: true, reason: 'pertinent' },
    ]);
  });

  it('keeps isCurrent only when it is a real boolean', () => {
    const raw = JSON.stringify({
      suggestedEntries: [{ entryType: 'experience', title: 'A', isCurrent: 'true' }],
    });
    expect(parseAiCvResponse(raw).suggestedEntries[0].isCurrent).toBeUndefined();
  });

  it('throws on non-JSON input', () => {
    expect(() => parseAiCvResponse('not json at all')).toThrow();
  });

  it('throws when the root is not an object', () => {
    expect(() => parseAiCvResponse('[1,2,3]')).toThrow();
    expect(() => parseAiCvResponse('"a string"')).toThrow();
  });
});

describe('aiEntryToOverrideData', () => {
  it('maps display overrides onto the generic merge keys', () => {
    const patch = aiEntryToOverrideData(
      {
        id: 'a',
        visible: true,
        description: '• new',
        titleOverride: 'New Title',
        companyOverride: 'New Co',
        datesOverride: '2020 - 2022',
      },
      {},
    );
    expect(patch).toEqual({
      description: '• new',
      title: 'New Title',
      subtitle: 'New Co',
      datesOverride: '2020 - 2022',
    });
  });

  it('merges over existing overrides without clobbering unrelated keys', () => {
    const patch = aiEntryToOverrideData(
      { id: 'a', visible: true, titleOverride: 'T' },
      { displayFormat: 'badges', subtitle: 'keep-me' },
    );
    expect(patch.displayFormat).toBe('badges');
    expect(patch.subtitle).toBe('keep-me'); // companyOverride absent → not touched
    expect(patch.title).toBe('T');
  });

  it('does not add keys for absent overrides (backward compatible)', () => {
    const patch = aiEntryToOverrideData({ id: 'a', visible: true }, undefined);
    expect(patch).toEqual({});
  });

  it('applies only the description when it is the only field (legacy behaviour)', () => {
    const patch = aiEntryToOverrideData({ id: 'a', visible: true, description: '• d' }, { title: 'old' });
    expect(patch).toEqual({ title: 'old', description: '• d' });
  });

  it('maps subtitleOverride onto subtitle and wins over companyOverride', () => {
    const patch = aiEntryToOverrideData(
      { id: 'a', visible: true, companyOverride: 'Co', subtitleOverride: 'Courant - C1' },
      {},
    );
    expect(patch.subtitle).toBe('Courant - C1');
  });
});

describe('parseAiCvResponse — restructuration fields', () => {
  it('parses entryOrder, sectionOrder and skillGroups', () => {
    const raw = JSON.stringify({
      entries: [{ id: 'a', visible: true }],
      entryOrder: ['b', 'a', '  ', 'b'],
      sectionOrder: ['Compétences', 'Formations'],
      skillGroups: [
        { category: 'Langages', entryIds: ['s1', 's2'] },
        { category: 'Outils', entryIds: ['s3'] },
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.entryOrder).toEqual(['b', 'a']); // trimmed empty + dedup dropped
    expect(result.sectionOrder).toEqual(['Compétences', 'Formations']);
    expect(result.skillGroups).toEqual([
      { category: 'Langages', entryIds: ['s1', 's2'] },
      { category: 'Outils', entryIds: ['s3'] },
    ]);
  });

  it('drops skill groups without a category or without entry IDs', () => {
    const raw = JSON.stringify({
      entries: [],
      skillGroups: [
        { category: 'Valide', entryIds: ['s1'] },
        { category: '  ', entryIds: ['s2'] }, // empty category → dropped
        { category: 'Vide', entryIds: [] }, // no IDs → dropped
        { entryIds: ['s3'] }, // no category → dropped
      ],
    });
    expect(parseAiCvResponse(raw).skillGroups).toEqual([{ category: 'Valide', entryIds: ['s1'] }]);
  });

  it('leaves restructuration fields undefined when absent or empty', () => {
    const result = parseAiCvResponse('{"entries":[]}');
    expect(result.entryOrder).toBeUndefined();
    expect(result.sectionOrder).toBeUndefined();
    expect(result.skillGroups).toBeUndefined();
    expect(parseAiCvResponse('{"entries":[],"entryOrder":[]}').entryOrder).toBeUndefined();
  });
});

describe('planCvBlockOrder', () => {
  // Helper to build a simple CV layout: two sections each with entries.
  const block = (
    id: string,
    blockType: OrderableBlock['blockType'],
    extra: Partial<OrderableBlock> = {},
  ): OrderableBlock => ({ id, blockType, sectionName: null, entryId: null, ...extra });

  it('returns the same flat order when no directives are given', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Expériences Professionnelles' }),
      block('e1', 'entry_ref', { entryId: 'exp1' }),
      block('e2', 'entry_ref', { entryId: 'exp2' }),
    ];
    expect(planCvBlockOrder(blocks, {})).toEqual(['h1', 'e1', 'e2']);
  });

  it('reorders entries within their section, ranked first then originals', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      block('c', 'entry_ref', { entryId: 's3' }),
    ];
    expect(planCvBlockOrder(blocks, { entryOrder: ['s3', 's1'] })).toEqual(['h1', 'c', 'a', 'b']);
  });

  it('reorders sections by label (case/space-insensitive), unranked last', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Expériences Professionnelles' }),
      block('e1', 'entry_ref', { entryId: 'exp1' }),
      block('h2', 'section_header', { sectionName: 'Compétences' }),
      block('s1', 'entry_ref', { entryId: 'sk1' }),
      block('h3', 'section_header', { sectionName: 'Langues' }),
      block('l1', 'entry_ref', { entryId: 'la1' }),
    ];
    const order = planCvBlockOrder(blocks, { sectionOrder: ['compétences', 'EXPÉRIENCES PROFESSIONNELLES'] });
    expect(order).toEqual(['h2', 's1', 'h1', 'e1', 'h3', 'l1']);
  });

  it('regroups skills under category sub-headers (group 0 = existing header)', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      block('c', 'entry_ref', { entryId: 's3' }),
      // Newly created sub-header, appended at the tail before reordering:
      block('grpH', 'section_header', { sectionName: 'Outils' }),
    ];
    const order = planCvBlockOrder(blocks, {
      skillGroups: [
        { headerBlockId: 'skH', entryIds: ['s2'] },
        { headerBlockId: 'grpH', entryIds: ['s3'] },
      ],
    });
    // skH (=Langages/group0) → s2, then grpH (=Outils) → s3, leftover s1 at the end.
    expect(order).toEqual(['skH', 'b', 'grpH', 'c', 'a']);
  });

  it('never drops a block, even an orphan sub-header', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('orphan', 'section_header', { sectionName: 'Inutilisé' }),
    ];
    const order = planCvBlockOrder(blocks, {
      skillGroups: [{ headerBlockId: 'skH', entryIds: ['s1'] }],
    });
    expect(order.sort()).toEqual(['a', 'orphan', 'skH']);
    expect(new Set(order).size).toBe(3);
  });
});
