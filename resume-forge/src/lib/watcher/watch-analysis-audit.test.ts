/**
 * Spec 005 - reproduction des défauts 1 à 13 de l'analyse IA de la Veille.
 *
 * Chaque test décrit le comportement ATTENDU. Tant que le défaut existe, le test
 * est marqué `test.failing` (la suite reste verte) ; il passe en `test` dès que
 * le défaut est corrigé. Voir specs/005-watch-ai-analysis/AUDIT.md.
 */
import { describe, expect, test } from 'bun:test';
import { computeScore } from './scorer';
import { detectCrossSourceDuplicates, dedupeOffers } from './deduplicator';
import { processFeedback, listLearnedSignals, forgetLearnedTerms } from './learning-engine';
import { generateDiagnosticPrompt, generatePerformanceOptimizationPrompt } from '@/lib/prompt-templates';
import { buildWatchAnalysisContext } from './analysis-context';
import { generateWatchAnalysisPrompt } from './analysis-prompt';
import { DEFAULT_EXTRACTION, DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';

function profile(over: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_SEARCH_PROFILE, scoring: { mode: 'balanced' }, contractTypes: [], ...over };
}

function offer(title: string, descriptionSnippet: string | null = null) {
  return {
    title, descriptionSnippet, publishedAt: null, company: null,
    salaryMin: null, salaryMax: null, contractType: null,
    extraction: { ...DEFAULT_EXTRACTION, titleConfidence: 'high' as const },
  };
}

const perfMetrics = {
  volumePerWeek: 12, pertinencePercent: 35, conversionPercent: 4,
  learnedPositive: [], learnedNegative: [],
};

describe('défaut 1 - veto des exclusions sur la description', () => {
  test("un terme d'excludeTitles présent seulement dans la description ne tue pas l'offre", () => {
    const p = profile({ jobTitles: ['rssi'], excludeTitles: ['développeur'] });
    expect(computeScore(offer('RSSI', 'Vous encadrez un développeur senior.'), p)).toBeGreaterThan(0);
  });
});

describe('défaut 2 - libellés incohérents', () => {
  const sp = profile({ jobTitles: ['rssi'], skills: ['iso 27001'], domains: ['banque'] });
  test('le champ skills est présenté comme un bonus, jamais comme un « Domaine requis »', () => {
    const diag = generateDiagnosticPrompt(sp, []);
    expect(diag).not.toContain('Domaine requis');
  });
  test('les deux modes emploient les mêmes libellés pour skills et domains', () => {
    const perf = generatePerformanceOptimizationPrompt(null, [], sp, perfMetrics);
    const diag = generateDiagnosticPrompt(sp, []);
    for (const label of ['Mots-clés bonus', 'Domaines bonus']) {
      expect(perf).toContain(label);
      expect(diag).toContain(label);
    }
  });
});

describe('défaut 3 - score incompréhensible', () => {
  test('le score est un entier accompagné de sa décomposition', () => {
    const rows = [{ title: 'RSSI', score: 45.575, action: null }];
    const diag = generateDiagnosticPrompt(profile(), rows);
    expect(diag).not.toContain('45.575');
    expect(diag).toMatch(/titre/i);
  });
});

describe('défaut 4 - nombre d\'offres codé en dur', () => {
  test('le libellé reflète le nombre réel d\'offres listées', () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ title: `Offre ${i}`, score: 50, action: null }));
    const diag = generateDiagnosticPrompt(profile(), rows);
    expect(diag).not.toContain('20 dernières');
    expect(diag).toContain('17');
  });
});

describe('défaut 5 - doublons sans entreprise', () => {
  test('deux offres sans entreprise, même titre, mêmes lieu, sources différentes : un doublon', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'RSSI H/F', company: null, source: 'apec', score: 60, location: 'Paris' },
      { title: 'RSSI H/F', company: null, source: 'wttj', score: 50, location: 'Paris' },
    ]);
    expect(skip.size).toBe(1);
  });
  test('sans lieu ni entreprise : pas de dédoublonnage hasardeux', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'RSSI H/F', company: null, source: 'apec', score: 60 },
      { title: 'RSSI H/F', company: null, source: 'wttj', score: 50 },
    ]);
    expect(skip.size).toBe(0);
  });
  test('liste : une offre à deux feedbacks ou un doublon de même source tient une seule ligne', () => {
    const rows = [
      { title: 'RSSI', company: null, location: 'Paris', source: 'apec' },
      { title: 'rssi', company: null, location: 'PARIS', source: 'apec' },
      { title: 'RSSI', company: 'ACME', location: 'Paris', source: 'apec' },
      { title: 'RSSI', company: 'Acme', location: 'Lyon', source: 'wttj' },
    ];
    expect(dedupeOffers(rows)).toHaveLength(2);
  });
});

describe('défaut 6 - le LLM ne voit que des titres', () => {
  test('le diagnostic mentionne entreprise, lieu et source des offres', () => {
    const rows = [{ title: 'RSSI', score: 50, action: null, company: 'ACME', location: 'Lyon', source: 'apec' }];
    const diag = generateDiagnosticPrompt(profile(), rows as never);
    expect(diag).toContain('ACME');
    expect(diag).toContain('Lyon');
    expect(diag).toContain('apec');
  });
});

describe('défaut 7 - zéro action non signalé', () => {
  test('le prompt signale l\'absence d\'action et priorise le tri', () => {
    const rows = [{ title: 'RSSI', score: 50, action: null }];
    const diag = generateDiagnosticPrompt(profile(), rows);
    expect(diag.toLowerCase()).toContain('aucune action');
    expect(diag.toLowerCase()).toContain('trier');
  });
});

describe('défaut 8 - signal appris contraire au profil', () => {
  test('un terme du profil n\'est pas appris en négatif', () => {
    const p = profile({ jobTitles: ['responsable cybersécurité'] });
    const dict = processFeedback('Responsable cybersécurité', 'thumbs_down', { positive: {}, negative: {} }, p);
    expect(dict.negative['cybersécurité']).toBeUndefined();
  });
});

describe('défaut 9 - pistes identiques', () => {
  test('une piste aux intitulés identiques à une autre est signalée', () => {
    const ctx = {
      alertName: 'A',
      otherAlerts: [{ name: 'B', jobTitles: ['RSSI', 'DSI'] }],
    };
    const perf = generatePerformanceOptimizationPrompt(null, [], profile({ jobTitles: ['RSSI', 'DSI'] }), perfMetrics, ctx);
    expect(perf.toLowerCase()).toContain('quasi identique');
  });
});

describe('défaut 10 - incohérences de configuration', () => {
  test('un salaire cible hors tranche APEC est signalé', () => {
    const sp = profile({ salary: { min: null, target: 50000 }, apecSalaires: ['40-50k€'] });
    const perf = generatePerformanceOptimizationPrompt(null, [], sp, perfMetrics);
    expect(perf.toLowerCase()).toContain('incohérence');
  });
});

describe('défaut 11 - profil incomplet', () => {
  test('le diagnostic contient le profil candidat', () => {
    const diag = generateDiagnosticPrompt(profile(), []);
    expect(diag).toContain('Profil');
  });
});

describe('défaut 12 - sortie non applicable', () => {
  test('le prompt demande un JSON watch-analysis/v1', () => {
    const perf = generatePerformanceOptimizationPrompt(null, [], profile(), perfMetrics);
    expect(perf).toContain('watch-analysis/v1');
  });
});

describe('défaut 13 - métriques sans échantillon', () => {
  test('la pertinence est accompagnée de son dénominateur et de sa période', () => {
    const now = new Date();
    const mk = (i: number, isRead: boolean) => ({
      id: `o${i}`, source: 'apec', title: `Offre ${i}`, company: `Soc ${i}`, location: null, contractType: null,
      salaryMin: null, salaryMax: null, salaryRaw: null, publishedAt: null, fetchedAt: now.toISOString(),
      storedScore: 50, snippet: null, isRead, kanban: false, actions: [],
    });
    const ctx = buildWatchAnalysisContext({
      now, alert: { id: 'a', name: 'A', searchProfile: profile({ jobTitles: ['rssi'] }), learnedDict: { positive: {}, negative: {} } },
      otherAlerts: [], candidate: { title: null, mainSkills: [], city: null, experienceYears: null },
      offers: [...Array.from({ length: 7 }, (_, i) => mk(i, true)), ...Array.from({ length: 13 }, (_, i) => mk(100 + i, false))],
    });
    const prompt = generateWatchAnalysisPrompt(ctx, 'performance');
    expect(prompt).toMatch(/35\s?% de 20 offres/);
    expect(prompt).toContain('30 jours');
  });
  test('API dépréciée : pourcentage signalé sans échantillon plutôt que présenté comme exact', () => {
    const perf = generatePerformanceOptimizationPrompt(null, [], profile(), perfMetrics);
    expect(perf).toContain('échantillon non communiqué');
  });
});

describe('défaut 8 (suite) - apprentissage protégé et oubli', () => {
  test('les termes hors profil sont toujours appris en négatif', () => {
    const p = profile({ jobTitles: ['responsable cybersécurité'] });
    const dict = processFeedback('Responsable commercial BTP', 'quick_archive', { positive: {}, negative: {} }, p);
    expect(dict.negative['commercial']).toBe(2);
    expect(dict.negative['btp']).toBe(2);
    expect(dict.negative['responsable']).toBeUndefined();
  });
  test('sans profil : comportement historique inchangé', () => {
    const dict = processFeedback('Responsable cybersécurité', 'thumbs_down', { positive: {}, negative: {} });
    expect(dict.negative['cybersécurité']).toBe(1);
  });
  test('un conflit hérité est listé avec son compteur puis oublié', () => {
    const p = profile({ jobTitles: ['responsable cybersécurité'] });
    const legacy = { positive: {}, negative: { 'cybersécurité': 6, btp: 4 } };
    const signals = listLearnedSignals(legacy, p);
    expect(signals.find(s => s.term === 'cybersécurité')).toMatchObject({ count: 6, sense: 'negative', conflict: true });
    expect(signals.find(s => s.term === 'btp')?.conflict).toBe(false);
    expect(forgetLearnedTerms(legacy, ['Cybersécurité']).negative).toEqual({ btp: 4 });
  });
});
