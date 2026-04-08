/**
 * Parser Mantiks API
 *
 * Mantiks agrège des offres d'emploi en se basant sur les entreprises qui
 * recrutent. Le modèle est "companies-first" : on requête des entreprises
 * avec des critères (titre de poste, lieu), et l'API retourne des sociétés
 * accompagnées de la liste de leurs offres actives.
 *
 * Documentation : https://mantiks-api.readme.io/reference/getting-started-with-your-api
 * Authentification : header `x-api-key: <clé>`
 *
 * Endpoint utilisé :
 *   GET https://api.mantiks.io/company/search
 *     ?job_title=...
 *     &job_title_include_all=false
 *     &job_location_ids=<id1,id2>    (IDs Mantiks obtenus via /location/search)
 *     &job_age_in_days=30
 *     &limit=50
 *     &offset=<next_offset>
 *
 * Réponse :
 *   {
 *     companies: [
 *       {
 *         name, website, industry,
 *         jobs: [
 *           { job_title, location, job_board, job_board_url,
 *             date_creation, salary: { min, max, type, currency }, description }
 *         ]
 *       }
 *     ],
 *     next_offset: "cursor" | null
 *   }
 *
 * Coût : 1 crédit par company retournée (indépendamment du nombre de jobs).
 *
 * Qualité d'extraction : HIGH — données structurées JSON.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { isExcludedByProfile } from '../profile-to-query';
import { tauriFetch } from '../http';

/** Default base URL — overridable via settings.mantiksBaseUrl */
const DEFAULT_MANTIKS_API_BASE = 'https://api.mantiks.io';
const PAGE_SIZE = 50;
const MAX_PAGES = 3;        // hard cap to limit credits consumption
const JOB_AGE_DAYS = 30;    // only keep offers posted within the last 30 days

// ── Mantiks API response types ────────────────────────────────────────────────

interface MantiksSalary {
  min?:      number | null;
  max?:      number | null;
  type?:     'YEARLY' | 'MONTHLY' | string | null;
  currency?: string | null;
}

interface MantiksJob {
  job_title?:     string;
  location?:      string | null;
  job_board?:     string | null;
  job_board_url?: string | null;
  date_creation?: string | null;
  salary?:        MantiksSalary | null;
  description?:   string | null;
}

interface MantiksCompany {
  name?:     string;
  website?:  string | null;
  industry?: string | null;
  jobs?:     MantiksJob[];
}

interface MantiksCompaniesResponse {
  companies?:   MantiksCompany[];
  next_offset?: string | null;
}

// ── Salary normalisation ──────────────────────────────────────────────────────

function normaliseSalary(salary?: MantiksSalary | null): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryRaw: string | null;
} {
  if (!salary || (salary.min == null && salary.max == null)) {
    return { salaryMin: null, salaryMax: null, salaryRaw: null };
  }

  let min = salary.min ?? null;
  let max = salary.max ?? null;
  const cur = salary.currency ?? '€';

  // Convert monthly to annual
  if (salary.type === 'MONTHLY') {
    if (min != null) min = Math.round(min * 12);
    if (max != null) max = Math.round(max * 12);
  }

  const raw = min != null
    ? `${min}${max != null && max !== min ? '–' + max : ''} ${cur}/an`
    : max != null
      ? `≤ ${max} ${cur}/an`
      : null;

  return { salaryMin: min, salaryMax: max, salaryRaw: raw };
}

// ── Location resolution ───────────────────────────────────────────────────────

interface MantiksLocationEntry {
  id:         number;
  name:       string;
  full_name?: string;
  country?:   string;
  type?:      string;  // "city" | "region" | ...
}

interface MantiksLocationSearchResponse {
  nb_results?: number;
  results?:    MantiksLocationEntry[];
}

/**
 * Resolve a human-readable city name to Mantiks location IDs via
 * `GET /location/search?name=<city>`. Used as a fallback when the user
 * hasn't configured `mantiksLocationIds` manually.
 *
 * Response shape (from the official OpenAPI spec):
 *   {
 *     "nb_results": 15,
 *     "results": [
 *       { "id": 2988507, "name": "Paris", "full_name": "Paris - Île-de-France - France",
 *         "country": "France", "type": "city" },
 *       ...
 *     ]
 *   }
 *
 * We prefer French entries of type "city", then fall back to any French entry,
 * then to whatever comes first. We keep up to 3 IDs to widen the net.
 */
async function resolveLocationIds(
  baseUrl: string,
  apiKey: string,
  cityName: string,
): Promise<string[]> {
  const url = `${baseUrl}/location/search?name=${encodeURIComponent(cityName)}`;
  const res = await tauriFetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Accept':    'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Mantiks : impossible de résoudre le lieu "${cityName}" via /location/search ` +
      `(HTTP ${res.status}). Renseignez manuellement le champ « IDs de lieu Mantiks » ` +
      `dans les options avancées.`
    );
  }

  const data = await res.json() as MantiksLocationSearchResponse;
  const results = Array.isArray(data.results) ? data.results : [];

  if (results.length === 0) {
    throw new Error(
      `Mantiks : aucun lieu trouvé pour "${cityName}" via /location/search ` +
      `(nb_results=${data.nb_results ?? 0}). Renseignez manuellement le champ ` +
      `« IDs de lieu Mantiks » dans les options avancées.`
    );
  }

  // Rank candidates: French cities first, then French regions, then everything else.
  const rank = (e: MantiksLocationEntry): number => {
    const isFrance = e.country === 'France';
    const isCity   = e.type === 'city';
    if (isFrance && isCity) return 0;
    if (isFrance)           return 1;
    if (isCity)             return 2;
    return 3;
  };
  const sorted = [...results].sort((a, b) => rank(a) - rank(b));

  const ids = sorted
    .map(l => (typeof l.id === 'number' ? String(l.id) : null))
    .filter((x): x is string => x != null)
    .slice(0, 3);

  if (ids.length === 0) {
    throw new Error(
      `Mantiks : réponse /location/search sans IDs exploitables pour "${cityName}". ` +
      `Renseignez manuellement le champ « IDs de lieu Mantiks » dans les options avancées.`
    );
  }

  return ids;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseMantiks(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const anySettings = settings as unknown as Record<string, string>;
  const apiKey      = (anySettings['mantiksApiKey'] ?? '').trim();
  const baseUrl     = ((anySettings['mantiksBaseUrl'] || DEFAULT_MANTIKS_API_BASE).trim()).replace(/\/$/, '');
  let   locationIds = (anySettings['mantiksLocationIds'] ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!apiKey) {
    throw new Error('Mantiks : clé API requise (champ « Clé API Mantiks » dans les options avancées)');
  }

  const profile = settings.searchProfile;

  // Mantiks' job_title accepts a free-form string. We join job titles with
  // " OR " and keep job_title_include_all=false so any match counts. Skills
  // are used for local scoring, not the server-side query.
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean);
  if (titles.length === 0) {
    // Without a title, the query would be too broad and burn credits.
    return [];
  }
  const jobTitleParam = titles.length === 1 ? titles[0] : titles.join(' OR ');

  // Mantiks requires job_location_ids. If the user hasn't provided them,
  // fall back to resolving the profile city via /location/search.
  if (locationIds.length === 0) {
    const cityName = profile.location.city.trim();
    if (!cityName) {
      throw new Error(
        'Mantiks : `job_location_ids` requis par l\'API mais non configuré. ' +
        'Renseignez soit le champ « IDs de lieu Mantiks » (options avancées), ' +
        'soit une ville dans votre profil de recherche.'
      );
    }
    locationIds = await resolveLocationIds(baseUrl, apiKey, cityName);
    console.info(`[mantiks] Lieux résolus automatiquement pour "${cityName}":`, locationIds);
  }

  const endpoint = `${baseUrl}/company/search`;
  const offers: RawJobOffer[] = [];
  let nextOffset: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams();
    params.set('job_title',              jobTitleParam);
    params.set('job_title_include_all',  'false');
    params.set('job_age_in_days',        String(JOB_AGE_DAYS));
    params.set('limit',                  String(PAGE_SIZE));
    // Mantiks expects repeated `job_location_ids` params, one per ID
    // (OpenAPI style=form, explode=true). Comma-joining is rejected as invalid.
    for (const id of locationIds) {
      params.append('job_location_ids', id);
    }
    if (nextOffset) params.set('offset', nextOffset);

    const url = `${endpoint}?${params.toString()}`;

    const res = await tauriFetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Accept':    'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 404) {
        throw new Error(
          `Mantiks : endpoint introuvable (404) à ${endpoint}. ` +
          `Vérifiez l'URL de base dans la configuration — la valeur correcte est ` +
          `« https://api.mantiks.io ». Documentation : ` +
          `https://mantiks-api.readme.io/reference/getting-started-with-your-api`
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Mantiks : authentification refusée (${res.status}). ` +
          `Vérifiez votre clé API (header x-api-key) dans les options avancées.`
        );
      }
      if (res.status === 429) {
        throw new Error(
          `Mantiks : quota API dépassé (429). Consultez votre usage sur mantiks.io ou réessayez plus tard.`
        );
      }
      throw new Error(`Mantiks API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as MantiksCompaniesResponse;
    const companies = data.companies ?? [];

    // Flatten companies → jobs, preserving company metadata on each offer
    for (const company of companies) {
      const companyName = company.name ?? null;
      const jobs = company.jobs ?? [];

      for (const job of jobs) {
        const title = job.job_title?.trim();
        const url   = job.job_board_url?.trim();
        if (!title || !url) continue;

        const { salaryMin, salaryMax, salaryRaw } = normaliseSalary(job.salary);

        const extraction: ExtractionMetadata = {
          titleSource:        'api',
          titleConfidence:    'high',
          locationSource:     job.location ? 'api_text' : 'none',
          locationConfidence: job.location ? 'high' : 'none',
          // Mantiks does not expose a structured contract field; we leave
          // contractType unset and let the scorer handle it (balanced mode).
          contractSource:     'none',
          contractConfidence: 'none',
        };

        offers.push({
          source:             'mantiks',
          url,
          title,
          company:            companyName,
          location:           job.location ?? null,
          contractType:       null,
          descriptionSnippet: job.description?.slice(0, 500) ?? null,
          publishedAt:        job.date_creation ?? null,
          salaryMin,
          salaryMax,
          salaryRaw,
          extraction,
        });
      }
    }

    // Pagination: stop if no more pages or empty batch
    nextOffset = data.next_offset ?? null;
    if (!nextOffset) break;
    if (companies.length === 0) break;

    // Respect rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  // Local exclusion filter (also applied to company name since Mantiks is
  // company-first: excluding a company name should remove all its offers)
  return offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
