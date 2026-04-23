/**
 * Parser Jobicy — API JSON v2
 *
 * Jobicy est une plateforme d'offres remote. L'API JSON est préférable
 * au flux RSS (qui a 6h de délai).
 *
 * API endpoint : https://jobicy.com/api/v2/remote-jobs
 * Paramètres   : count (max 50), tag (mot-clé), industry, geo
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (champ API structuré)
 *   Lieu     : LOW  (jobGeo = région large ex. "EMEA", "Worldwide")
 *   Contrat  : MEDIUM (jobType structuré)
 *   Salaire  : HIGH si présent (salaryMin/Max/Currency/Period)
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { fetchResilient } from '../http-client';
import { stripHtml } from './rss-utils';

const JOBICY_API_URL = 'https://jobicy.com/api/v2/remote-jobs';

// ── Types API ─────────────────────────────────────────────────────────────────

interface JobicyJob {
  id:              number;
  url:             string;
  jobTitle:        string;
  companyName:     string;
  jobIndustry:     string[];
  jobType:         string[];
  jobGeo:          string;
  jobLevel:        string;
  jobExcerpt:      string;
  jobDescription:  string;
  pubDate:         string; // ISO 8601
  salaryMin?:      number;
  salaryMax?:      number;
  salaryCurrency?: string;
  salaryPeriod?:   string; // "yearly" | "hourly" etc.
}

interface JobicyResponse {
  jobCount:  number;
  jobs:      JobicyJob[];
  success?:  boolean;
  message?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise Jobicy jobType[] → label français canonique */
function normaliseJobType(jobType: string[]): string | null {
  const raw = (jobType[0] ?? '').toLowerCase();
  if (raw.includes('full'))                         return 'CDI';
  if (raw.includes('part'))                         return 'CDD';
  if (raw.includes('contract') || raw.includes('freelance')) return 'Freelance';
  if (raw.includes('intern'))                       return 'Stage';
  return jobType[0] ?? null;
}

/** Convertit un salaire mensuel en annuel si nécessaire */
function normaliseSalary(
  min: number | undefined,
  max: number | undefined,
  period: string | undefined,
  currency: string | undefined,
): { salaryMin: number | null; salaryMax: number | null; salaryRaw: string | null } {
  if (min == null) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  const multiplier = period === 'monthly' ? 12 : period === 'hourly' ? 1820 : 1;
  const annualMin = Math.round(min * multiplier);
  const annualMax = max != null ? Math.round(max * multiplier) : null;
  const cur       = currency ?? '€';

  const salaryRaw = annualMax && annualMax !== annualMin
    ? `${annualMin}–${annualMax} ${cur}`
    : `${annualMin} ${cur}`;

  return { salaryMin: annualMin, salaryMax: annualMax, salaryRaw };
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseJobicy(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const profile = settings.searchProfile;

  let fetchUrl: string;

  if (config.rssUrl) {
    // L'utilisateur a fourni une URL custom (ex. avec geo ou industry préconfigurés)
    fetchUrl = config.rssUrl;
  } else {
    // Construction automatique depuis le searchProfile
    const params = new URLSearchParams();
    params.set('count', '50');
    const tag = profile.jobTitles[0] ?? '';
    if (tag) params.set('tag', tag);
    fetchUrl = `${JOBICY_API_URL}?${params.toString()}`;
  }

  const res = await fetchResilient(fetchUrl, {
    source: 'jobicy',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as JobicyResponse;

  if (!data.jobs?.length) return [];

  return data.jobs.map(job => {
    const contractType = normaliseJobType(job.jobType);
    const { salaryMin, salaryMax, salaryRaw } = normaliseSalary(
      job.salaryMin, job.salaryMax, job.salaryPeriod, job.salaryCurrency,
    );

    const extraction: ExtractionMetadata = {
      titleSource:        'api',
      titleConfidence:    'high',
      locationSource:     job.jobGeo ? 'api_text' : 'none',
      locationConfidence: job.jobGeo ? 'low' : 'none',
      contractSource:     contractType ? 'api' : 'none',
      contractConfidence: contractType ? 'medium' : 'none',
    };

    return {
      source:             'jobicy',
      url:                job.url,
      title:              job.jobTitle,
      company:            job.companyName,
      location:           job.jobGeo || null,
      contractType,
      descriptionSnippet: job.jobExcerpt ? stripHtml(job.jobExcerpt, 500) : null,
      publishedAt:        job.pubDate,
      salaryMin,
      salaryMax,
      salaryRaw,
      extraction,
    } satisfies RawJobOffer;
  });
}
