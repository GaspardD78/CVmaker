import { describe, it, expect } from 'bun:test';
import { applyAiCvToBlocks } from './apply-ai-cv';
import type { AiCvResponse } from './ai-cv-response';
import { makeBlocks, makeEntries, makeFakeStore } from './test-helpers/cv-fixtures';

const entries = makeEntries();

function response(extra: Partial<AiCvResponse> = {}): AiCvResponse {
  return { entries: [], suggestedEntries: [], ...extra };
}

const skillGroups = [
  { category: 'Outils SOC', entryIds: ['s1', 's9', 's10', 's3'] },
  { category: 'Langages', entryIds: ['s2', 's8'] },
  { category: 'Systèmes', entryIds: ['s6', 's5', 's7', 's4'] },
];

function headerNames(store: ReturnType<typeof makeFakeStore>): string[] {
  return store.sorted().filter(b => b.blockType === 'section_header').map(b => b.sectionName ?? '');
}

describe('applyAiCvToBlocks - A : la section « Compétences » est conservée', () => {
  it('garde l\'en-tête « Compétences » et crée des sous-en-têtes de catégorie', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({ skillGroups }), { store: () => store, entries });

    const headers = store.sorted().filter(b => b.blockType === 'section_header');
    const skills = headers.find(h => h.sectionName === 'Compétences');
    expect(skills).toBeDefined();
    expect(skills!.overrideData.level).not.toBe('sub');
    const subs = headers.filter(h => h.overrideData.level === 'sub');
    expect(subs.map(h => h.sectionName)).toEqual(['Outils SOC', 'Langages', 'Systèmes']);
  });

  it('place chaque sous-en-tête sous « Compétences », avec ses compétences', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({ skillGroups }), { store: () => store, entries });
    const ordered = store.sorted();
    const start = ordered.findIndex(b => b.sectionName === 'Compétences');
    const sub2 = ordered.findIndex(b => b.sectionName === 'Langages');
    expect(ordered[start + 1].sectionName).toBe('Outils SOC');
    expect(ordered.slice(sub2 + 1, sub2 + 3).map(b => b.entryId)).toEqual(['s2', 's8']);
  });

  it('hérite du displayFormat de l\'en-tête parent', async () => {
    const blocks = makeBlocks(entries).map(b => (b.id === 'h-skill' ? { ...b, overrideData: { displayFormat: 'comma' } } : b));
    const store = makeFakeStore(blocks);
    await applyAiCvToBlocks('cv1', response({ skillGroups }), { store: () => store, entries });
    const subs = store.sorted().filter(b => b.overrideData.level === 'sub');
    expect(subs.every(s => s.overrideData.displayFormat === 'comma')).toBe(true);
  });

  it('est idempotent : réappliquer le même JSON ne duplique aucun sous-en-tête', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const data = response({ skillGroups });
    await applyAiCvToBlocks('cv1', data, { store: () => store, entries });
    const firstCount = store.currentCvBlocks.length;
    await applyAiCvToBlocks('cv1', data, { store: () => store, entries });
    expect(store.currentCvBlocks.length).toBe(firstCount);
    expect(headerNames(store).filter(n => n === 'Langages')).toHaveLength(1);
  });

  it('ignore skillGroups sous le seuil (moins de 8 compétences visibles)', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const hide = ['s3', 's4', 's5', 's6'].map(id => ({ id, visible: false }));
    await applyAiCvToBlocks('cv1', response({ entries: hide, skillGroups }), { store: () => store, entries });
    expect(store.currentCvBlocks.some(b => b.overrideData.level === 'sub')).toBe(false);
    expect(headerNames(store)).toContain('Compétences');
  });

  it('ignore skillGroups quand un groupe a moins de 2 compétences', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const groups = [
      { category: 'A', entryIds: ['s1', 's2', 's3', 's4', 's5'] },
      { category: 'B', entryIds: ['s6'] },
    ];
    await applyAiCvToBlocks('cv1', response({ skillGroups: groups }), { store: () => store, entries });
    expect(store.currentCvBlocks.some(b => b.overrideData.level === 'sub')).toBe(false);
  });

  it('ne perd aucun bloc', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const before = store.currentCvBlocks.map(b => b.id);
    await applyAiCvToBlocks('cv1', response({ skillGroups }), { store: () => store, entries });
    const after = new Set(store.currentCvBlocks.map(b => b.id));
    for (const id of before) expect(after.has(id)).toBe(true);
  });
});

describe('applyAiCvToBlocks - D : pertinence de la section « Langues »', () => {
  const langBlocks = (store: ReturnType<typeof makeFakeStore>) =>
    store.currentCvBlocks.filter(b => b.entryId === 'l1' || b.entryId === 'l2');

  it('masque les langues quand seule la langue du CV est renseignée', async () => {
    const onlyFr = entries.filter(e => e.id !== 'l2');
    const store = makeFakeStore(makeBlocks(onlyFr));
    await applyAiCvToBlocks('cv1', response(), { store: () => store, entries: onlyFr });
    expect(langBlocks(store).every(b => !b.isVisible)).toBe(true);
  });

  it('garde les langues quand une autre langue est renseignée avec un niveau', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response(), { store: () => store, entries });
    expect(langBlocks(store).every(b => b.isVisible)).toBe(true);
  });

  it('masque une langue sans niveau (non exploitable)', async () => {
    const noLevel = entries.map(e => (e.id === 'l2' ? { ...e, subtitle: null } : e));
    const store = makeFakeStore(makeBlocks(noLevel));
    await applyAiCvToBlocks('cv1', response(), { store: () => store, entries: noLevel });
    expect(langBlocks(store).every(b => !b.isVisible)).toBe(true);
  });

  it('place la langue de l\'annonce en premier', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({ analyse: { langueAnnonce: 'en', indispensables: [], importants: [], correspondances: [], ecarts: [] } }), {
      store: () => store, entries,
    });
    const order = store.sorted().filter(b => b.entryId === 'l1' || b.entryId === 'l2').map(b => b.entryId);
    expect(order).toEqual(['l2', 'l1']);
  });

  it('garde la section quand l\'annonce exige une langue, même sans autre niveau', async () => {
    const onlyFr = entries.filter(e => e.id !== 'l2');
    const store = makeFakeStore(makeBlocks(onlyFr));
    await applyAiCvToBlocks('cv1', response({ analyse: { langueAnnonce: 'fr', indispensables: ['Français courant'], importants: [], correspondances: [], ecarts: [] } }), {
      store: () => store, entries: onlyFr,
    });
    expect(store.currentCvBlocks.find(b => b.entryId === 'l1')!.isVisible).toBe(true);
  });
});

describe('applyAiCvToBlocks - C : langue du CV et libellés de sections', () => {
  const en = { langueAnnonce: 'en', indispensables: [], importants: [], correspondances: [], ecarts: [] };

  it('enregistre la langue du CV dans cv.settings', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({ analyse: en }), { store: () => store, entries });
    expect(store.settings.cvLanguage).toBe('en');
  });

  it('applique sectionLabels sans casser sectionOrder (identifiants internes conservés)', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({
      analyse: en,
      sectionLabels: { 'competences': 'Skills', 'Langues': 'Languages' },
      sectionOrder: ['Skills', 'Expériences Professionnelles'],
    }), { store: () => store, entries });
    const names = headerNames(store);
    expect(names[0]).toBe('Skills');
    expect(names).toContain('Languages');
    expect(names).not.toContain('Compétences');
  });

  it('traduit niveaux et noms de langues quand le CV est en anglais', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', response({ analyse: en }), { store: () => store, entries });
    const l1 = store.currentCvBlocks.find(b => b.entryId === 'l1')!;
    const l2 = store.currentCvBlocks.find(b => b.entryId === 'l2')!;
    expect(l1.overrideData.title).toBe('French');
    expect(l1.overrideData.subtitle).toBe('Native');
    expect(l2.overrideData.subtitle).toBe('Fluent - C1');
  });
});
