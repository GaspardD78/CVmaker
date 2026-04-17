/**
 * Parser Welcome to the Jungle — HTTP scraping + JSON-LD / HTML parsing
 *
 * WTTJ n'a pas de flux RSS. On scrape la page de recherche.
 * Stratégie 1 : JSON-LD JobPosting (structured data, HIGH confidence)
 * Stratégie 2 : HTML fallback (MEDIUM confidence)
 *
 * Qualité d'extraction :
 *   Titre   : HIGH si JSON-LD, MEDIUM si HTML
 *   Lieu    : MEDIUM si JSON-LD (addressLocality), LOW si HTML
 *   Contrat : MEDIUM si JSON-LD employmentType, LOW si regex
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { stripHtml } from './rss-utils';
import { buildWttjQuery, isExcludedByProfile } from '../profile-to-query';
import { tauriFetch, BROWSER_USER_AGENT } from '../http';
import { extractJsonLdJobsFromDoc, parseJobLocation, parseJobDate } from '../json-ld-utils';
import type { JsonLdJob } from '../json-ld-utils';

const WTTJ_SEARCH_URL = 'https://www.welcometothejungle.com/fr/jobs';
const TIMEOUT_MS = 10_000;

export function buildWttjUrl(_config: JobWatchConfig, settings: JobWatchSettings): string {
  const query  = buildWttjQuery(settings.searchProfile);
  const params = new URLSearchParams();
  if (query.query) params.set('query', query.query);
  params.set('refinementList[offices.country_code][]', 'FR');
  if (query.city)  params.set('refinementList[offices.city][]', query.city);
  return `${WTTJ_SEARCH_URL}?${params.toString()}`;
}

/** Normalise WTTJ employmentType to a canonical French label */
function normaliseEmploymentType(raw: string | undefined): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes('full_time') || r.includes('full-time') || r.includes('cdi')) return 'CDI';
  if (r.includes('part_time') || r.includes('part-time'))                       return 'CDD';
  if (r.includes('contractor') || r.includes('freelance'))                      return 'Freelance';
  if (r.includes('intern') || r.includes('stage'))                              return 'Stage';
  if (r.includes('apprentice') || r.includes('alternance'))                     return 'Alternance';
  return raw;
}

export async function parseWttj(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const pageUrl = config.rssUrl ?? buildWttjUrl(config, settings);
  const profile = settings.searchProfile;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html: string;
  try {
    const res = await tauriFetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':      BROWSER_USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }

  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');

  const offers: RawJobOffer[] = [];

  // ── Strategy 1: JSON-LD structured data (HIGH confidence) ─────────────────
  const jobs: JsonLdJob[] = extractJsonLdJobsFromDoc(doc);

  for (const job of jobs) {
    const city        = parseJobLocation(job);
    const contractRaw = normaliseEmploymentType(job.employmentType);
    const offerUrl    = job.url ?? pageUrl;

    // Salary from JSON-LD baseSalary (annual amounts)
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
        // Convert monthly salary to annual
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

  // ── Strategy 2: HTML fallback (MEDIUM confidence) ─────────────────────────
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

  // Local exclusion filter (WTTJ has no server-side exclusion support)
  return offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
