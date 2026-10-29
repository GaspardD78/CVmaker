import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { PrintableCV } from '../components/export/PrintableCV';
import { generateDocxBlob } from './export-docx';
import { guardAiCv, MIN_SKILL_LINES, type GuardContext } from './ai-cv-guard';
import { parseAiCvResponse, type AiCvResponse } from './ai-cv-response';
import { applyAiCvToBlocks, placeAfter } from './apply-ai-cv';
import { buildBadgeRows, isSkillLineBlock } from './skill-lines';
import { buildCvPrompt } from './cv-prompt';
import { TEST_PROFILE, makeEntry, makeFakeStore } from './test-helpers/cv-fixtures';
import { makeCategoryBlocks, makeCategoryEntries } from './test-helpers/skill-fixtures';
import { getAllTemplates } from '../templates';
import type { CVBlock, CVDocument } from '../types/cv';

// Données fictives et anonymisées.
const NOW = new Date(Date.UTC(2026, 5, 15));
const experiences = [
  makeEntry('e1', 'experience', 'Chargé de recrutement', {
    subtitle: 'Organisation A', startDate: '2018-01', endDate: '2022-01',
    description: '- Rédiger des fiches de poste avec les managers\n- Mener des entretiens de recrutement\n- Utiliser un ATS pour le suivi des candidatures',
  }),
  makeEntry('e2', 'experience', 'Assistant RH', {
    subtitle: 'Organisation B', startDate: '2015-01', endDate: '2017-12',
    description: '- Organiser des sessions de formation pour 40 salariés',
  }),
];
const entries = [...experiences, ...makeCategoryEntries()];

function makeBlocksWithExperiences(): CVBlock[] {
  const exp = (id: string, entryId: string, order: number): CVBlock => ({
    id, cvId: 'cv1', entryId, blockType: 'entry_ref', sectionName: null, customContent: null, sortOrder: order, isVisible: true, overrideData: {}, createdAt: '',
  });
  const skills = makeCategoryBlocks().map(b => ({ ...b, sortOrder: b.sortOrder + 10 }));
  return [
    { id: 'he', cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: 'Expériences Professionnelles', customContent: null, sortOrder: 0, isVisible: true, overrideData: {}, createdAt: '' },
    exp('b-e1', 'e1', 1), exp('b-e2', 'e2', 2),
    ...skills,
  ];
}

const LINES = [
  { text: 'Rédaction de fiches de poste avec les managers', sources: ['e1'] },
  { text: 'Conduite d\'entretiens de recrutement', sources: ['e1'] },
  { text: 'Organisation de formations', sources: ['e2'] },
  { text: 'Pratique de Python', sources: ['k1'] },
];

const resp = (extra: Partial<AiCvResponse> = {}): AiCvResponse => ({ entries: [], suggestedEntries: [], ...extra });
const ctx = (extra: Partial<GuardContext> = {}): GuardContext => ({ entries, profile: TEST_PROFILE, now: NOW, ...extra });
const codes = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.map(w => w.code);

describe('lecture de cvSkillLines', () => {
  it('lit text et sources, retire le marqueur de puce, ignore les lignes vides', () => {
    const r = parseAiCvResponse(JSON.stringify({ entries: [], cvSkillLines: [{ text: '- Analyse des besoins', sources: ['e1', 'e1', ' e2 '] }, { text: '' }, 'x', { text: 'Sans source' }] }));
    expect(r.cvSkillLines).toEqual([{ text: 'Analyse des besoins', sources: ['e1', 'e2'] }, { text: 'Sans source', sources: [] }]);
  });
  it('champ absent : JSON v2 inchangé', () => {
    expect(parseAiCvResponse(JSON.stringify({ schemaVersion: 2, entries: [] })).cvSkillLines).toBeUndefined();
  });
});

describe('garde-fou : traçabilité des lignes', () => {
  it('retire les lignes sans source valide et avertit', () => {
    const r = guardAiCv(resp({ cvSkillLines: [...LINES, { text: 'Ligne sans source', sources: [] }, { text: 'Source inconnue', sources: ['zzz'] }, { text: 'Source formation', sources: ['i1'] }] }), ctx());
    expect(r.data.cvSkillLines?.map(l => l.text)).toEqual(LINES.map(l => l.text));
    expect(r.report.warnings.filter(w => w.code === 'skill-line-no-source')).toHaveLength(3);
    expect(codes(r)).toContain('unknown-id');
  });

  it('une expérience ou une compétence est une source valide ; les doublons sont retirés', () => {
    const r = guardAiCv(resp({ cvSkillLines: [...LINES, { text: 'rédaction de fiches de poste avec les managers', sources: ['e1'] }] }), ctx());
    expect(r.data.cvSkillLines).toHaveLength(4);
    expect(r.data.cvSkillLines?.[3].sources).toEqual(['k1']);
  });

  it('signale chiffres et termes techniques absents des sources citées', () => {
    const r = guardAiCv(resp({ cvSkillLines: [
      ...LINES,
      { text: 'Maîtrise de Kubernetes et formation de 40 salariés', sources: ['e2'] },
    ] }), ctx());
    const w = r.report.warnings.find(x => x.code === 'skill-line-unsourced');
    expect(w?.message).toContain('kubernetes');
    expect(w?.message.split('citées :')[1]).not.toContain('40');
  });

  it('un chiffre absent de tout le profil reste une erreur bloquante (anti-invention identique)', () => {
    const r = guardAiCv(resp({ cvSkillLines: [...LINES, { text: 'Recrutement de 999 profils', sources: ['e1'] }] }), ctx());
    expect(r.report.errors.map(e => e.code)).toContain('invented-number');
  });

  it(`moins de ${MIN_SKILL_LINES} lignes valides : avertissement, catégories conservées`, () => {
    const r = guardAiCv(resp({ cvSkillLines: LINES.slice(0, 2) }), ctx());
    expect(codes(r)).toContain('skill-lines-too-few');
    const full = guardAiCv(resp({ cvSkillLines: LINES }), ctx());
    expect(codes(full)).not.toContain('skill-lines-too-few');
  });

  it('sans cvSkillLines : aucun code de lignes', () => {
    const r = guardAiCv(resp(), ctx());
    expect(codes(r).filter(c => c.startsWith('skill-line'))).toEqual([]);
    expect(r.data.cvSkillLines).toBeUndefined();
  });
});

describe('application : blocs custom_text sous « Compétences »', () => {
  const catIds = ['b-k1', 'b-k2', 'b-k3', 'b-k4'];
  const visibleIds = (store: ReturnType<typeof makeFakeStore>) => store.sorted().filter(b => b.isVisible).map(b => b.id);

  it('crée les lignes juste sous l\'en-tête, avant les catégories, sans toucher au profil', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    const report = await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES }), { store: () => store, entries });
    expect(report.skillLines).toBe('applied');
    const sorted = store.sorted();
    const header = sorted.findIndex(b => b.id === 'hs');
    const lines = sorted.filter(isSkillLineBlock);
    expect(lines.map(l => l.customContent)).toEqual(LINES.map(l => l.text));
    expect(sorted.slice(header + 1, header + 1 + lines.length).map(b => b.id)).toEqual(lines.map(l => l.id));
    expect(lines.every(l => l.blockType === 'custom_text' && l.entryId === null && l.isVisible)).toBe(true);
    expect(lines[0].overrideData.sources).toEqual(['e1']);
    // Le profil maître n'est pas concerné : seul le port de blocs est utilisé.
    expect(entries.map(e => e.id)).toEqual(['e1', 'e2', 'k1', 'k2', 'k3', 'k4', 'k5', 'i1']);
  });

  it('masque les catégories du profil non listées en visible: true', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES, entries: [{ id: 'k2', visible: true }] }), { store: () => store, entries });
    const ids = visibleIds(store);
    expect(ids).toContain('b-k2');
    for (const hidden of ['b-k1', 'b-k3', 'b-k4']) expect(ids).not.toContain(hidden);
    expect(ids).toContain('b-k5'); // compétence isolée : règle habituelle
    expect(store.currentCvBlocks.find(b => b.id === 'b-k1')?.overrideData.hiddenBySkillLines).toBe(true);
  });

  it('moins de 3 lignes : aucune ligne, aucune catégorie masquée', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    const report = await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES.slice(0, 2) }), { store: () => store, entries });
    expect(report.skillLines).toBe('skipped');
    expect(report.warnings.join('\n')).toContain('Lignes de compétences ignorées');
    expect(store.sorted().filter(isSkillLineBlock)).toEqual([]);
    for (const id of catIds) expect(visibleIds(store)).toContain(id);
  });

  it('idempotent : réappliquer le même JSON donne le même CV', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    const data = resp({ cvSkillLines: LINES, entries: [{ id: 'k2', visible: true }] });
    await applyAiCvToBlocks('cv1', data, { store: () => store, entries });
    const snapshot = () => store.sorted().map(b => [b.id, b.isVisible, b.customContent, JSON.stringify(b.overrideData)]);
    const first = snapshot();
    await applyAiCvToBlocks('cv1', data, { store: () => store, entries });
    expect(snapshot()).toEqual(first);
    expect(store.currentCvBlocks.filter(isSkillLineBlock)).toHaveLength(LINES.length);
  });

  it('moins de lignes à la réapplication : les blocs en trop sont supprimés', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES }), { store: () => store, entries });
    await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES.slice(0, 3) }), { store: () => store, entries });
    expect(store.currentCvBlocks.filter(isSkillLineBlock).map(b => b.customContent)).toEqual(LINES.slice(0, 3).map(l => l.text));
  });

  it('une application sans lignes défait la précédente : lignes retirées, catégories rétablies', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES }), { store: () => store, entries });
    expect(visibleIds(store)).not.toContain('b-k1');
    const report = await applyAiCvToBlocks('cv1', resp(), { store: () => store, entries });
    expect(report.skillLines).toBe('none');
    expect(store.sorted().filter(isSkillLineBlock)).toEqual([]);
    for (const id of catIds) expect(visibleIds(store)).toContain(id);
    expect(store.currentCvBlocks.some(b => b.overrideData.hiddenBySkillLines)).toBe(false);
  });

  it('une catégorie que l\'IA masque explicitement le reste après une application sans lignes', async () => {
    const store = makeFakeStore(makeBlocksWithExperiences());
    await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES }), { store: () => store, entries });
    await applyAiCvToBlocks('cv1', resp({ entries: [{ id: 'k3', visible: false }] }), { store: () => store, entries });
    expect(visibleIds(store)).not.toContain('b-k3');
    expect(visibleIds(store)).toContain('b-k1');
  });

  it('sans section Compétences : ignoré avec un avertissement', async () => {
    const blocks = makeBlocksWithExperiences().filter(b => !['hs', 'b-k1', 'b-k2', 'b-k3', 'b-k4', 'b-k5'].includes(b.id));
    const store = makeFakeStore(blocks);
    const report = await applyAiCvToBlocks('cv1', resp({ cvSkillLines: LINES }), { store: () => store, entries });
    expect(report.skillLines).toBe('skipped');
    expect(report.warnings.join('\n')).toContain('section « Compétences » introuvable');
  });

  it('placeAfter : déplace sans perdre ni dupliquer', () => {
    expect(placeAfter(['a', 'h', 'b', 'x', 'y'], 'h', ['x', 'y'])).toEqual(['a', 'h', 'x', 'y', 'b']);
    expect(placeAfter(['a', 'b'], 'zzz', ['b'])).toEqual(['a', 'b']);
  });
});

describe('rendu : mêmes styles que les lignes de compétences, sur tous les templates', () => {
  const cv: CVDocument = {
    id: 'cv1', profileId: 'p1', name: 'T', templateId: 'ats-classic', targetJob: null, targetCompany: null, customSummary: null,
    settings: {}, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0, createdAt: '', updatedAt: '',
  };
  const lineBlock = (i: number, text: string): CVBlock => ({
    id: `line-${i}`, cvId: 'cv1', entryId: null, blockType: 'custom_text', sectionName: null, customContent: text,
    sortOrder: 10.5 + i / 100, isVisible: true, overrideData: { aiSkillLine: true, sources: ['e1'] }, createdAt: '',
  });
  const blocks = [
    ...makeBlocksWithExperiences().map(b => (b.id === 'b-k1' || b.id === 'b-k3' || b.id === 'b-k4' ? { ...b, isVisible: false } : b)),
    ...LINES.map((l, i) => lineBlock(i, l.text)),
  ];

  it('buildBadgeRows : une ligne simple par bloc, avant les catégories', () => {
    const rows = buildBadgeRows(blocks.filter(b => isSkillLineBlock(b) || b.id === 'b-k2'), entries);
    expect(rows.filter(r => r.plain).map(r => r.items[0].name)).toEqual(LINES.map(l => l.text));
    expect(rows.filter(r => r.category !== null).map(r => r.category)).toEqual(['Outils SOC']);
  });

  for (const t of getAllTemplates()) {
    it(`${t.id}`, () => {
      const html = renderToStaticMarkup(<PrintableCV cv={{ ...cv, templateId: t.id }} profile={TEST_PROFILE} blocks={blocks} entries={entries} template={t} />);
      for (const l of LINES) expect(html).toContain(l.text.replace(/'/g, '&#x27;'));
      expect(html).toContain('cv-skill-line');
      // La catégorie du profil encore visible reste affichée ; les masquées ne le sont pas.
      expect(html).toContain('Outils SOC');
      expect(html).not.toContain('Langages');
      // Lignes avant la catégorie dans le texte.
      expect(html.indexOf(LINES[0].text.slice(0, 12))).toBeLessThan(html.indexOf('Outils SOC'));
    });
  }

  it('export DOCX : lignes présentes, dans la section Compétences', async () => {
    const blob = await generateDocxBlob(cv, TEST_PROFILE, blocks, entries, getAllTemplates()[0]);
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string');
    for (const l of LINES) expect(xml).toContain(l.text.replace(/'/g, '&apos;'));
  });
});

describe('prompt : documentation du schéma', () => {
  const prompt = buildCvPrompt({ profile: TEST_PROFILE, entries, jobOfferText: 'Chargé de recrutement.', options: { now: NOW, pageBudget: 1 } });
  it('règle anti-invention et champ du schéma', () => {
    expect(prompt).toContain('LIGNES DE COMPÉTENCES (optionnel, "cvSkillLines")');
    expect(prompt).toContain('cite dans "sources" au moins un ID d\'entrée existante (expérience ou compétence)');
    expect(prompt).toContain('aucun outil, technologie ou chiffre absent de ces sources');
    expect(prompt).toContain('"cvSkillLines": [{ "text": "(optionnel) ligne de compétences reformulée", "sources": ["id_entree_1", "id_entree_2"] }]');
  });
});
