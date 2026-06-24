import { describe, it, expect } from 'bun:test';
import { parseAiCvResponse, aiEntryToOverrideData } from './ai-cv-response';

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
});
