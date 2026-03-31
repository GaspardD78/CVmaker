/**
 * Parser APEC — flux RSS officiel
 * URL pattern: https://www.apec.fr/rss/offres-emploi.rss/typeoffre:OFFRE/motsCles:MOTS/lieux:LIEU
 *
 * L'URL est stockée dans job_watch_config.rss_url (construite ou fournie manuellement).
 */

import { RawJobOffer } from '@/types/job-watch';
import { fetchRssFeed, stripHtml, parseDate } from './rss-utils';
import type { JobWatchConfig } from '@/types/job-watch';

/** Encode a value for an APEC path segment (spaces as `+`, not `%20`) */
function encodeApecPath(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/** Build an APEC RSS URL from config keywords and location */
export function buildApecRssUrl(config: Pick<JobWatchConfig, 'keywords' | 'location'>): string {
  const kw = config.keywords.join(' ');
  const base = 'https://www.apec.fr/rss/offres-emploi.rss';
  const parts: string[] = ['typeoffre:OFFRE'];
  if (kw)              parts.push(`motsCles:${encodeApecPath(kw)}`);
  if (config.location) parts.push(`lieux:${encodeApecPath(config.location)}`);
  return `${base}/${parts.join('/')}`;
}

export async function parseApec(config: JobWatchConfig): Promise<RawJobOffer[]> {
  const url = config.rssUrl ?? buildApecRssUrl(config);
  console.debug('[apec] RSS URL:', url);
  const items = await fetchRssFeed(url);

  return items.map(item => {
    // APEC title format: "Intitulé poste - Entreprise - Localisation (contrat)"
    const titleParts = item.title.split(' - ');
    const title   = titleParts[0]?.trim() ?? item.title;
    const company = titleParts[1]?.trim() ?? null;

    // Extract location from title or description
    let location: string | null = null;
    const locMatch = item.title.match(/\(([^)]+)\)$/);
    if (locMatch) location = locMatch[1].trim();
    if (!location && titleParts[2]) location = titleParts[2].split('(')[0].trim() || null;

    // Extract contract type from description
    let contractType: string | null = null;
    const contractMatch = item.description.match(/\b(CDI|CDD|Freelance|Intérim|Stage|Alternance)\b/i);
    if (contractMatch) contractType = contractMatch[1];

    return {
      source:             'apec',
      url:                item.link,
      title,
      company,
      location,
      contractType,
      descriptionSnippet: stripHtml(item.description, 500),
      publishedAt:        parseDate(item.pubDate),
    } satisfies RawJobOffer;
  });
}
