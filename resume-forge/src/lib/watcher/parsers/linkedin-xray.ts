/**
 * LinkedIn parser via Google-style X-ray search (Brave Search API).
 *
 * Pourquoi pas le scraping connecté ?
 *   LinkedIn interdit explicitement le scraping authentifié dans ses TOS et
 *   bannit régulièrement les comptes détectés (par fingerprint navigateur,
 *   patterns d'accès, IP). Le risque pour l'utilisateur est réel et non
 *   réversible (perte du compte personnel).
 *
 * Approche X-ray :
 *   1. Construire une requête booléenne `site:linkedin.com/jobs/view "..."`
 *      qui restreint Google/Brave aux pages d'offres publiques.
 *   2. Brave Search API renvoie une liste de résultats avec URLs publiques.
 *   3. Chaque URL `https://www.linkedin.com/jobs/view/<id>` est accessible
 *      sans authentification ; LinkedIn y publie un JSON-LD `JobPosting`
 *      complet, plus fiable que le scraping HTML car standardisé schema.org.
 *
 * Aucune session, aucun cookie : zéro risque de ban côté LinkedIn, et le
 * code marche identiquement sur desktop et Android.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import { fetchResilient } from '../http-client';
import { extractJsonLdJobs, type JsonLdJob } from '../json-ld-utils';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

/** Doit matcher uniquement les pages d'offres publiques (pas /jobs/collections/, /jobs/search/, etc.) */
const LINKEDIN_JOB_VIEW_RE = /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/jobs\/view\/\d+/i;

/** Cap dur sur le nombre d'URLs récupérées par exécution — protège quota Brave + temps de fetch. */
const MAX_RESULTS_PER_RUN = 20;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Construit une requête booléenne X-ray à partir du profil de recherche.
 *
 * Format : `site:linkedin.com/jobs/view ("dev" OR "ingénieur") ("Paris" OR "Lyon")`
 *
 * Pourquoi `site:linkedin.com/jobs/view` plutôt que `site:linkedin.com` ?
 *   - exclut les profils d'utilisateurs (`/in/...`)
 *   - exclut les pages entreprises (`/company/...`)
 *   - exclut les listes paginées (`/jobs/search/...`) qui ne contiennent
 *     pas le JSON-LD JobPosting de l'offre individuelle.
 */
function buildBooleanQuery(profile: SearchProfile): string {
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean);
  const city = profile.location.city?.trim();

  const parts: string[] = ['site:linkedin.com/jobs/view'];
  if (titles.length) {
    parts.push(`(${titles.map(t => `"${t}"`).join(' OR ')})`);
  }
  if (city) {
    parts.push(`"${city}"`);
  }
  return parts.join(' ');
}

/** Brave Search response shape — on ne typed que ce qu'on consomme. */
interface BraveSearchResponse {
  web?: {
    results?: Array<{
      url: string;
      title?: string;
      description?: string;
      age?: string;
    }>;
  };
}

/**
 * Récupère la liste des URLs d'offres LinkedIn via Brave Search.
 * `freshness=pw` = past week — on évite de remonter des offres vieilles
 * de plusieurs mois qui pollueraient le digest.
 */
async function searchBrave(query: string, apiKey: string): Promise<string[]> {
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(MAX_RESULTS_PER_RUN));
  url.searchParams.set('country', 'FR');
  url.searchParams.set('search_lang', 'fr');
  url.searchParams.set('freshness', 'pw');
  url.searchParams.set('safesearch', 'off');

  const res = await fetchResilient(url.toString(), {
    source: 'linkedin',
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept':               'application/json',
      'Accept-Encoding':      'gzip',
    },
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brave Search ${res.status} : ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as BraveSearchResponse;
  const urls = (data.web?.results ?? [])
    .map(r => r.url)
    .filter(u => LINKEDIN_JOB_VIEW_RE.test(u));
  // Dédoublonnage : Brave peut renvoyer la même offre via plusieurs sous-domaines (fr.linkedin.com / www.linkedin.com).
  const canonical = urls.map(canonicalizeLinkedinUrl);
  return Array.from(new Set(canonical));
}

/** Normalise l'URL en `https://www.linkedin.com/jobs/view/<id>` sans paramètres. */
function canonicalizeLinkedinUrl(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  if (!m) return url;
  return `https://www.linkedin.com/jobs/view/${m[1]}`;
}

/** Première localisation exploitable d'un JobPosting JSON-LD. */
function extractLocation(job: JsonLdJob): string | null {
  const loc = job.jobLocation;
  if (!loc) return null;
  const first = Array.isArray(loc) ? loc[0] : loc;
  const city = first?.address?.addressLocality?.trim();
  const region = first?.address?.addressRegion?.trim();
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? null;
}

/** Convertit un JobPosting JSON-LD LinkedIn en RawJobOffer interne. */
function jsonLdToRawOffer(job: JsonLdJob, sourceUrl: string): RawJobOffer | null {
  if (!job.title) return null;
  const company = job.hiringOrganization?.name?.trim() ?? null;
  const rawLocation = extractLocation(job);
  const location = rawLocation ? normalizeLocation(rawLocation) ?? rawLocation : null;
  // employmentType (LinkedIn) : "FULL_TIME", "CONTRACTOR", … → on tente d'abord
  // ce champ ; à défaut, regex sur le titre.
  const contractType =
    mapEmploymentType(job.employmentType) ??
    extractContractFromText(job.title) ??
    null;
  const description = stripHtml(job.description ?? '').slice(0, 1_000);

  const salary = job.baseSalary?.value;
  const salaryMin = salary?.minValue ?? null;
  const salaryMax = salary?.maxValue ?? salary?.value ?? null;
  const salaryRaw = salary
    ? `${salaryMin ?? ''}${salaryMax ? `-${salaryMax}` : ''} ${job.baseSalary?.currency ?? ''}`.trim() || null
    : null;

  return {
    source:             'linkedin',
    url:                sourceUrl,
    title:              job.title.trim(),
    company,
    location,
    contractType,
    descriptionSnippet: description || null,
    publishedAt:        job.datePosted ?? null,
    salaryMin,
    salaryMax,
    salaryRaw,
    extraction: {
      titleSource:        'json_ld',
      titleConfidence:    'high',
      locationSource:     location ? 'json_ld' : 'none',
      locationConfidence: location ? 'high' : 'none',
      contractSource:     contractType ? (job.employmentType ? 'json_ld' : 'regex') : 'none',
      contractConfidence: contractType ? (job.employmentType ? 'high' : 'low') : 'none',
    },
  };
}

function mapEmploymentType(et?: string): string | null {
  if (!et) return null;
  switch (et.toUpperCase()) {
    case 'FULL_TIME':  return 'CDI';
    case 'PART_TIME':  return 'Temps partiel';
    case 'CONTRACTOR': return 'Freelance';
    case 'TEMPORARY':  return 'CDD';
    case 'INTERN':     return 'Stage';
    default:           return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function parseLinkedinXray(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const apiKey = settings.braveSearchApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "LinkedIn (X-ray) : configure ta clé Brave Search API dans " +
      "Paramètres › Veille › Options avancées (https://brave.com/search/api).",
    );
  }

  const profile = settings.searchProfile;
  const query = buildBooleanQuery(profile);
  if (!profile.jobTitles.some(t => t.trim())) {
    // Sans mots-clés, le X-ray remonterait n'importe quoi → on s'abstient.
    return [];
  }

  const urls = await searchBrave(query, apiKey);
  if (urls.length === 0) return [];

  const offers: RawJobOffer[] = [];
  for (const url of urls) {
    try {
      const res = await fetchResilient(url, {
        source: 'linkedin',
        headers: {
          'User-Agent':       DESKTOP_UA,
          'Accept':           'text/html,application/xhtml+xml',
          'Accept-Language':  'fr-FR,fr;q=0.9,en;q=0.8',
        },
        timeoutMs: 12_000,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const jsonLdJobs = extractJsonLdJobs(html);
      for (const j of jsonLdJobs) {
        const offer = jsonLdToRawOffer(j, url);
        if (!offer) continue;
        const filterText = `${offer.title} ${offer.company ?? ''} ${offer.descriptionSnippet ?? ''}`;
        if (isExcludedByProfile(filterText, profile)) continue;
        offers.push(offer);
      }
    } catch (err) {
      // Une URL en échec ne doit pas faire planter toute la collecte.
      console.warn('[linkedin-xray] fetch échoué', url, err);
    }
  }

  return offers;
}
