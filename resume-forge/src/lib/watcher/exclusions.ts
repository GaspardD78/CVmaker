/**
 * Portée des exclusions d'une piste.
 *
 * Historiquement, `excludeTitles` et `excludeDomains` étaient fusionnés en un veto
 * absolu sur titre ET description. Un terme courant dans les descriptions
 * (« développeur », « ingénieur ») éliminait alors des offres pertinentes.
 *
 * Le défaut est résolu À LA LECTURE, jamais réécrit : `excludeTitles` → `title`,
 * `excludeDomains` → `anywhere`. Les profils stockés restent donc intacts et le
 * score d'un terme d'`excludeDomains` ne change pas.
 */

import type { SearchProfile } from '@/types/job-watch';

export type ExclusionScope = 'title' | 'anywhere';

export interface ResolvedExclusion {
  /** Terme tel que saisi (première occurrence). */
  term: string;
  scope: ExclusionScope;
  /** Liste d'origine ; `both` si le terme figure dans les deux. */
  origin: 'excludeTitles' | 'excludeDomains' | 'both';
}

export const exclusionKey = (term: string): string => term.trim().toLowerCase();

export function resolveExclusions(
  profile: Pick<SearchProfile, 'excludeTitles' | 'excludeDomains' | 'excludeScopes'>,
): ResolvedExclusion[] {
  const byKey = new Map<string, ResolvedExclusion>();
  const explicit = profile.excludeScopes ?? {};

  const add = (term: string, origin: 'excludeTitles' | 'excludeDomains') => {
    const key = exclusionKey(term);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      // Un terme présent dans les deux listes : portée la plus large.
      existing.origin = 'both';
      existing.scope = explicit[key] ?? 'anywhere';
      return;
    }
    const fallback: ExclusionScope = origin === 'excludeDomains' ? 'anywhere' : 'title';
    byKey.set(key, { term: term.trim(), scope: explicit[key] ?? fallback, origin });
  };

  for (const t of profile.excludeTitles ?? []) add(t, 'excludeTitles');
  for (const t of profile.excludeDomains ?? []) add(t, 'excludeDomains');
  return [...byKey.values()];
}

/** Portée effective d'un terme exclu, ou null s'il n'est pas exclu. */
export function scopeOf(
  profile: Pick<SearchProfile, 'excludeTitles' | 'excludeDomains' | 'excludeScopes'>,
  term: string,
): ExclusionScope | null {
  const key = exclusionKey(term);
  return resolveExclusions(profile).find(e => exclusionKey(e.term) === key)?.scope ?? null;
}
