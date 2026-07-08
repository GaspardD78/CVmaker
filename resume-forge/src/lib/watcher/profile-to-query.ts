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
import { APEC_TYPES_CONTRAT, APEC_FONCTIONS, apecLieuFromDeptCode, APEC_SECTEURS, APEC_TELETRAVAIL } from './parsers/apec-ids';
import { cityToDeptCode } from './parsers/common/city-departments';

// ── APEC ─────────────────────────────────────────────────────────────────────

export interface ApecQueryParams {
  motsCles: string | undefined;
  /**
   * Liste d'IDs APEC entiers (issus de `apec-ids.ts`). Les départements absents
   * de la table sont laissés au post-filter client. Un tableau vide laisse
   * l'API renvoyer toute la France.
   */
  lieux: number[];
  typesContrat: number[];
  /**
   * IDs de fonctions APEC (`fonctions` dans `rechercheOffre`). Filtre exact
   * côté serveur — remplace avantageusement `motsCles` pour les domaines
   * cartographiés dans `APEC_FONCTIONS`. Un tableau vide = aucun filtre.
   */
  fonctions: number[];
  secteurs: number[];
  teletravail: number[];
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

  // Pas d'opérateur d'exclusion serveur : APEC documente `ET` / `OU` / `SAUF`
  // mais PAS `NON`. L'expression `... ET NON (...)` envoyée précédemment était
  // invalide et dégradait toute la recherche (motsCles ignoré → dernières
  // offres génériques de toute la France, toutes rejetées ensuite par le
  // post-filtre titre). Les exclusions restent appliquées côté client via
  // `isExcludedByProfile` dans le parser — comme pour les autres sources.

  // Map contract types to APEC numeric codes
  const typesContrat = profile.contractTypes
    .map(ct => APEC_TYPES_CONTRAT[ct])
    .filter((code): code is number => code !== undefined);

  // Map department codes (string) → APEC integer IDs. Les départements non
  // tabulés tombent silencieusement et seront filtrés post-fetch côté client.
  const lieux: number[] = [];
  for (const code of profile.location.departmentCodes) {
    const id = apecLieuFromDeptCode(code);
    if (id !== undefined) lieux.push(id);
  }

  // Map selected function labels → APEC integer IDs. Les libellés absents de
  // la table (non encore capturés) sont silencieusement ignorés.
  const fonctions: number[] = (profile.apecFonctions ?? [])
    .map(label => APEC_FONCTIONS[label])
    .filter((id): id is number => id !== undefined);

  const secteurs: number[] = (profile.apecSecteurs ?? [])
    .map(label => APEC_SECTEURS[label])
    .filter((id): id is number => id !== undefined);

  const teletravail: number[] = (profile.apecTeletravail ?? [])
    .map(label => APEC_TELETRAVAIL[label])
    .filter((id): id is number => id !== undefined);

  // NB : `profile.apecSalaires` n'est volontairement PAS traduit en paramètre
  // d'API. APEC filtre le salaire via `salaireMinimum`/`salaireMaximum` (et non
  // via une liste de tranches), et le scorer applique déjà ce critère à partir
  // de `profile.salary`. Voir le commentaire sur le corps de requête dans
  // `parsers/apec.ts`.
  return { motsCles, lieux, typesContrat, fonctions, secteurs, teletravail };
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
  /** Comma-joined titles (client-side loop uses individual titles instead) */
  motsCles: string | undefined;
  /** List of job titles to query one-by-one (FT `motsCles` only supports AND, no OR) */
  titles: string[];
  commune: string | undefined;
  departement: string | undefined;
  distance: number | undefined;
  /**
   * CSV de codes contrat FT (`CDI`, `CDD`, `MIS`, `SAI`, `LIB`). L'API accepte
   * une liste — pas besoin de boucler. Vide → tous types.
   */
  typeContrat: string | undefined;
  /**
   * Fenêtre de fraîcheur — valeurs autorisées par l'API : `1`, `3`, `7`, `14`, `31`
   * jours. Défaut 7 pour limiter au flux récent (mode veille).
   */
  publieeDepuis: number | undefined;
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
  // France Travail's motsCles does NOT support OR / ET / boolean operators:
  //   - Multiple words (space or comma-joined) are combined with implicit AND
  //   - No OR/OU, no parentheses, no `-term` exclusion
  // Space-joining all job titles therefore requires ALL words to appear in
  // every offer — returning 0 results in practice.
  // We expose the raw title list; the parser runs one request per title and
  // merges/deduplicates results client-side. Exclusions are applied locally
  // via `isExcludedByProfile` post-fetch.
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean).slice(0, 5);
  // Kept for backwards-compat (summarizeSourceQuery, tests). The parser does
  // not rely on this field anymore — it iterates over `titles` instead.
  const motsCles: string | undefined = titles[0];

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

  // Always compute departement so the fallback works if commune is rejected (e.g. Paris 75056).
  // FT's `departement` param accepts a comma-separated list of 2-digit codes (e.g. "75,92,93,95").
  // Repli : sans departmentCodes ni INSEE valide mais avec une ville connue, on
  // dérive le département de la ville — sinon la recherche FT part sans AUCUN
  // filtre géographique et ramène des centaines d'offres de toute la France.
  let departement = profile.location.departmentCodes.length > 0
    ? profile.location.departmentCodes.join(',')
    : undefined;
  if (!departement && !commune) {
    const cityDept = cityToDeptCode(profile.location.city);
    if (cityDept) {
      departement = cityDept;
      console.info(
        `[profile-to-query] FT: pas de departmentCodes/INSEE — département "${cityDept}" dérivé de la ville "${profile.location.city}".`,
      );
    }
  }

  // `distance` n'a de sens qu'avec `commune`. radiusKm = 0 signifie « ville
  // uniquement » et doit être transmis explicitement : sans le paramètre,
  // l'API France Travail applique son défaut de 10 km.
  const distance = profile.location.radiusKm >= 0 ? profile.location.radiusKm : undefined;

  // FT's `typeContrat` accepts a comma-separated list (CSV). On pousse tous
  // les types souhaités d'un coup au lieu de filtrer côté client — gain de
  // rappel sans coût réseau supplémentaire.
  const contractCodes = Array.from(new Set(
    profile.contractTypes
      .map(ct => FT_CONTRACT_CODES[ct])
      .filter((c): c is string => Boolean(c)),
  ));
  const typeContrat = contractCodes.length > 0 ? contractCodes.join(',') : undefined;

  // Fenêtre de fraîcheur. Valeurs autorisées par l'API : 1, 3, 7, 14, 31.
  // Défaut 7 jours = compromis entre rappel et fraîcheur ; le scorer applique
  // ensuite un time-decay (-2pt/jour) pour favoriser les plus récentes.
  const publieeDepuis: number | undefined = 7;

  return { motsCles, titles, commune, departement, distance, typeContrat, publieeDepuis };
}

// ── WTTJ ─────────────────────────────────────────────────────────────────────

export interface WttjQueryParams {
  query: string | undefined;
  city: string | undefined;
}

export function buildWttjQuery(profile: SearchProfile): WttjQueryParams {
  // Uniquement le premier intitulé de poste. Concaténer tous les jobTitles ET
  // les skills en une seule chaîne (« Talent Acquisition Talent Acquisition
  // Manager Recruteur ATS … ») sur-contraint la recherche plein-texte WTTJ et
  // renvoyait systématiquement 0 résultat. Les skills servent au scoring, pas
  // à restreindre la recherche.
  const query = profile.jobTitles.map(t => t.trim()).find(Boolean) || undefined;
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
      if (p.fonctions.length > 0) {
        const labels = (profile.apecFonctions ?? []).slice(0, 3);
        const suffix = (profile.apecFonctions?.length ?? 0) > 3 ? ` +${(profile.apecFonctions?.length ?? 0) - 3}` : '';
        parts.push(`fonctions: ${labels.join(', ')}${suffix}`);
      }
      return parts.join(' | ');
    }
    case 'france_travail': {
      const p = buildFranceTravailQuery(profile);
      const parts = [p.motsCles ?? '(mots-clés vides)'];
      if (p.commune) parts.push(`INSEE: ${p.commune}`);
      else if (p.departement) parts.push(`dept: ${p.departement}`);
      if (p.distance) parts.push(`rayon: ${p.distance}km`);
      if (p.typeContrat) parts.push(`contrat: ${p.typeContrat}`);
      if (p.publieeDepuis) parts.push(`fenêtre: ${p.publieeDepuis}j`);
      return parts.join(' | ');
    }
    case 'wttj': {
      const p = buildWttjQuery(profile);
      const parts = [p.query ?? '(mots-clés vides)'];
      if (p.city) parts.push(`ville: ${p.city}`);
      return parts.join(' | ');
    }
    case 'linkedin_rss':
      return 'Via flux RSS tiers (URL configurée)';
    case 'linkedin': {
      const kw = profile.jobTitles.join(' OR ') || '(aucun mot-clé)';
      const loc = profile.location.city || 'France';
      return `${kw} | ${loc} | API jobs-guest LinkedIn (offres publiques)`;
    }
    case 'indeed': {
      const kw = profile.jobTitles.join(' ') || '(aucun mot-clé)';
      const loc = profile.location.city || 'France';
      return `${kw} | ${loc} | WebView`;
    }
    case 'hellowork': {
      const kw = profile.jobTitles.join(' ') || '(aucun mot-clé)';
      const loc = profile.location.city || 'France';
      return `${kw} | ${loc} | WebView`;
    }
    case 'jobicy': {
      const tag = profile.jobTitles[0] ?? '';
      return tag ? `tag: ${tag} | remote worldwide` : 'remote worldwide (aucun tag)';
    }
    case 'emploi_territorial':
      return 'Via flux RSS (URL configurée)';
    case 'mantiks': {
      const p = buildWttjQuery(profile);
      const parts = [p.query ?? '(mots-clés vides)'];
      if (p.city) parts.push(`ville: ${p.city}`);
      return parts.join(' | ');
    }
    default: {
      // Exhaustiveness guard — forces the switch to cover every JobSource
      const _exhaustive: never = source;
      return `Source non prise en charge: ${_exhaustive as string}`;
    }
  }
}
