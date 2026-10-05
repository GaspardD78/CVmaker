import { describe, expect, it } from 'bun:test';
import { DEFAULT_SEARCH_PROFILE, type JobWatchAlert } from '@/types/job-watch';
import { findNearDuplicateAlert, titleSimilarity } from './alert-similarity';

function alert(id: string, jobTitles: string[], enabled = 1): JobWatchAlert {
  return {
    id, name: id, color: '#000', kind: 'core', position: 0, enabled,
    searchProfile: { ...DEFAULT_SEARCH_PROFILE, jobTitles },
    aiFilterRule: null, learnedDict: { positive: {}, negative: {} }, companyReputation: {},
    learnedDecayedAt: null, lastFetchedAt: null, createdAt: '', sources: [],
  };
}

describe('pistes quasi identiques', () => {
  it('mêmes intitulés (casse et accents ignorés) : similarité 1', () => {
    expect(titleSimilarity(['Chargé de recrutement', 'Recruteur'], ['recruteur', 'Charge de recrutement'])).toBe(1);
  });

  it('intitulés disjoints ou vides : 0', () => {
    expect(titleSimilarity(['Recruteur'], ['Sourceur'])).toBe(0);
    expect(titleSimilarity([], ['Sourceur'])).toBe(0);
  });

  it('principale et secondaire aux mêmes intitulés : signalée', () => {
    const principale = alert('Recherche principale', ['Talent Acquisition', 'Tech Recruiter']);
    const secondaire = alert('Recherche secondaire', ['Talent Acquisition', 'Tech Recruiter']);
    const found = findNearDuplicateAlert(secondaire, [principale, secondaire]);
    expect(found?.otherName).toBe('Recherche principale');
  });

  it('pistes distinctes ou désactivées : rien', () => {
    const a = alert('A', ['Recruteur', 'Sourceur']);
    expect(findNearDuplicateAlert(a, [a, alert('B', ['Consultant RH'])])).toBeNull();
    expect(findNearDuplicateAlert(a, [a, alert('C', ['Recruteur', 'Sourceur'], 0)])).toBeNull();
  });
});
