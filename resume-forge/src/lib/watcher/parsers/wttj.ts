/**
 * Parser Welcome to the Jungle — scraping HTTP + parsing HTML
 *
 * WTTJ n'a pas de flux RSS. On scrape la page de recherche et on extrait
 * les offres depuis les balises JSON-LD ou les éléments HTML structurés.
 *
 * URL de recherche type:
 *   https://www.welcometothejungle.com/fr/jobs?query=MOTS&refinementList%5Boffices.country_code%5D%5B%5D=FR
 */

import { RawJobOffer } from '@/types/job-watch';
import { stripHtml, parseDate } from './rss-utils';
import type { JobWatchConfig } from '@/types/job-watch';
import { tauriFetch } from '../http';

const WTTJ_SEARCH_URL = 'https://www.welcometothejungle.com/fr/jobs';
const TIMEOUT_MS = 10_000;

export function buildWttjUrl(config: Pick<JobWatchConfig, 'keywords' | 'location'>): string {
  const params = new URLSearchParams();
  if (config.keywords.length > 0) params.set('query', config.keywords.join(' '));
  params.set('refinementList[offices.country_code][]', 'FR');
  if (config.location) params.set('refinementList[offices.city][]', config.location);
  return `${WTTJ_SEARCH_URL}?${params.toString()}`;
}

interface WttjJsonLdJob {
  '@type'?: string;
  title?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string } } | Array<{ address?: { addressLocality?: string } }>;
  employmentType?: string;
  description?: string;
  datePosted?: string;
  url?: string;
}

export async function parseWttj(config: JobWatchConfig): Promise<RawJobOffer[]> {
  const pageUrl = config.rssUrl ?? buildWttjUrl(config);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html: string;
  try {
    const res = await tauriFetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ResumeForge/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Strategy 1: Extract JSON-LD structured data
  const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const offers: RawJobOffer[] = [];

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent ?? '{}') as WttjJsonLdJob | { '@graph'?: WttjJsonLdJob[] } | WttjJsonLdJob[];
      const jobs: WttjJsonLdJob[] = [];

      if (Array.isArray(data)) {
        jobs.push(...data);
      } else if ('@graph' in data && Array.isArray(data['@graph'])) {
        jobs.push(...data['@graph']);
      } else if ((data as WttjJsonLdJob)['@type'] === 'JobPosting') {
        jobs.push(data as WttjJsonLdJob);
      }

      for (const job of jobs) {
        if (job['@type'] !== 'JobPosting' || !job.title) continue;

        const locationEl = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
        const location = locationEl?.address?.addressLocality ?? null;

        // Build URL: prefer explicit url, fallback to search page
        const offerUrl = job.url ?? pageUrl;

        offers.push({
          source:             'wttj',
          url:                offerUrl,
          title:              job.title,
          company:            job.hiringOrganization?.name ?? null,
          location,
          contractType:       job.employmentType ?? null,
          descriptionSnippet: job.description ? stripHtml(job.description, 500) : null,
          publishedAt:        parseDate(job.datePosted ?? null),
        });
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  // Strategy 2: Fallback HTML parsing if JSON-LD yields nothing
  if (offers.length === 0) {
    const cards = Array.from(doc.querySelectorAll('[data-testid="job-list-item"], article[class*="job"]'));
    for (const card of cards) {
      const titleEl   = card.querySelector('h3, h2, [class*="title"]');
      const companyEl = card.querySelector('[class*="company"], [class*="organization"]');
      const locationEl = card.querySelector('[class*="location"], [class*="city"]');
      const linkEl    = card.querySelector('a[href*="/jobs/"]');

      if (!titleEl || !linkEl) continue;

      const href = linkEl.getAttribute('href') ?? '';
      const url  = href.startsWith('http') ? href : `https://www.welcometothejungle.com${href}`;

      offers.push({
        source:             'wttj',
        url,
        title:              titleEl.textContent?.trim() ?? '',
        company:            companyEl?.textContent?.trim() ?? null,
        location:           locationEl?.textContent?.trim() ?? null,
        contractType:       null,
        descriptionSnippet: null,
        publishedAt:        null,
      });
    }
  }

  return offers;
}
