import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { PrintableCV } from '../components/export/PrintableCV';
import { MergeBadge } from '../components/cv-builder/MergeBadge';
import { generateDocxBlob } from './export-docx';
import { guardAiCv, type GuardContext } from './ai-cv-guard';
import { parseAiCvResponse, type AiCvResponse } from './ai-cv-response';
import { applyAiCvToBlocks, unmergeCarrierBlock } from './apply-ai-cv';
import { entryDisplayTitle } from './entry-display';
import { carrierOf, mergedCount, mergedDates, mergedEmployers, remapEntryOrder, resolveMergedGroup, sortMostRecentFirst } from './merged-entries';
import { TEST_PROFILE, makeEntry, makeFakeStore } from './test-helpers/cv-fixtures';
import { getTemplate } from '../templates';
import type { CVBlock, CVDocument } from '../types/cv';

// Données fictives et anonymisées : cinq postes de chargé de recrutement, dont trois anciens à regrouper.
const NOW = new Date(Date.UTC(2026, 5, 15));
const A = makeEntry('a1', 'experience', 'Chargé de recrutement (Employeur A)', { subtitle: 'Employeur A', startDate: '2011-03', endDate: '2012-06', description: '- Recruter des profils techniques pour 12 postes' });
const B = makeEntry('a2', 'experience', 'Chargé de recrutement (Employeur B)', { subtitle: 'Employeur B', startDate: '2012-07', endDate: '2013-12', description: '- Animer le sourcing avec les managers' });
const C = makeEntry('a3', 'experience', 'Recruteur (Employeur C)', { subtitle: 'Employeur C', startDate: '2014-01', endDate: '2015-09', description: '- Suivre les candidatures dans un ATS' });
const D = makeEntry('d1', 'experience', 'Responsable recrutement', { subtitle: 'Employeur D', startDate: '2016-01', endDate: null, isCurrent: true, description: '- Piloter les recrutements de la direction' });
const E = makeEntry('e1', 'education', 'Master RH', { subtitle: 'École fictive', startDate: '2009', endDate: '2011' });
const entries = [A, B, C, D, E];
const byId = new Map(entries.map(e => [e.id, e] as const));

const GROUP = { ids: ['a1', 'a2', 'a3'], titleOverride: 'Chargé de recrutement', description: '- Recruter des profils techniques\n- Suivre les candidatures' };
const resp = (extra: Partial<AiCvResponse> = {}): AiCvResponse => ({ entries: [], suggestedEntries: [], ...extra });
const ctx = (extra: Partial<GuardContext> = {}): GuardContext => ({ entries, profile: TEST_PROFILE, now: NOW, ...extra });
const codes = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.map(w => w.code);

function makeBlocks(): CVBlock[] {
  const ref = (entryId: string, order: number, extra: Partial<CVBlock> = {}): CVBlock => ({
    id: `b-${entryId}`, cvId: 'cv1', entryId, blockType: 'entry_ref', sectionName: null, customContent: null, sortOrder: order, isVisible: true, overrideData: {}, createdAt: '', ...extra,
  });
  const header = (id: string, name: string, order: number): CVBlock => ({ id, cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: name, customContent: null, sortOrder: order, isVisible: true, overrideData: {}, createdAt: '' });
  return [header('he', 'Expériences Professionnelles', 0), ref('d1', 1), ref('a3', 2), ref('a2', 3), ref('a1', 4), header('hf', 'Formations', 5), ref('e1', 6)];
}
const state = (store: ReturnType<typeof makeFakeStore>) => store.sorted().map(b => [b.id, b.isVisible, b.customContent, JSON.stringify(b.overrideData)]);

describe('résolution d\'un groupe', () => {
  it('porteur = entrée la plus récente ; dates calculées ; employeurs du plus récent au plus ancien', () => {
    const r = resolveMergedGroup({ ids: ['a1', 'a3', 'a2'], titleOverride: 'Chargé de recrutement' }, byId);
    expect(r.ok && r.merge.carrierId).toBe('a3');
    expect(r.ok && r.merge.ids).toEqual(['a3', 'a2', 'a1']);
    expect(r.ok && r.merge.subtitle).toBe('Employeur C, Employeur B, Employeur A');
    expect(r.ok && r.merge.dates).toEqual({ startDate: '2011-03', endDate: '2015-09', isCurrent: false });
    expect(r.ok && r.merge.description).toBe('');
  });

  it('une entrée en cours : « Présent » (isCurrent), sans date de fin', () => {
    expect(mergedDates([A, D])).toEqual({ startDate: '2011-03', endDate: null, isCurrent: true });
    expect(mergedDates([A, B]).endDate).toBe('2013-12');
  });

  it('subtitleOverride fourni : conservé ; employeurs identiques dédoublonnés', () => {
    const r = resolveMergedGroup({ ids: ['a1', 'a2'], subtitleOverride: 'Plusieurs employeurs' }, byId);
    expect(r.ok && r.merge.subtitle).toBe('Plusieurs employeurs');
    const dup = makeEntry('z', 'experience', 'Poste', { subtitle: 'EMPLOYEUR a' });
    expect(mergedEmployers([A, dup, B])).toBe('Employeur B, Employeur A');
  });

  it('le titre ne répète pas l\'employeur déjà en sous-titre', () => {
    const r = resolveMergedGroup({ ids: ['a1', 'a2'], titleOverride: 'Chargé de recrutement (Employeur B, Employeur A)' }, byId);
    expect(r.ok && r.merge.titleOverride).toBe('Chargé de recrutement');
  });

  it('groupes invalides : une seule entrée, inconnue, types mélangés, entrée déjà prise', () => {
    const why = (g: { ids: string[] }, taken: string[] = []) => {
      const r = resolveMergedGroup(g, byId, new Set(taken));
      return r.ok ? 'ok' : r.reason;
    };
    expect(why({ ids: ['a1'] })).toContain('au moins 2');
    expect(why({ ids: ['a1', 'a1'] })).toContain('au moins 2');
    expect(why({ ids: ['a1', 'zzz'] })).toContain('inconnu');
    expect(why({ ids: ['a1', 'e1'] })).toContain('même type');
    expect(why({ ids: ['a1', 'a2'] }, ['a2'])).toContain('déjà fusionnée');
    expect(why({ ids: ['a1', 'a2'] })).toBe('ok');
  });

  it('tri chronologique inverse stable', () => {
    expect(sortMostRecentFirst([A, B, C, D]).map(e => e.id)).toEqual(['d1', 'a3', 'a2', 'a1']);
  });

  it('entryOrder ramené aux porteurs', () => {
    const merges = ['a1', 'a2', 'a3'].length ? [resolveMergedGroup(GROUP, byId)].flatMap(r => (r.ok ? [r.merge] : [])) : [];
    expect(carrierOf(merges).get('a1')).toBe('a3');
    expect(remapEntryOrder(['a1', 'd1', 'a2', 'e1'], merges)).toEqual(['a3', 'd1', 'e1']);
    expect(remapEntryOrder(undefined, merges)).toBeUndefined();
  });
});

describe('lecture de mergedEntries', () => {
  it('lit ids, titre, sous-titre, description ; champ absent inchangé', () => {
    const r = parseAiCvResponse(JSON.stringify({ entries: [], mergedEntries: [{ ids: ['a1', 'a1', 'a2'], titleOverride: ' T ', subtitleOverride: 'S', description: '- x', dates: 'ignoré' }, { ids: [] }, 'x'] }));
    expect(r.mergedEntries).toEqual([{ ids: ['a1', 'a2'], titleOverride: 'T', subtitleOverride: 'S', description: '- x' }]);
    expect(parseAiCvResponse(JSON.stringify({ schemaVersion: 2, entries: [] })).mergedEntries).toBeUndefined();
  });
});

describe('garde-fou : fusions', () => {
  it('groupe valide conservé, ids ordonnés du plus récent au plus ancien', () => {
    const r = guardAiCv(resp({ mergedEntries: [GROUP] }), ctx());
    expect(r.data.mergedEntries?.[0].ids).toEqual(['a3', 'a2', 'a1']);
    expect(codes(r)).not.toContain('merge-ignored');
    expect(r.report.errors).toEqual([]);
  });

  it('groupes invalides ignorés avec un avertissement (≥ 2, existants, même type, un seul groupe)', () => {
    const r = guardAiCv(resp({ mergedEntries: [
      { ids: ['a1'] }, { ids: ['a1', 'zzz'] }, { ids: ['a1', 'e1'] }, GROUP, { ids: ['a2', 'd1'], titleOverride: 'Doublon' },
    ] }), ctx());
    expect(r.report.warnings.filter(w => w.code === 'merge-ignored')).toHaveLength(4);
    expect(r.data.mergedEntries).toHaveLength(1);
    expect(r.data.mergedEntries?.[0].ids).toEqual(['a3', 'a2', 'a1']);
  });

  it('aucun groupe valide : champ retiré', () => {
    expect(guardAiCv(resp({ mergedEntries: [{ ids: ['a1'] }] }), ctx()).data.mergedEntries).toBeUndefined();
  });

  it('datesOverride d\'une entrée fusionnée : ignoré', () => {
    const r = guardAiCv(resp({ mergedEntries: [GROUP], entries: [{ id: 'a2', visible: true, datesOverride: '2012 - 2014' }, { id: 'd1', visible: true, datesOverride: 'garde' }] }), ctx());
    expect(r.data.entries.find(e => e.id === 'a2')?.datesOverride).toBeUndefined();
    expect(r.data.entries.find(e => e.id === 'd1')?.datesOverride).toBe('garde');
    expect(codes(r)).toContain('merge-dates-ignored');
  });

  it('description : source = union des entrées fusionnées ; un chiffre hors union est bloquant', () => {
    const ok = guardAiCv(resp({ mergedEntries: [{ ...GROUP, description: '- Recruter des profils pour 12 postes' }] }), ctx());
    expect(ok.report.errors).toEqual([]);
    const bad = guardAiCv(resp({ mergedEntries: [{ ...GROUP, description: '- Recruter pour 40 postes' }] }), ctx({ entries: [...entries, makeEntry('x9', 'experience', 'Autre', { description: '- 40 postes' })] }));
    expect(bad.report.errors.map(e => e.code)).toContain('invented-number');
    expect(bad.report.errors[0].message).toContain('40');
  });

  it('règles de description appliquées au texte fusionné (typographie, puces)', () => {
    const r = guardAiCv(resp({ mergedEntries: [{ ...GROUP, description: '* Recruter des profils.\n* Suivre les candidatures' }] }), ctx());
    expect(r.data.mergedEntries?.[0].description).toBe('- Recruter des profils\n- Suivre les candidatures');
  });

  it('lot 3 : une cvSkillLine peut citer une entrée fusionnée, la source reste valide', () => {
    const r = guardAiCv(resp({
      mergedEntries: [GROUP],
      cvSkillLines: [
        { text: 'Animation du sourcing avec les managers', sources: ['a2'] },
        { text: 'Suivi des candidatures dans un ATS', sources: ['a3'] },
        { text: 'Recrutement de profils techniques', sources: ['a1'] },
      ],
    }), ctx());
    expect(r.data.cvSkillLines).toHaveLength(3);
    expect(codes(r)).not.toContain('skill-line-no-source');
    expect(codes(r)).not.toContain('skill-lines-too-few');
  });

  it('sans mergedEntries : aucun code de fusion, JSON v2 inchangé', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'a1', visible: true, datesOverride: 'x' }] }), ctx());
    expect(codes(r).filter(c => c.startsWith('merge'))).toEqual([]);
    expect(r.data.mergedEntries).toBeUndefined();
    expect(r.data.entries[0].datesOverride).toBe('x');
  });
});

describe('application : bloc porteur, blocs masqués, idempotence', () => {
  const port = () => makeFakeStore(makeBlocks());
  const run = (store: ReturnType<typeof port>, data: AiCvResponse) => applyAiCvToBlocks('cv1', data, { store: () => store, entries });

  it('le bloc de l\'entrée la plus récente porte les surcharges ; les autres sont masqués', async () => {
    const store = port();
    const report = await run(store, resp({ mergedEntries: [GROUP] }));
    expect(report.merges).toBe(1);
    const get = (id: string) => store.currentCvBlocks.find(b => b.id === id)!;
    const carrier = get('b-a3');
    expect(carrier.isVisible).toBe(true);
    expect(carrier.overrideData).toMatchObject({
      title: 'Chargé de recrutement', subtitle: 'Employeur C, Employeur B, Employeur A', description: GROUP.description,
      startDate: '2011-03', endDate: '2015-09', isCurrent: false, mergedFrom: ['a3', 'a2', 'a1'],
    });
    expect(carrier.overrideData.datesOverride).toBeUndefined();
    for (const id of ['b-a1', 'b-a2']) {
      expect(get(id).isVisible).toBe(false);
      expect(get(id).overrideData.mergedInto).toBe('a3');
    }
    expect(get('b-d1').isVisible).toBe(true);
    expect(get('b-e1').isVisible).toBe(true);
  });

  it('jamais de datesOverride sur une ligne fusionnée, même fourni par l\'IA ou déjà présent', async () => {
    const blocks = makeBlocks().map(b => (b.id === 'b-a3' ? { ...b, overrideData: { datesOverride: 'ancien' } } : b));
    const store = makeFakeStore(blocks);
    await run(store, resp({ mergedEntries: [GROUP], entries: [{ id: 'a3', visible: true, datesOverride: '2014 - 2015' }] }));
    expect(store.currentCvBlocks.find(b => b.id === 'b-a3')!.overrideData.datesOverride).toBeUndefined();
  });

  it('idempotent : réappliquer le même JSON donne le même CV', async () => {
    const store = port();
    const data = resp({ mergedEntries: [GROUP], entries: [{ id: 'd1', visible: true, description: '- Piloter' }] });
    await run(store, data);
    const first = state(store);
    await run(store, data);
    expect(state(store)).toEqual(first);
    await run(store, data);
    expect(state(store)).toEqual(first);
  });

  it('une application sans fusion défait proprement la précédente', async () => {
    const store = port();
    const before = state(store);
    await run(store, resp({ mergedEntries: [GROUP] }));
    expect(state(store)).not.toEqual(before);
    const report = await run(store, resp());
    expect(report.merges).toBe(0);
    expect(state(store)).toEqual(before);
  });

  it('une entrée masquée avant la fusion le reste après défusion', async () => {
    const blocks = makeBlocks().map(b => (b.id === 'b-a1' ? { ...b, isVisible: false } : b));
    const store = makeFakeStore(blocks);
    await run(store, resp({ mergedEntries: [GROUP] }));
    await run(store, resp());
    expect(store.currentCvBlocks.find(b => b.id === 'b-a1')!.isVisible).toBe(false);
    expect(store.currentCvBlocks.find(b => b.id === 'b-a2')!.isVisible).toBe(true);
  });

  it('entryOrder peut citer n\'importe quel identifiant du groupe : il s\'applique au bloc porteur', async () => {
    const store = port();
    await run(store, resp({ mergedEntries: [GROUP], entryOrder: ['a1', 'd1'] }));
    const order = store.sorted().filter(b => b.entryId && ['d1', 'a3'].includes(b.entryId)).map(b => b.entryId);
    expect(order).toEqual(['a3', 'd1']);
  });

  it('groupe invalide : ignoré avec un avertissement, aucune modification', async () => {
    const store = port();
    const before = state(store);
    const report = await run(store, resp({ mergedEntries: [{ ids: ['a1', 'e1'] }] }));
    expect(report.merges).toBe(0);
    expect(report.warnings.join('\n')).toContain('Fusion ignorée');
    expect(state(store)).toEqual(before);
  });

  it('toutes les entrées masquées par l\'IA : la ligne fusionnée l\'est aussi', async () => {
    const store = port();
    await run(store, resp({ mergedEntries: [GROUP], entries: GROUP.ids.map(id => ({ id, visible: false })) }));
    expect(store.currentCvBlocks.find(b => b.id === 'b-a3')!.isVisible).toBe(false);
  });

  it('défaire en un clic : visibilité et surcharges d\'origine rétablies', async () => {
    const store = port();
    const before = state(store);
    await run(store, resp({ mergedEntries: [GROUP] }));
    await unmergeCarrierBlock('cv1', 'b-a3', { store: () => store });
    expect(state(store)).toEqual(before);
    // Sans effet sur un bloc qui ne porte pas de fusion.
    await unmergeCarrierBlock('cv1', 'b-d1', { store: () => store });
    expect(state(store)).toEqual(before);
  });

  it('le profil maître n\'est pas modifié', async () => {
    const snapshot = JSON.stringify(entries);
    await run(port(), resp({ mergedEntries: [GROUP] }));
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe('affichage', () => {
  const cv: CVDocument = {
    id: 'cv1', profileId: 'p1', name: 'T', templateId: 'ats-classic', targetJob: null, targetCompany: null, customSummary: null,
    settings: { dateFormat: 'year' }, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0, createdAt: '', updatedAt: '',
  };
  const merged = async () => {
    const store = makeFakeStore(makeBlocks());
    await applyAiCvToBlocks('cv1', resp({ mergedEntries: [{ ...GROUP, description: undefined }] }), { store: () => store, entries });
    return store.sorted();
  };

  it('ligne fusionnée : titre, employeurs et dates calculées au format du CV, sans les postes fusionnés', async () => {
    const blocks = await merged();
    const html = renderToStaticMarkup(<PrintableCV cv={cv} profile={TEST_PROFILE} blocks={blocks} entries={entries} template={getTemplate('ats-classic')} />);
    expect(html).toContain('Chargé de recrutement');
    expect(html).toContain('Employeur C, Employeur B, Employeur A');
    expect(html).toContain('2011 - 2015');
    expect(html).not.toContain('Employeur A)');
    expect(html).not.toContain('Recruter des profils techniques pour 12 postes');
    // Un seul « Chargé de recrutement » : les deux autres postes de ce titre sont masqués.
    expect(html.match(/Chargé de recrutement/g)).toHaveLength(1);
  });

  it('dates par défaut (mois et année) : période calculée, « Présent » si une entrée est en cours', async () => {
    const store = makeFakeStore(makeBlocks());
    await applyAiCvToBlocks('cv1', resp({ mergedEntries: [{ ids: ['a1', 'd1'], titleOverride: 'Recrutement' }] }), { store: () => store, entries });
    const html = renderToStaticMarkup(<PrintableCV cv={{ ...cv, settings: {} }} profile={TEST_PROFILE} blocks={store.sorted()} entries={entries} template={getTemplate('ats-classic')} />);
    expect(html).toContain('mars 2011 - Présent');
  });

  it('export DOCX : même ligne fusionnée', async () => {
    const blob = await generateDocxBlob(cv, TEST_PROFILE, await merged(), entries, getTemplate('ats-classic'));
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string');
    expect(xml).toContain('Employeur C, Employeur B, Employeur A');
    expect(xml).toContain('2011 - 2015');
  });

  it('entry-display : pas d\'employeur en double dans le titre fusionné', () => {
    const overrides = { title: 'Chargé de recrutement (Employeur B, Employeur A)', subtitle: 'Employeur B, Employeur A', mergedFrom: ['a2', 'a1'] };
    expect(entryDisplayTitle(B, overrides)).toBe('Chargé de recrutement');
    // Hors fusion, une surcharge de titre reste affichée telle quelle.
    expect(entryDisplayTitle(B, { title: 'Chargé de recrutement (Employeur B)' })).toBe('Chargé de recrutement (Employeur B)');
    expect(entryDisplayTitle(B, { subtitle: 'Employeur B, Employeur A', mergedFrom: ['a2', 'a1'] })).toBe('Chargé de recrutement');
  });

  it('badge « Fusion de N postes » avec « Défaire », et « Fusionné » sur les membres', () => {
    const carrier = renderToStaticMarkup(<MergeBadge block={{ overrideData: { mergedFrom: ['a3', 'a2', 'a1'] } }} onUnmerge={() => {}} />);
    expect(carrier).toContain('Fusion de 3 postes');
    expect(carrier).toContain('Défaire');
    expect(renderToStaticMarkup(<MergeBadge block={{ overrideData: { mergedInto: 'a3' } }} onUnmerge={() => {}} />)).toContain('Fusionné');
    expect(renderToStaticMarkup(<MergeBadge block={{ overrideData: {} }} onUnmerge={() => {}} />)).toBe('');
    expect(mergedCount({ overrideData: { mergedFrom: ['a'] } })).toBe(1);
  });
});

describe('garde-fou : temps des verbes sur une ligne fusionnée', () => {
  const tense = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.filter(w => w.code === 'tense').map(w => w.message);
  const old1 = makeEntry('o1', 'experience', 'Chargé de recrutement', { subtitle: 'Employeur O1', startDate: '2012-01', endDate: '2013-12', description: '- Recruter' });
  const current = makeEntry('o2', 'experience', 'Chargé de recrutement', { subtitle: 'Employeur O2', startDate: '2018-01', endDate: null, isCurrent: true, description: '- Recruter' });
  // Poste le plus récent sans date de fin mais pas « en cours », fusionné avec un poste terminé.
  const openEnded = makeEntry('o3', 'experience', 'Chargé de recrutement', { subtitle: 'Employeur O3', startDate: '2015-01', endDate: null, isCurrent: false, description: '- Recruter' });
  const run = (group: string[], descriptions: string, all: ReturnType<typeof makeEntry>[], verbTense?: 'passe-present') => guardAiCv(
    resp({ entries: group.map(id => ({ id, visible: true })), mergedEntries: [{ ids: group, titleOverride: 'Chargé de recrutement', description: descriptions }] }),
    { entries: all, profile: TEST_PROFILE, now: NOW, ...(verbTense ? { verbTense } : { verbTense: 'passe-present' as const }) },
  );

  it('une entrée du groupe en cours : la ligne fusionnée est « en cours » (verbes au passé signalés)', () => {
    const r = run(['o1', 'o2'], '- Recruté des profils\n- Piloté les entretiens', [old1, current]);
    expect(tense(r).join('\n')).toContain('passé sur un poste actuel');
  });

  it('aucune entrée en cours : la période calculée est terminée, même si le porteur n\'a pas de date de fin', () => {
    // Règle précédente (porteur sans fin = en cours) : aucun avertissement ; période calculée : « présent sur un poste terminé ».
    const r = run(['o1', 'o3'], '- Recrute des profils\n- Pilote les entretiens', [old1, openEnded]);
    expect(tense(r).join('\n')).toContain('présent sur un poste terminé');
  });

  it('verbes cohérents avec la période : aucun avertissement', () => {
    expect(tense(run(['o1', 'o2'], '- Recrute des profils\n- Pilote les entretiens', [old1, current]))).toEqual([]);
    expect(tense(run(['o1', 'o3'], '- Recruté des profils\n- Piloté les entretiens', [old1, openEnded]))).toEqual([]);
  });

  it('hors fusion : règle historique inchangée (sans date de fin = en cours)', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'o3', visible: true, description: '- Recruté des profils\n- Piloté les entretiens' }] }), { entries: [openEnded], profile: TEST_PROFILE, now: NOW, verbTense: 'passe-present' });
    expect(tense(r).join('\n')).toContain('passé sur un poste actuel');
  });
});

describe('garde-fou : une ligne fusionnée sans description est voulue', () => {
  it('pas d\'avertissement « visible sans description » sur le porteur', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'a1', visible: true }, { id: 'a2', visible: true }], mergedEntries: [{ ids: ['a1', 'a2'], titleOverride: 'Chargé de recrutement' }] }), ctx());
    expect(codes(r)).not.toContain('empty-description');
  });
  it('hors fusion, une expérience visible sans description est toujours signalée', () => {
    const empty = makeEntry('q1', 'experience', 'Poste vide', { subtitle: 'Employeur Q', startDate: '2020-01', endDate: '2021-01' });
    const r = guardAiCv(resp({ entries: [{ id: 'q1', visible: true }] }), { entries: [empty], profile: TEST_PROFILE, now: NOW, pageBudget: 2 });
    expect(codes(r)).toContain('empty-description');
  });
});
