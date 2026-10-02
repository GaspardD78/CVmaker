import { describe, it, expect } from 'bun:test';
import { analyzeAiCvJson } from './ai-cv-pipeline';
import { applyAiCvToBlocks } from './apply-ai-cv';
import { generateFullCVMatchPrompt } from './prompt-templates';
import { TEST_PROFILE, makeBlocks, makeEntries, makeFakeStore } from './test-helpers/cv-fixtures';

const entries = makeEntries();
const ctx = { entries, profile: TEST_PROFILE, now: new Date(Date.UTC(2026, 5, 15)) };

const JOB_EN = 'SOC Analyst (L2). Splunk, Python, incident response. Fluent English required.';

/** Réponse v2 en anglais telle qu'un LLM bien élevé la produirait, entourée de texte parasite. */
const EN_RESPONSE = `Here is the tailored CV:
\`\`\`json
${JSON.stringify({
  schemaVersion: 2,
  analyse: {
    langue_annonce: 'en',
    indispensables: ['Splunk', 'Python', 'incident response'],
    importants: [],
    correspondances: [{ exigence: 'Splunk', entryId: 'x1' }],
    ecarts: ['incident response'],
  },
  title: 'SOC Analyst',
  summary: 'SOC Analyst with 7 years of experience in Splunk and Python.',
  entries: [
    { id: 'x1', visible: true, description: '• Monitored 12 log sources with Splunk\n• Cut handling time by 30%', titleOverride: 'SOC Analyst' },
    { id: 'x2', visible: false },
    { id: 'l2', visible: true, subtitleOverride: 'Fluent - C1' },
  ],
  sectionOrder: ['Skills', 'Professional Experience'],
  sectionLabels: { 'Compétences': 'Skills', 'Expériences Professionnelles': 'Professional Experience', 'Langues': 'Languages', 'Formations': 'Education' },
  skillGroups: [
    { category: 'SOC tooling', entryIds: ['s1', 's9', 's10', 's3'] },
    { category: 'Languages', entryIds: ['s2', 's8'] },
    { category: 'Systems', entryIds: ['s6', 's5', 's7', 's4'] },
  ],
  warnings: ['SOC Analyst: how many alerts per day?'],
})}
\`\`\`
Let me know if you need anything else!`;

describe('flux complet : annonce EN', () => {
  it('le prompt porte la consigne de langue et le schéma v2', () => {
    const prompt = generateFullCVMatchPrompt(TEST_PROFILE, entries, JOB_EN);
    expect(prompt).toContain('langue de l\'annonce');
    expect(prompt).toContain('"sectionLabels"');
  });

  it('une réponse EN est parsée, validée sans erreur bloquante et appliquée', async () => {
    const analysis = analyzeAiCvJson(EN_RESPONSE, { ...ctx, pageBudget: 2 }); // regroupement conservé : cible 2 pages
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.report.errors).toEqual([]);
    expect(analysis.report.metrics.keywordCoverage.pct).toBe(67); // « incident response » est un écart
    expect(analysis.report.metrics.ecarts).toEqual(['incident response']);
    expect(analysis.report.aiWarnings).toHaveLength(1);

    const store = makeFakeStore(makeBlocks(entries));
    const report = await applyAiCvToBlocks('cv1', analysis.data, { store: () => store, entries });

    expect(report.cvLanguage).toBe('en');
    expect(report.skillGrouping).toBe('applied');
    expect(store.settings.cvLanguage).toBe('en');

    const headers = store.sorted().filter(b => b.blockType === 'section_header' && b.overrideData.level !== 'sub').map(b => b.sectionName);
    // Ordre demandé (Skills, Experience), puis le reste dans l'ordre d'origine, tout traduit.
    expect(headers).toEqual(['Skills', 'Professional Experience', 'Education', 'Certifications', 'Languages']);

    const x1 = store.currentCvBlocks.find(b => b.entryId === 'x1')!;
    expect(x1.overrideData.description).toBe('- Monitored 12 log sources with Splunk\n- Cut handling time by 30%');
    expect(x1.overrideData.title).toBe('SOC Analyst');
    expect(store.currentCvBlocks.find(b => b.entryId === 'l1')!.overrideData.subtitle).toBe('Native');
  });

  it('cible 1 page (défaut) : le regroupement des compétences est retiré avant application', async () => {
    const analysis = analyzeAiCvJson(EN_RESPONSE, ctx);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.data.skillGroups).toBeUndefined();
    const store = makeFakeStore(makeBlocks(entries));
    const report = await applyAiCvToBlocks('cv1', analysis.data, { store: () => store, entries });
    expect(report.skillGrouping).toBe('none');
    expect(store.currentCvBlocks.some(b => b.overrideData.level === 'sub')).toBe(false);
  });

  it('un nombre inventé est détecté avant l\'application', () => {
    const bad = EN_RESPONSE.replace('Cut handling time by 30%', 'Cut handling time by 80%');
    const analysis = analyzeAiCvJson(bad, ctx);
    expect(analysis.ok && analysis.report.errors).toHaveLength(1);
  });
});

describe('flux complet : ancien schéma', () => {
  const LEGACY = JSON.stringify({
    title: 'Analyste SOC',
    summary: 'Analyste SOC, 7 ans d\'expérience.',
    entries: [
      { id: 'x1', visible: true, description: '• Supervision de 12 sources de logs avec Splunk' },
      { id: 'x2', visible: false },
    ],
  });

  it('est accepté et appliqué (aucun champ v2 requis)', async () => {
    const analysis = analyzeAiCvJson(LEGACY, ctx);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.report.errors).toEqual([]);
    const store = makeFakeStore(makeBlocks(entries));
    const report = await applyAiCvToBlocks('cv1', analysis.data, { store: () => store, entries });
    expect(report.skillGrouping).toBe('none');
    expect(store.currentCvBlocks.find(b => b.entryId === 'x2')!.isVisible).toBe(false);
    expect(store.currentCvBlocks.find(b => b.entryId === 'x1')!.overrideData.description).toBe('- Supervision de 12 sources de logs avec Splunk');
  });
});
