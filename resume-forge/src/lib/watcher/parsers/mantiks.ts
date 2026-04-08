/**
 * Parser Mantiks Job API
 *
 * Mantiks est une solution d'agrégation d'offres d'emploi pour le marché
 * français avec filtres avancés, webhooks et historique.
 *
 * Documentation API : https://developers.mantiks.io
 * Authentification : Bearer token (clé API obtenue sur mantiks.io)
 *
 * Endpoint principal : GET https://api.mantiks.io/v1/jobs
 * Paramètres supportés :
 *   - q          : mots-clés de recherche (titre/description)
 *   - location   : ville ou région
 *   - contract   : CDI, CDD, FREELANCE, INTERNSHIP, APPRENTICESHIP
 *   - page       : pagination (1-based)
 *   - per_page   : résultats par page (max 50)
 *   - country    : code pays (default "FR")
 *
 * Qualité d'extraction : HIGH — données structurées JSON
 *
 * Note : Si Mantiks change son API, ajuster les types FT_* ci-dessous.
 * La clé API est stockée dans job_watch_settings sous 'mantiks_api_key'.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { buildWttjQuery, isExcludedByProfile } from '../profile-to-query';
import { tauriFetch } from '../http';

/** Default endpoint — can be overridden via settings.mantiksBaseUrl */
const DEFAULT_MANTIKS_API_BASE = 'https://api.mantiks.io/v1/jobs';
const PAGE_SIZE = 50;
const MAX_PAGES = 3;  // 150 offres max par collecte

// ── Contract type mapping ────────────────────────────────────────────────────

const CONTRACT_MAP: Record<string, string> = {
  'CDI':           'CDI',
  'CDD':           'CDD',
  'FREELANCE':     'Freelance',
  'INTERNSHIP':    'Stage',
  'APPRENTICESHIP':'Alternance',
  'INTERIM':       'Intérim',
  'PART_TIME':     'CDD',
  'FULL_TIME':     'CDI',
};

// ── Mantiks API response types ────────────────────────────────────────────────

interface MantiksJob {
  id?:            string;
  title?:         string;
  company?: {
    name?: string;
    size?: string;
  };
  location?: {
    city?:        string;
    region?:      string;
    department?:  string;
    latitude?:    number;
    longitude?:   number;
    remote?:      boolean;
  };
  contract_type?: string;
  description?:   string;
  url?:           string;
  published_at?:  string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: 'ANNUAL' | 'MONTHLY';
  };
  source?: {
    name?: string;
    url?:  string;
  };
}

interface MantiksResponse {
  data?:  MantiksJob[];
  meta?: {
    total?:        number;
    current_page?: number;
    last_page?:    number;
    per_page?:     number;
  };
}

// ── Salary normalisation ──────────────────────────────────────────────────────

function normaliseSalary(salary?: MantiksJob['salary']): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryRaw: string | null;
} {
  if (!salary?.min && !salary?.max) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  let min = salary.min ?? null;
  let max = salary.max ?? null;
  const cur = salary.currency ?? '€';

  // Convert monthly to annual
  if (salary.period === 'MONTHLY') {
    if (min) min = Math.round(min * 12);
    if (max) max = Math.round(max * 12);
  }

  const raw = min != null
    ? `${min}${max && max !== min ? '–' + max : ''} ${cur}/an`
    : null;

  return { salaryMin: min, salaryMax: max, salaryRaw: raw };
}

// ── Location formatting ───────────────────────────────────────────────────────

function formatLocation(location?: MantiksJob['location']): string | null {
  if (!location) return null;
  if (location.remote) return 'Télétravail';
  const parts: string[] = [];
  if (location.city)   parts.push(location.city);
  if (location.department && !location.city) parts.push(location.department);
  else if (location.region && !location.city) parts.push(location.region);
  return parts.join(', ') || null;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseMantiks(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const anySettings = settings as unknown as Record<string, string>;
  const apiKey      = anySettings['mantiksApiKey'] ?? '';
  const baseUrl     = (anySettings['mantiksBaseUrl'] || DEFAULT_MANTIKS_API_BASE).replace(/\/$/, '');

  if (!apiKey) {
    throw new Error('Mantiks : clé API requise (champ « Clé API Mantiks » dans les options avancées)');
  }

  const profile = settings.searchProfile;
  const query   = buildWttjQuery(profile); // same: keywords + city

  // Build contract type filter
  const contractFilter = profile.contractTypes
    .map(ct => {
      const entry = Object.entries(CONTRACT_MAP).find(([, v]) => v === ct);
      return entry ? entry[0] : null;
    })
    .filter(Boolean)
    .join(',');

  const offers: RawJobOffer[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      country:  'FR',
      per_page: String(PAGE_SIZE),
      page:     String(page),
    });

    if (query.query)     params.set('q', query.query);
    if (query.city)      params.set('location', query.city);
    if (contractFilter)  params.set('contract', contractFilter);

    const res = await tauriFetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // A 404 almost always means the endpoint URL is wrong (Mantiks has changed
      // their public API several times). Give the user actionable guidance.
      if (res.status === 404) {
        throw new Error(
          `Mantiks : endpoint introuvable (404) à ${baseUrl}. ` +
          `Vérifiez l'URL de base dans la configuration (champ « URL API Mantiks ») — ` +
          `consultez https://developers.mantiks.io pour la valeur actuelle, ou désactivez la source.`
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Mantiks : authentification refusée (${res.status}). ` +
          `Vérifiez votre clé API dans les options avancées.`
        );
      }
      throw new Error(`Mantiks API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as MantiksResponse;
    const jobs  = data.data ?? [];

    for (const job of jobs) {
      if (!job.title || !job.url) continue;

      const { salaryMin, salaryMax, salaryRaw } = normaliseSalary(job.salary);
      const location = formatLocation(job.location);

      const hasCoords = job.location?.latitude != null && job.location?.longitude != null;

      const extraction: ExtractionMetadata = {
        titleSource:        'api',
        titleConfidence:    'high',
        locationSource:     hasCoords ? 'api_coords' : (location ? 'api_text' : 'none'),
        locationConfidence: hasCoords ? 'high' : (location ? 'high' : 'none'),
        contractSource:     job.contract_type ? 'api' : 'none',
        contractConfidence: job.contract_type ? 'high' : 'none',
      };

      offers.push({
        source:             'mantiks',
        url:                job.url,
        title:              job.title,
        company:            job.company?.name ?? null,
        location,
        locationLat:        job.location?.latitude  ?? null,
        locationLon:        job.location?.longitude ?? null,
        contractType:       job.contract_type ? (CONTRACT_MAP[job.contract_type] ?? job.contract_type) : null,
        descriptionSnippet: job.description?.slice(0, 500) ?? null,
        publishedAt:        job.published_at ?? null,
        salaryMin,
        salaryMax,
        salaryRaw,
        extraction,
      });
    }

    // Stop if we've fetched all pages
    if (!data.meta?.last_page || page >= data.meta.last_page) break;
    if (jobs.length < PAGE_SIZE) break;

    // Respect rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  // Local exclusion filter
  return offers.filter(o => {
    const text = `${o.title} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
