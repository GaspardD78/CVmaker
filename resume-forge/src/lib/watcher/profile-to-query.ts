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

/** Quote a term if it contains whitespace, so multi-word titles are matched as a phrase */
function quoteIfNeeded(term: string): string {
  const t = term.trim();
  if (!t) return '';
  if (/\s/.test(t) && !t.startsWith('"')) return `"${t}"`;
  return t;
}

export function buildApecQuery(profile: SearchProfile): ApecQueryParams {
  // Only use jobTitles for the keyword query (skills are used for scoring, not
  // to restrict the search — adding them AND-joined to the query killed recall).
  // Job titles are OR-combined so any match counts.
  const titles = profile.jobTitles.map(quoteIfNeeded).filter(Boolean);
  let motsCles: string | undefined;

  if (titles.length === 1) {
    motsCles = titles[0];
  } else if (titles.length > 1) {
    motsCles = `(${titles.join(' OU ')})`;
  }

  // Append exclusion operators (APEC supports "ET NON (term1 OU term2)")
  const excluded = [...profile.excludeTitles, ...profile.excludeDomains]
    .map(quoteIfNeeded)
    .filter(Boolean);
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

/**
 * Validates an INSEE commune code.
 * INSEE codes are 5 characters: 2-digit department + 3-digit commune number.
 * Paris/Lyon/Marseille use specific ranges (75056, 69123, 13055 for the city,
 * 75101-75120 / 69381-69389 / 13201-13216 for arrondissements).
 * Corsica uses "2A"/"2B" prefixes; DOM-TOM use "97x" prefixes.
 *
 * This rejects postal codes that users frequently confuse with INSEE codes
 * (e.g. "75000", "75001" — postal — vs "75056", "75101" — INSEE).
 */
export function isValidInseeCode(code: string): boolean {
  if (!code) return false;
  // Corsica: "2A" or "2B" + 3 digits
  if (/^2[AB]\d{3}$/.test(code)) return true;
  // Metropolitan + DOM: 5 digits
  if (!/^\d{5}$/.test(code)) return false;
  // A postal code ending in "000" is almost never a valid INSEE code
  // (INSEE codes for communes always have a non-zero suffix within the dept)
  if (code.endsWith('000')) return false;
  return true;
}

export function buildFranceTravailQuery(profile: SearchProfile): FranceTravailQueryParams {
  // France Travail's motsCles is a simple full-text search. Too many keywords
  // cause over-restriction → we keep only jobTitles (skills stay in scoring).
  // We cap at 5 titles to avoid pathological queries.
  const titles = profile.jobTitles.slice(0, 5).filter(Boolean);
  let motsCles: string | undefined = titles.length > 0 ? titles.join(' ') : undefined;

  // FT supports boolean exclusions with "-term" (single-word terms only).
  const excluded = [...profile.excludeTitles, ...profile.excludeDomains]
    .filter(Boolean)
    .filter(ex => !/\s/.test(ex.trim())); // skip multi-word terms — FT doesn't support them
  if (motsCles && excluded.length > 0) {
    motsCles += ' ' + excluded.map(ex => `-${ex.trim()}`).join(' ');
  }

  // Prefer INSEE code if valid, otherwise skip commune (query will fall back to departement)
  const rawInsee = profile.location.inseeCode?.trim() ?? '';
  const commune = isValidInseeCode(rawInsee) ? rawInsee : undefined;

  if (!commune && rawInsee) {
    console.warn(
      `[profile-to-query] FT: inseeCode "${rawInsee}" n'est pas un code INSEE valide. ` +
      'Astuce : ce n\'est PAS le code postal — cherchez le code INSEE de votre commune sur ' +
      'https://www.insee.fr/fr/information/2560452 (ex. 75056 pour Paris, 69123 pour Lyon). ' +
      'Repli sur une recherche par département.'
    );
  }

  // Always compute departement so the fallback works if commune is rejected (e.g. Paris 75056)
  const departement = profile.location.departmentCodes.length > 0
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
    case 'emploi_territorial':
      return 'Via flux RSS (URL configurée)';
    case 'mantiks': {
      const p = buildWttjQuery(profile);
      const parts = [p.query ?? '(mots-clés vides)'];
      if (p.city) parts.push(`ville: ${p.city}`);
      return parts.join(' | ');
    }
  }
}
