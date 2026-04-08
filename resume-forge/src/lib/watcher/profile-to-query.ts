/**
 * profile-to-query.ts
 *
 * Derives per-source search query parameters from a unified SearchProfile.
 * This is the bridge between the "what I'm looking for" config and the
 * technical parameters each API/parser expects.
 *
 * Design principles:
 *  - One SearchProfile → N source-specific query objects
 *  - Explicit field mapping per source (no magic)
 *  - Graceful degradation: if a required field is missing (e.g. INSEE code
 *    for France Travail), the query still works but logs a warning
 */

import type { SearchProfile, JobSource } from '@/types/job-watch';

// ── APEC ─────────────────────────────────────────────────────────────────────

/** APEC typeContrat codes */
const APEC_CONTRACT_CODES: Record<string, number> = {
  'CDI':        101888,
  'CDD':        101887,
  'Intérim':    101886,
  'Stage':      101885,
  'Alternance': 101884,
};

export interface ApecQueryParams {
  motsCles: string | undefined;
  lieux: string[];
  typesContrat: number[];
}

export function buildApecQuery(profile: SearchProfile): ApecQueryParams {
  // Combine job titles + skills for the keyword query
  const allKeywords = [...profile.jobTitles, ...profile.skills].filter(Boolean);
  let motsCles = allKeywords.join(' ') || undefined;

  // Append exclusion operators (APEC supports "ET NON (term1 OU term2)")
  const excluded = [...profile.excludeTitles, ...profile.excludeDomains].filter(Boolean);
  if (motsCles && excluded.length > 0) {
    motsCles += ` ET NON (${excluded.join(' OU ')})`;
  }

  // Map contract types to APEC numeric codes
  const typesContrat = profile.contractTypes
    .map(ct => APEC_CONTRACT_CODES[ct])
    .filter((code): code is number => code !== undefined);

  // Map department codes from profile
  const lieux = profile.location.departmentCodes.filter(Boolean);

  return { motsCles, lieux, typesContrat };
}

// ── France Travail ────────────────────────────────────────────────────────────

/** France Travail typeContrat codes */
const FT_CONTRACT_CODES: Record<string, string> = {
  'CDI':        'CDI',
  'CDD':        'CDD',
  'Intérim':    'MIS',
  'Stage':      'SAI',
  'Alternance': 'CDD', // FT uses CDD for apprentissage as well
  'Freelance':  'LIB',
};

export interface FranceTravailQueryParams {
  motsCles: string | undefined;
  commune: string | undefined;
  departement: string | undefined;
  distance: number | undefined;
  typeContrat: string | undefined;
}

export function buildFranceTravailQuery(profile: SearchProfile): FranceTravailQueryParams {
  const allKeywords = [...profile.jobTitles, ...profile.skills].filter(Boolean);
  let motsCles: string | undefined = allKeywords.join(' ') || undefined;

  // FT supports boolean exclusions with "-term"
  const excluded = [...profile.excludeTitles, ...profile.excludeDomains].filter(Boolean);
  if (motsCles && excluded.length > 0) {
    motsCles += ' ' + excluded.map(ex => `-${ex}`).join(' ');
  }

  // Prefer INSEE code if provided, otherwise skip commune (query will be national)
  const commune = profile.location.inseeCode?.match(/^\d{5}$/)
    ? profile.location.inseeCode
    : undefined;

  if (!commune && profile.location.inseeCode) {
    console.warn(
      `[profile-to-query] FT: inseeCode "${profile.location.inseeCode}" is not a 5-digit INSEE code. ` +
      'Falling back to department-level search.'
    );
  }

  // Fall back to first department code if no INSEE
  const departement = !commune && profile.location.departmentCodes.length > 0
    ? profile.location.departmentCodes[0]
    : undefined;

  const distance = profile.location.radiusKm > 0 ? profile.location.radiusKm : undefined;

  // Only pass the first contract type to FT (API takes one typeContrat at a time)
  const typeContrat = profile.contractTypes.length > 0
    ? FT_CONTRACT_CODES[profile.contractTypes[0]]
    : undefined;

  return { motsCles, commune, departement, distance, typeContrat };
}

// ── WTTJ ─────────────────────────────────────────────────────────────────────

export interface WttjQueryParams {
  query: string | undefined;
  city: string | undefined;
}

export function buildWttjQuery(profile: SearchProfile): WttjQueryParams {
  const allKeywords = [...profile.jobTitles, ...profile.skills].filter(Boolean);
  const query = allKeywords.join(' ') || undefined;
  const city  = profile.location.city || undefined;
  return { query, city };
}

// ── LinkedIn RSS ─────────────────────────────────────────────────────────────

/** LinkedIn RSS uses a provided URL; no query building needed. */
export interface LinkedInRssQueryParams {
  rssUrl: string | null;
}

export function buildLinkedInRssQuery(rssUrl: string | null): LinkedInRssQueryParams {
  return { rssUrl };
}

// ── Generic exclude-keyword filter ───────────────────────────────────────────

/**
 * Returns true if the offer text contains any excluded term from the profile.
 * Used as a local post-filter for sources that don't support server-side exclusion.
 */
export function isExcludedByProfile(
  text: string,
  profile: SearchProfile,
): boolean {
  const lower = text.toLowerCase();
  const excluded = [...profile.excludeTitles, ...profile.excludeDomains];
  return excluded.some(ex => ex.trim() && lower.includes(ex.trim().toLowerCase()));
}

// ── Source query builder registry ────────────────────────────────────────────

/** Returns a human-readable description of what the profile will query per source */
export function summarizeSourceQuery(source: JobSource, profile: SearchProfile): string {
  switch (source) {
    case 'apec': {
      const p = buildApecQuery(profile);
      const parts = [p.motsCles ?? '(mots-clés vides)'];
      if (profile.location.departmentCodes.length > 0) {
        parts.push(`depts: ${profile.location.departmentCodes.join(', ')}`);
      }
      if (p.typesContrat.length > 0) parts.push(`contrats: ${profile.contractTypes.join(', ')}`);
      return parts.join(' | ');
    }
    case 'france_travail': {
      const p = buildFranceTravailQuery(profile);
      const parts = [p.motsCles ?? '(mots-clés vides)'];
      if (p.commune) parts.push(`INSEE: ${p.commune}`);
      else if (p.departement) parts.push(`dept: ${p.departement}`);
      if (p.distance) parts.push(`rayon: ${p.distance}km`);
      if (p.typeContrat) parts.push(`contrat: ${p.typeContrat}`);
      return parts.join(' | ');
    }
    case 'wttj': {
      const p = buildWttjQuery(profile);
      const parts = [p.query ?? '(mots-clés vides)'];
      if (p.city) parts.push(`ville: ${p.city}`);
      return parts.join(' | ');
    }
    case 'linkedin_rss':
      return 'Via flux RSS (URL configurée)';
  }
}
