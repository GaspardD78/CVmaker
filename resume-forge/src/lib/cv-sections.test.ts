import { describe, it, expect } from 'bun:test';
import { isSectionHeader, isSubHeader, normalizeLabel, parentDisplayFormat, visibleHeaderMask, type SlotKind } from './cv-sections';

const S: SlotKind = 'section';
const B: SlotKind = 'sub';
const C: SlotKind = 'content';
const X: SlotKind = 'skip';

describe('visibleHeaderMask', () => {
  it('garde un titre suivi de contenu, masque un titre sans contenu', () => {
    expect(visibleHeaderMask([S, C, S, S, C, S])).toEqual([true, true, false, true, true, false]);
  });

  it('un contenu « skip » (entrée inconnue, texte vide) ne justifie pas un en-tête', () => {
    expect(visibleHeaderMask([S, X, S, C])).toEqual([false, true, true, true]);
  });

  it('un titre de section est conservé grâce au contenu de ses sous-en-têtes', () => {
    expect(visibleHeaderMask([S, B, C])).toEqual([true, true, true]);
  });

  it('masque un sous-en-tête vide mais garde la section et les autres catégories', () => {
    expect(visibleHeaderMask([S, B, B, C, B])).toEqual([true, false, true, true, false]);
  });

  it('un titre dont les seuls sous-en-têtes sont vides disparaît avec eux', () => {
    expect(visibleHeaderMask([S, B, S, C])).toEqual([false, false, true, true]);
  });

  it('contenu avant tout titre : conservé', () => {
    expect(visibleHeaderMask([C, S, C])).toEqual([true, true, true]);
  });

  it('liste vide', () => {
    expect(visibleHeaderMask([])).toEqual([]);
  });
});

describe('niveau des en-têtes et format hérité', () => {
  const h = (level?: string, displayFormat?: string) => ({
    blockType: 'section_header' as const,
    overrideData: { ...(level ? { level } : {}), ...(displayFormat ? { displayFormat } : {}) },
  });
  const entry = { blockType: 'entry_ref' as const, overrideData: {} };

  it('isSubHeader / isSectionHeader', () => {
    expect(isSubHeader(h('sub'))).toBe(true);
    expect(isSectionHeader(h('sub'))).toBe(false);
    expect(isSectionHeader(h())).toBe(true);
    expect(isSubHeader(entry)).toBe(false);
    expect(isSectionHeader(entry)).toBe(false);
  });

  it('parentDisplayFormat ignore les sous-en-têtes', () => {
    const blocks = [h(undefined, 'comma'), h('sub', 'list'), entry];
    expect(parentDisplayFormat(blocks, 2)).toBe('comma');
    expect(parentDisplayFormat(blocks, 0)).toBeUndefined();
  });

  it('normalizeLabel : casse, accents, espaces', () => {
    expect(normalizeLabel('  Expériences   PROFESSIONNELLES ')).toBe('experiences professionnelles');
    expect(normalizeLabel("Centres d'intérêt")).toBe("centres d'interet");
  });
});
