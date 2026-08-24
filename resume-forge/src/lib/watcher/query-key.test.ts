import { describe, expect, test } from 'bun:test';
import { computeQueryKey } from './query-key';
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';

function profile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    ...DEFAULT_SEARCH_PROFILE,
    jobTitles: ['Recruteur', 'Talent Acquisition'],
    location: { ...DEFAULT_SEARCH_PROFILE.location, city: 'Paris', inseeCode: '75056', departmentCodes: ['75', '92'], radiusKm: 30 },
    ...overrides,
  };
}

describe('computeQueryKey', () => {
  test('deux profils identiques produisent la même empreinte', () => {
    expect(computeQueryKey('apec', profile())).toBe(computeQueryKey('apec', profile()));
  });

  test("l'ordre et la casse des intitulés n'influent pas", () => {
    const a = computeQueryKey('apec', profile({ jobTitles: ['Recruteur', 'Talent Acquisition'] }));
    const b = computeQueryKey('apec', profile({ jobTitles: [' talent acquisition ', 'RECRUTEUR'] }));
    expect(a).toBe(b);
  });

  test('une ville différente produit une empreinte différente', () => {
    const paris = computeQueryKey('wttj', profile());
    const lyon  = computeQueryKey('wttj', profile({
      location: { ...DEFAULT_SEARCH_PROFILE.location, city: 'Lyon' },
    }));
    expect(paris).not.toBe(lyon);
  });

  test('les critères purement de scoring ne changent pas la requête', () => {
    // Deux pistes qui interrogent la même chose mais notent différemment
    // doivent partager une seule requête réseau.
    const base = computeQueryKey('apec', profile());
    expect(computeQueryKey('apec', profile({ skills: ['ATS', 'sourcing'] }))).toBe(base);
    expect(computeQueryKey('apec', profile({ domains: ['SaaS'] }))).toBe(base);
    expect(computeQueryKey('apec', profile({ excludeTitles: ['stage', 'alternance'] }))).toBe(base);
    expect(computeQueryKey('apec', profile({ salary: { min: 40000, target: 55000 } }))).toBe(base);
    expect(computeQueryKey('apec', profile({ blacklistedCompanies: ['Acme'] }))).toBe(base);
    expect(computeQueryKey('apec', profile({ scoring: { mode: 'strict' } }))).toBe(base);
  });

  test('les filtres serveur APEC font partie de la requête', () => {
    const base = computeQueryKey('apec', profile());
    expect(computeQueryKey('apec', profile({ apecFonctions: ['Chargé de recrutement'] }))).not.toBe(base);
  });

  test('les filtres APEC ne perturbent pas les autres sources', () => {
    const base = computeQueryKey('wttj', profile());
    expect(computeQueryKey('wttj', profile({ apecFonctions: ['Chargé de recrutement'] }))).toBe(base);
  });

  test('deux sources différentes ne partagent jamais une requête', () => {
    expect(computeQueryKey('apec', profile())).not.toBe(computeQueryKey('wttj', profile()));
  });

  test('une URL RSS personnalisée change la requête', () => {
    const sans  = computeQueryKey('jobicy', profile());
    const avec = computeQueryKey('jobicy', profile(), 'https://exemple.test/flux.xml');
    expect(sans).not.toBe(avec);
  });

  test('WTTJ ignore les intitulés au-delà de ceux réellement interrogés', () => {
    const trois = computeQueryKey('wttj', profile({ jobTitles: ['a', 'b', 'c'] }));
    const quatre = computeQueryKey('wttj', profile({ jobTitles: ['a', 'b', 'c', 'd'] }));
    expect(trois).toBe(quatre);
  });
});
