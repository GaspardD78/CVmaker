/**
 * Parser Indeed — flux RSS officiel
 * URL pattern: https://fr.indeed.com/rss?q=MOTS&l=LIEU&radius=KM
 */

import { RawJobOffer } from '@/types/job-watch';
import { fetchRssFeed, stripHtml, parseDate } from './rss-utils';
import type { JobWatchConfig } from '@/types/job-watch';

/** Build an Indeed RSS URL from config */
export function buildIndeedRssUrl(config: Pick<JobWatchConfig, 'keywords' | 'location' | 'radiusKm'>): string {
  const params = new URLSearchParams();
  if (config.keywords.length > 0) params.set('q', config.keywords.join(' '));
  if (config.location)            params.set('l', config.location);
  if (config.radiusKm)            params.set('radius', String(config.radiusKm));
  params.set('lang', 'fr');
  return `https://fr.indeed.com/rss?${params.toString()}`;
}

export async function parseIndeed(config: JobWatchConfig): Promise<RawJobOffer[]> {
  const url = config.rssUrl ?? buildIndeedRssUrl(config);
  let items;
  try {
    items = await fetchRssFeed(url);
  } catch (err) {
    if (err instanceof Error && /HTTP (403|404)/.test(err.message)) {
      console.warn('[indeed] Le flux RSS Indeed est supprimé (HTTP 403/404). Source ignorée. Envisagez de la désactiver.');
      return [];
    }
    throw err;
  }

  return items.map(item => {
    // Indeed title format: "Intitulé - Entreprise - Ville, Région"
    const dashIdx = item.title.indexOf(' - ');
    const title   = dashIdx !== -1 ? item.title.slice(0, dashIdx).trim() : item.title;
    const rest    = dashIdx !== -1 ? item.title.slice(dashIdx + 3) : '';
    const restParts = rest.split(' - ');
    const company = restParts[0]?.trim() || null;
    const location = restParts[1]?.trim() || null;

    // Contract type from description
    let contractType: string | null = null;
    const contractMatch = item.description.match(/\b(CDI|CDD|Freelance|Intérim|Stage|Alternance|Temps plein|Temps partiel)\b/i);
    if (contractMatch) contractType = contractMatch[1];

    return {
      source:             'indeed',
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
