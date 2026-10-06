import { describe, expect, it } from 'bun:test';
import type { JobSource } from '@/types/job-watch';
import { generateDiagnosticPrompt, generatePerformanceOptimizationPrompt } from '@/lib/prompt-templates';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import { buildPortfolioReviewPrompt } from './ai-portfolio';
import { buildSourceCoverage, renderCoverageSection } from './source-coverage';

type Log = { status: 'success' | 'error' | 'empty'; sourceStatus?: never; offersFetched: number; offersNew: number };
const log = (l: Partial<Record<string, unknown>> & { status: Log['status']; offersFetched: number; offersNew: number }) =>
  l as Parameters<typeof buildSourceCoverage>[0]['lastLogBySource'] extends Map<JobSource, infer V> ? V : never;

/** Le cas réel : WTTJ domine, APEC et Emploi Territorial en échec, Indeed non configurée. */
function realCase() {
  const logs = new Map<JobSource, ReturnType<typeof log>>([
    ['apec', log({ status: 'error', sourceStatus: 'bloquee', offersFetched: 0, offersNew: 0 })],
    ['france_travail', log({ status: 'empty', offersFetched: 0, offersNew: 0 })],
    ['wttj', log({ status: 'success', offersFetched: 97, offersNew: 8 })],
    ['linkedin', log({ status: 'success', offersFetched: 10, offersNew: 4 })],
    ['emploi_territorial', log({ status: 'error', sourceStatus: 'introuvable', offersFetched: 0, offersNew: 0 })],
    ['jobicy', log({ status: 'success', offersFetched: 7, offersNew: 0 })],
  ]);
  const sample = [...Array(86).fill('wttj'), ...Array(10).fill('linkedin'), ...Array(4).fill('jobicy')];
  return buildSourceCoverage({
    lastLogBySource: logs,
    configuredSources: new Set<JobSource>(['apec', 'france_travail', 'wttj', 'linkedin', 'emploi_territorial', 'jobicy']),
    sampleSources: sample,
  });
}

describe('couverture par source', () => {
  it('calcule la part de chaque source dans l\'échantillon', () => {
    const c = realCase();
    expect(c.sampleSize).toBe(100);
    expect(c.rows.find(r => r.source === 'wttj')!.sharePct).toBe(86);
    expect(c.rows.find(r => r.source === 'apec')!.status).toBe('bloquee');
    expect(c.rows.find(r => r.source === 'indeed')!.status).toBe('non_configuree');
  });

  it('avertit d\'un échantillon biaisé au-delà de 70 %', () => {
    const c = realCase();
    expect(c.biased).toEqual({ label: 'Welcome to the Jungle', sharePct: 86 });
    expect(renderCoverageSection(c)).toContain('échantillon biaisé : 86 % de Welcome to the Jungle');
  });

  it('pas d\'avertissement quand l\'échantillon est équilibré', () => {
    const c = buildSourceCoverage({
      lastLogBySource: new Map(),
      configuredSources: new Set<JobSource>(['wttj', 'apec']),
      sampleSources: ['wttj', 'wttj', 'apec', 'apec', 'linkedin'],
    });
    expect(c.biased).toBeNull();
    expect(renderCoverageSection(c)).not.toContain('biaisé');
  });

  it('liste les sources à réparer ou activer, et interdit de les régler', () => {
    const text = renderCoverageSection(realCase());
    expect(text).toContain('Sources à réparer ou activer d\'abord');
    expect(text).toContain('APEC (Bloquée)');
    // Emploi Territorial est indisponible : signalée, mais pas « à réparer ».
    expect(text).toContain('Emploi Territorial : Indisponible');
    expect(text).not.toContain('Emploi Territorial (');
    expect(text).toContain('Indeed (Non configurée)');
    expect(text).toContain('ne propose AUCUN réglage');
    // « Vide » n'est pas une panne : France Travail n'est pas à réparer.
    expect(text).not.toContain('France Travail (Vide)');
  });

  it('échantillon vide : aucune part, aucun biais', () => {
    const c = buildSourceCoverage({ lastLogBySource: new Map(), configuredSources: new Set(), sampleSources: [] });
    expect(c.biased).toBeNull();
    expect(c.rows.every(r => r.sharePct === 0)).toBe(true);
  });
});

describe('couverture dans les prompts d\'analyse', () => {
  const section = renderCoverageSection(realCase());
  const context = { alertName: 'Recherche principale', otherAlerts: [], coverageSection: section };

  it('le prompt de diagnostic reçoit la couverture, l\'avertissement et la consigne', () => {
    const prompt = generateDiagnosticPrompt(DEFAULT_SEARCH_PROFILE, [{ title: 'Offre', score: 80, action: null }], context);
    expect(prompt).toContain('Couverture par source');
    expect(prompt).toContain('échantillon biaisé : 86 % de Welcome to the Jungle');
    expect(prompt).toContain('ne propose AUCUN réglage');
  });

  it('le prompt d\'optimisation la reçoit aussi, même sans autre piste', () => {
    const prompt = generatePerformanceOptimizationPrompt(
      null, [], DEFAULT_SEARCH_PROFILE,
      { volumePerWeek: 8, pertinencePercent: 10, conversionPercent: 0, learnedPositive: [], learnedNegative: [] },
      context,
    );
    expect(prompt).toContain('Sources à réparer ou activer d\'abord');
  });

  it('sans contexte de couverture, les prompts restent inchangés', () => {
    const prompt = generateDiagnosticPrompt(DEFAULT_SEARCH_PROFILE, [], { alertName: 'A', otherAlerts: [] });
    expect(prompt).not.toContain('Couverture par source');
  });

  it('la revue de portefeuille inclut la couverture de chaque piste', () => {
    const prompt = buildPortfolioReviewPrompt(
      [{ name: 'Recherche principale', kind: 'core', searchProfile: DEFAULT_SEARCH_PROFILE, sources: [] }],
      { windowDays: 30, perAlert: [], overlaps: [] },
      [{ alertName: 'Recherche principale', section }],
    );
    expect(prompt).toContain('COUVERTURE PAR SOURCE');
    expect(prompt).toContain('Recherche principale');
  });
});
