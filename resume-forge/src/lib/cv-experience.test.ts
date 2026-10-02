import { describe, it, expect } from 'bun:test';
import { experienceMonths, experienceYears, suggestPageBudget } from './cv-experience';
import { makeEntry } from './test-helpers/cv-fixtures';

const NOW = new Date(Date.UTC(2026, 5, 15));

describe('experienceMonths', () => {
  it('somme des périodes, poste en cours jusqu\'à maintenant', () => {
    const e = [
      makeEntry('a', 'experience', 'A', { startDate: '2020-01', endDate: '2021-12' }),
      makeEntry('b', 'experience', 'B', { startDate: '2022-01', isCurrent: true }),
    ];
    // 2020-01 -> 2021-12 = 23 mois ; 2022-01 -> 2026-06 = 53 mois
    expect(experienceMonths(e, NOW)).toBe(23 + 53);
  });

  it('fusionne les périodes qui se chevauchent', () => {
    const e = [
      makeEntry('a', 'experience', 'A', { startDate: '2020-01', endDate: '2022-01' }),
      makeEntry('b', 'experience', 'B', { startDate: '2021-01', endDate: '2023-01' }),
    ];
    expect(experienceMonths(e, NOW)).toBe(36);
  });

  it('ignore les entrées qui ne sont pas des expériences ou sans date lisible', () => {
    const e = [
      makeEntry('a', 'education', 'A', { startDate: '2010', endDate: '2015' }),
      makeEntry('b', 'experience', 'B', { startDate: null }),
      makeEntry('c', 'experience', 'C', { startDate: 'n/a' }),
    ];
    expect(experienceMonths(e, NOW)).toBe(0);
  });

  it('années complètes et budget de pages', () => {
    const e = [makeEntry('a', 'experience', 'A', { startDate: '2011-01', isCurrent: true })];
    expect(experienceYears(e, NOW)).toBe(15);
    expect(suggestPageBudget(15)).toBe(2);
    expect(suggestPageBudget(3)).toBe(1);
    expect(suggestPageBudget(8)).toBe(1);
  });
});
