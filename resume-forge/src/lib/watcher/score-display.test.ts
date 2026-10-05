import { describe, expect, test } from 'bun:test';
import { computeScoreWithBreakdown } from './scorer';
import { formatBreakdown, formatScore } from './score-display';
import { DEFAULT_EXTRACTION, DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';

const offer = (title: string, publishedAt: string | null = null) => ({
  title, descriptionSnippet: null, publishedAt, company: null,
  salaryMin: 30000, salaryMax: null, contractType: null,
  extraction: { ...DEFAULT_EXTRACTION, titleConfidence: 'high' as const },
});

describe('score affiché', () => {
  test('entier', () => {
    expect(formatScore(45.575)).toBe(46);
    expect(formatScore(86.67)).toBe(87);
  });
  test('décomposition : titre, mots-clés, domaine, salaire, ancienneté', () => {
    const sp = { ...DEFAULT_SEARCH_PROFILE, contractTypes: [], jobTitles: ['rssi'], skills: ['iso'], salary: { min: 40000, target: null } };
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const b = computeScoreWithBreakdown(offer('RSSI ISO', old), sp);
    const text = formatBreakdown(b);
    expect(text).toContain('Titre +40');
    expect(text).toContain('Mots-clés +6');
    expect(text).toContain('Salaire -30');
    expect(text).toContain('Ancienneté -10');
  });
  test('offre écartée : la raison remplace la décomposition', () => {
    const sp = { ...DEFAULT_SEARCH_PROFILE, excludeTitles: ['rssi'] };
    expect(formatBreakdown(computeScoreWithBreakdown(offer('RSSI'), sp))).toContain('Terme exclu');
  });
});
