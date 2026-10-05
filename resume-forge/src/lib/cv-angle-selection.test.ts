import { describe, expect, it } from 'bun:test';
import { angleOptions, selectionSnapshot } from './cv-angle-selection';
import { fieldsToRow, rowToAngle } from './cv-angles';
import { SOC_ANGLE, makeAngleEntries } from './test-helpers/angle-fixtures';

const entries = makeAngleEntries();
const library = [rowToAngle({ id: 'a1', profile_id: 'p1', ...fieldsToRow({ ...SOC_ANGLE, slug: 'soc' }) })];

describe('angleOptions', () => {
  it('bibliothèque : angle résolu d\'après les tags', () => {
    const { angle } = angleOptions({ mode: 'library', angleId: 'a1' }, library, entries);
    expect(angle?.leadEntryIds).toEqual(['x1', 'k1']);
    expect(angle?.hideEntryIds).toEqual(['x2', 'x3', 'i1']);
  });
  it('auto : toute la bibliothèque à choisir ; aucun angle : rien', () => {
    expect(angleOptions({ mode: 'auto' }, library, entries).angleChoices).toHaveLength(1);
    expect(angleOptions({ mode: 'none' }, library, entries)).toEqual({});
    expect(angleOptions({ mode: 'library', angleId: 'zz' }, library, entries)).toEqual({});
  });
  it('proposition : utilisée telle quelle', () => {
    const proposal = { ...SOC_ANGLE, slug: null, leadEntryIds: ['k2', 'x1'] };
    expect(angleOptions({ mode: 'proposal', proposal }, library, entries).angle).toBe(proposal);
  });
});

describe('selectionSnapshot (cv.settings.cvAngle)', () => {
  it('bibliothèque, proposition, auto, aucun', () => {
    expect(selectionSnapshot({ mode: 'library', angleId: 'a1' }, library, entries)).toMatchObject({ slug: 'soc', label: 'Analyste SOC', source: 'library', leadEntryIds: ['x1', 'k1'] });
    expect(selectionSnapshot({ mode: 'proposal', proposal: { ...SOC_ANGLE, slug: null } }, library, entries)?.source).toBe('proposal');
    expect(selectionSnapshot({ mode: 'auto' }, library, entries, SOC_ANGLE)?.source).toBe('auto');
    expect(selectionSnapshot({ mode: 'auto' }, library, entries)).toBeNull();
    expect(selectionSnapshot({ mode: 'none' }, library, entries)).toBeNull();
  });
});
