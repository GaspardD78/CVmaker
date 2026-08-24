/**
 * Parser Welcome to the Jungle — API Algolia publique + fallback HTML
 *
 * La page de recherche WTTJ (welcometothejungle.com/fr/jobs) est une SPA :
 * les résultats sont rendus côté client via Algolia InstantSearch. Le HTML
 * initial ne contient NI JSON-LD JobPosting NI cartes d'offres — scraper la
 * page renvoie donc toujours 0 offre (statut « Vide » dans le dashboard).
 *
 * Stratégie 1 : API Algolia publique de WTTJ (HIGH confidence).
 *   Les identifiants (app ID + clé search-only) sont embarqués dans le
 *   frontend de WTTJ et publics. La clé est restreinte au Referer
 *   welcometothejungle.com — on passe par tauriFetch (Rust, CORS-free) qui
 *   autorise l'en-tête Referer.
 * Stratégie 2 : scraping HTML de la page de recherche (legacy) — utilisé si
 *   l'appel Algolia échoue (rotation de clé, changement d'index…) ou si
 *   l'utilisateur a configuré une URL custom (config.rssUrl).
 *
 * Qualité d'extraction :
 *   Titre   : HIGH via Algolia (champ structuré), MEDIUM si HTML
 *   Lieu    : HIGH via Algolia (offices[].city), LOW si HTML
 *   Contrat : HIGH via Algolia (contract_type), none si HTML
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata, SearchProfile } from '@/types/job-watch';
import { stripHtml, parseDate } from './rss-utils';
import { buildWttjQuery, isExcludedByProfile } from '../profile-to-query';
import { BROWSER_USER_AGENT } from '../http';
import { fetchResilient } from '../http-client';
import { extractJsonLdJobsFromDoc, parseJobLocation, parseJobDate } from '../json-ld-utils';
import type { JsonLdJob } from '../json-ld-utils';

const WTTJ_SEARCH_URL = 'https://www.welcometothejungle.com/fr/jobs';
const TIMEOUT_MS = 10_000;

// Identifiants Algolia publics de WTTJ (embarqués dans leur bundle JS —
// vérifiés février 2026). La clé est search-only et restreinte au Referer
// welcometothejungle.com. Si WTTJ les fait tourner, l'appel échoue et on
// retombe sur le fallback HTML.
const ALGOLIA_APP_ID  = 'CSEKHVMS53';
const ALGOLIA_API_KEY = '4bd8f6215d0cc52b26430765769e65a0';
const ALGOLIA_INDEX   = 'wttj_jobs_production_fr';
const ALGOLIA_URL     = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const ALGOLIA_HITS_PER_PAGE = 50;
/** Nombre max d'intitulés de poste interrogés (une requête Algolia chacun) */
const MAX_QUERY_TITLES = 3;

export function buildWttjUrl(_config: JobWatchConfig, profile: SearchProfile): string {
  const query  = buildWttjQuery(profile);
  const params = new URLSearchParams();
  if (query.query) params.set('query', query.query);
  params.set('refinementList[offices.country_code][]', 'FR');
  if (query.city)  params.set('refinementList[offices.city][]', query.city);
  return `${WTTJ_SEARCH_URL}?${params.toString()}`;
}

/** Normalise WTTJ employmentType / contract_type to a canonical French label */
function normaliseEmploymentType(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes('full_time') || r.includes('full-time') || r.includes('cdi')) return 'CDI';
  if (r.includes('temporary'))                                                 return 'CDD';
  if (r.includes('part_time') || r.includes('part-time'))                      return 'CDD';
  if (r.includes('contractor') || r.includes('freelance'))                     return 'Freelance';
  if (r.includes('intern') || r.includes('stage'))                             return 'Stage';
  if (r.includes('apprentice') || r.includes('alternance') || r.includes('alternating')) return 'Alternance';
  if (r.includes('vie'))                                                       return 'VIE';
  return raw;
}

// ── Strategy 1: Algolia public search API ────────────────────────────────────

/** Shape (partielle, défensive) d'un hit de l'index Algolia jobs de WTTJ */
export interface WttjAlgoliaHit {
  name?: string;
  slug?: string;
  reference?: string;
  organization?: { name?: string; slug?: string };
  offices?: Array<{ city?: string; country_code?: string; latitude?: number | string; longitude?: number | string }>;
  contract_type?: string;
  published_at?: string;
  summary?: string;
  profile?: string | string[];
  salary_yearly_minimum?: number;
  salary_minimum?: number;
  salary_maximum?: number;
  salary_currency?: string;
  salary_period?: string;
  _geoloc?: { lat?: number; lng?: number } | Array<{ lat?: number; lng?: number }>;
}

async function queryAlgolia(query: string, city: string | undefined): Promise<WttjAlgoliaHit[]> {
  const facetFilters: string[][] = [['offices.country_code:FR']];
  if (city) facetFilters.push([`offices.city:${city}`]);

  const doQuery = async (filters: string[][]): Promise<WttjAlgoliaHit[]> => {
    const res = await fetchResilient(ALGOLIA_URL, {
      source: 'wttj',
      method: 'POST',
      timeoutMs: TIMEOUT_MS,
      headers: {
        'x-algolia-application-id': ALGOLIA_APP_ID,
        'x-algolia-api-key':        ALGOLIA_API_KEY,
        'Content-Type':             'application/json',
        'Referer':                  'https://www.welcometothejungle.com/',
        'Origin':                   'https://www.welcometothejungle.com',
      },
      body: JSON.stringify({
        query,
        hitsPerPage: ALGOLIA_HITS_PER_PAGE,
        facetFilters: filters,
      }),
    });
    if (!res.ok) throw new Error(`Algolia HTTP ${res.status}`);
    const data = (await res.json()) as { hits?: WttjAlgoliaHit[] };
    if (!Array.isArray(data.hits)) throw new Error('Algolia: réponse sans champ hits');
    return data.hits;
  };

  const hits = await doQuery(facetFilters);
  // Le facet ville est un match exact ("Boulogne-Billancourt" ≠ "Boulogne
  // Billancourt"). Si le filtre ville ne ramène rien, on réessaie France
  // entière — le post-filtre géographique du fetcher écartera le hors-zone.
  if (hits.length === 0 && city) {
    return doQuery([['offices.country_code:FR']]);
  }
  return hits;
}

/** Exporté pour les tests unitaires */
export function hitToOffer(hit: WttjAlgoliaHit): RawJobOffer | null {
  const title = hit.name?.trim();
  if (!title) return null;

  const orgSlug = hit.organization?.slug;
  const jobSlug = hit.slug ?? hit.reference;
  // Sans URL canonique on ne peut ni dédupliquer ni ouvrir l'offre — on écarte.
  if (!orgSlug || !jobSlug) return null;
  const url = `https://www.welcometothejungle.com/fr/companies/${orgSlug}/jobs/${jobSlug}`;

  // Premier bureau français, sinon premier bureau tout court
  const offices   = Array.isArray(hit.offices) ? hit.offices : [];
  const officeIdx = offices.findIndex(o => o?.country_code === 'FR');
  const office    = offices[officeIdx] ?? offices[0];
  const city      = office?.city?.trim() || null;
  let lat = office?.latitude  != null ? Number(office.latitude)  : NaN;
  let lon = office?.longitude != null ? Number(office.longitude) : NaN;

  // Repli `_geoloc` : selon les hits, les coordonnées ne sont pas dans
  // `offices[]` mais dans `_geoloc` (objet, ou tableau aligné sur `offices`).
  // Sans coordonnées, le post-filtre géographique du fetcher ne peut pas
  // classer l'offre (« Montpellier » sans code département → `unknown`,
  // conservée) et la veille se remplit d'offres hors zone.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const geo = Array.isArray(hit._geoloc)
      ? hit._geoloc[officeIdx >= 0 ? officeIdx : 0]
      : hit._geoloc;
    lat = geo?.lat != null ? Number(geo.lat) : NaN;
    lon = geo?.lng != null ? Number(geo.lng) : NaN;
  }

  // Salaire — annualise les montants mensuels
  let salaryMin = hit.salary_yearly_minimum ?? hit.salary_minimum ?? null;
  let salaryMax = hit.salary_maximum ?? null;
  let salaryRaw: string | null = null;
  if (salaryMin !== null && hit.salary_yearly_minimum == null && /month/i.test(hit.salary_period ?? '')) {
    salaryMin = Math.round(salaryMin * 12);
    if (salaryMax !== null) salaryMax = Math.round(salaryMax * 12);
  }
  if (salaryMin !== null) {
    const cur = hit.salary_currency ?? '€';
    salaryRaw = `${salaryMin}${salaryMax !== null && salaryMax !== salaryMin ? '-' + salaryMax : ''} ${cur}`;
  }

  const profileText = Array.isArray(hit.profile) ? hit.profile.join('\n') : hit.profile;
  const description = hit.summary || profileText || null;

  const extraction: ExtractionMetadata = {
    titleSource:        'api',
    titleConfidence:    'high',
    locationSource:     city ? 'api_text' : 'none',
    locationConfidence: city ? 'high' : 'none',
    contractSource:     hit.contract_type ? 'api' : 'none',
    contractConfidence: hit.contract_type ? 'high' : 'none',
  };

  return {
    source:             'wttj',
    url,
    title,
    company:            hit.organization?.name ?? null,
    location:           city,
    locationLat:        Number.isFinite(lat) ? lat : null,
    locationLon:        Number.isFinite(lon) ? lon : null,
    contractType:       normaliseEmploymentType(hit.contract_type),
    descriptionSnippet: description ? stripHtml(description, 500) : null,
    publishedAt:        parseDate(hit.published_at ?? null),
    salaryMin,
    salaryMax,
    salaryRaw,
    extraction,
  };
}

async function parseWttjAlgolia(profile: SearchProfile): Promise<RawJobOffer[]> {
  // Une requête par intitulé de poste (les concaténer sur-contraint la
  // recherche plein-texte — cf. buildWttjQuery). Dédup par URL canonique.
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean).slice(0, MAX_QUERY_TITLES);
  const queries = titles.length > 0 ? titles : [''];
  const city = profile.location.city || undefined;

  const byUrl = new Map<string, RawJobOffer>();
  for (const q of queries) {
    const hits = await queryAlgolia(q, city);
    for (const hit of hits) {
      const offer = hitToOffer(hit);
      if (offer && !byUrl.has(offer.url)) byUrl.set(offer.url, offer);
    }
  }
  return Array.from(byUrl.values());
}

// ── Strategy 2: HTML scraping fallback (legacy) ──────────────────────────────

async function parseWttjHtml(
  config: JobWatchConfig,
  profile: SearchProfile,
): Promise<RawJobOffer[]> {
  const pageUrl = config.rssUrl ?? buildWttjUrl(config, profile);

  const res = await fetchResilient(pageUrl, {
    source: 'wttj',
    timeoutMs: TIMEOUT_MS,
    headers: {
      'User-Agent':      BROWSER_USER_AGENT,
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');

  const offers: RawJobOffer[] = [];

  // JSON-LD structured data (si présent — pages non-SPA / cache SSR)
  const jobs: JsonLdJob[] = extractJsonLdJobsFromDoc(doc);

  for (const job of jobs) {
    const city        = parseJobLocation(job);
    const contractRaw = normaliseEmploymentType(job.employmentType);
    const offerUrl    = job.url ?? pageUrl;

    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let salaryRaw: string | null = null;
    if (job.baseSalary?.value) {
      const bv = job.baseSalary.value;
      salaryMin = bv.minValue ?? bv.value ?? null;
      salaryMax = bv.maxValue ?? bv.value ?? null;
      if (salaryMin !== null) {
        const cur  = job.baseSalary.currency ?? '€';
        const unit = bv.unitText?.toLowerCase();
        if (unit === 'month' || unit === 'monthly') {
          salaryMin = Math.round(salaryMin * 12);
          if (salaryMax) salaryMax = Math.round(salaryMax * 12);
        }
        salaryRaw = `${salaryMin}${salaryMax && salaryMax !== salaryMin ? '-' + salaryMax : ''} ${cur}`;
      }
    }

    const extraction: ExtractionMetadata = {
      titleSource:        'json_ld',
      titleConfidence:    'high',
      locationSource:     city ? 'json_ld' : 'none',
      locationConfidence: city ? 'medium' : 'none',
      contractSource:     job.employmentType ? 'json_ld' : 'none',
      contractConfidence: job.employmentType ? 'medium' : 'none',
    };

    offers.push({
      source:             'wttj',
      url:                offerUrl,
      title:              job.title!,
      company:            job.hiringOrganization?.name ?? null,
      location:           city,
      contractType:       contractRaw,
      descriptionSnippet: job.description ? stripHtml(job.description, 500) : null,
      publishedAt:        parseJobDate(job),
      salaryMin,
      salaryMax,
      salaryRaw,
      extraction,
    });
  }

  // HTML fallback (MEDIUM confidence)
  if (offers.length === 0) {
    const cards = Array.from(
      doc.querySelectorAll('[data-testid="job-list-item"], article[class*="job"]')
    );

    for (const card of cards) {
      const titleEl    = card.querySelector('h3, h2, [class*="title"]');
      const companyEl  = card.querySelector('[class*="company"], [class*="organization"]');
      const locationEl = card.querySelector('[class*="location"], [class*="city"]');
      const linkEl     = card.querySelector('a[href*="/jobs/"]');

      if (!titleEl || !linkEl) continue;

      const href = linkEl.getAttribute('href') ?? '';
      const url  = href.startsWith('http') ? href : `https://www.welcometothejungle.com${href}`;

      const extraction: ExtractionMetadata = {
        titleSource:        'html_primary',
        titleConfidence:    'medium',
        locationSource:     locationEl ? 'html' : 'none',
        locationConfidence: locationEl ? 'low' : 'none',
        contractSource:     'none',
        contractConfidence: 'none',
      };

      offers.push({
        source:             'wttj',
        url,
        title:              titleEl.textContent?.trim() ?? '',
        company:            companyEl?.textContent?.trim() ?? null,
        location:           locationEl?.textContent?.trim() ?? null,
        contractType:       null,
        descriptionSnippet: null,
        publishedAt:        null,
        extraction,
      });
    }
  }

  return offers;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function parseWttj(
  config: JobWatchConfig,
  _settings: JobWatchSettings,
  profile: SearchProfile,
): Promise<RawJobOffer[]> {

  let offers: RawJobOffer[];

  if (config.rssUrl) {
    // URL custom configurée par l'utilisateur → scraping HTML de cette page
    offers = await parseWttjHtml(config, profile);
  } else {
    try {
      offers = await parseWttjAlgolia(profile);
    } catch (err) {
      // Clé/index Algolia obsolète, réseau… — on retente via la page HTML
      // (probablement vide car SPA, mais c'est le seul recours restant).
      console.warn('[wttj] API Algolia indisponible, fallback scraping HTML :', err);
      offers = await parseWttjHtml(config, profile);
    }
  }

  // Filtre d'exclusion local (WTTJ ne supporte pas l'exclusion côté serveur)
  return offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
