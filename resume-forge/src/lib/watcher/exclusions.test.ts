import { describe, expect, test } from 'bun:test';
import { resolveExclusions, scopeOf } from './exclusions';

describe('resolveExclusions', () => {
  test('défauts : excludeTitles → title, excludeDomains → anywhere', () => {
    const r = resolveExclusions({ excludeTitles: ['stage'], excludeDomains: ['BTP'] });
    expect(r).toEqual([
      { term: 'stage', scope: 'title', origin: 'excludeTitles' },
      { term: 'BTP', scope: 'anywhere', origin: 'excludeDomains' },
    ]);
  });
  test('portée explicite prioritaire, clé insensible à la casse', () => {
    expect(scopeOf({ excludeTitles: ['Stage'], excludeDomains: [], excludeScopes: { stage: 'anywhere' } }, 'STAGE')).toBe('anywhere');
  });
  test('terme dans les deux listes : portée la plus large', () => {
    const r = resolveExclusions({ excludeTitles: ['btp'], excludeDomains: ['BTP'] });
    expect(r).toHaveLength(1);
    expect(r[0].scope).toBe('anywhere');
    expect(r[0].origin).toBe('both');
  });
  test('termes vides ignorés, terme inconnu → null', () => {
    expect(resolveExclusions({ excludeTitles: [' '], excludeDomains: [] })).toEqual([]);
    expect(scopeOf({ excludeTitles: [], excludeDomains: [] }, 'x')).toBeNull();
  });
});
