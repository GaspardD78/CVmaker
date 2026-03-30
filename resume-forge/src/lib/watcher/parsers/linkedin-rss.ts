/**
 * Parser LinkedIn via flux RSS tiers (rss.app, jobicy, ou autre).
 *
 * LinkedIn bloque le scraping direct. L'utilisateur fournit une URL RSS
 * générée par un service tiers (ex: rss.app) qui agrège les offres LinkedIn.
 * Cette URL est stockée dans job_watch_config.rss_url.
 */

import { RawJobOffer } from '@/types/job-watch';
import { fetchRssFeed, stripHtml, parseDate } from './rss-utils';
import type { JobWatchConfig } from '@/types/job-watch';

export async function parseLinkedinRss(config: JobWatchConfig): Promise<RawJobOffer[]> {
  if (!config.rssUrl) {
    console.warn('[linkedin_rss] Aucune URL RSS configurée — ignoré');
    return [];
  }

  const items = await fetchRssFeed(config.rssUrl);

  return items.map(item => {
    // Common LinkedIn RSS format: "Job Title at Company in Location"
    let title   = item.title;
    let company: string | null = null;
    let location: string | null = null;

    const atMatch = item.title.match(/^(.+?)\s+(?:at|chez|@)\s+(.+?)(?:\s+in\s+|\s+à\s+|\s+-\s+)?(.*)$/i);
    if (atMatch) {
      title    = atMatch[1].trim();
      company  = atMatch[2].trim() || null;
      location = atMatch[3].trim() || null;
    }

    // Fallback: try " - Company - Location" pattern
    if (!company) {
      const parts = item.title.split(' - ');
      if (parts.length >= 2) {
        title   = parts[0].trim();
        company = parts[1].trim() || null;
        if (parts.length >= 3) location = parts[2].trim() || null;
      }
    }

    // Extract contract type from description
    let contractType: string | null = null;
    const contractMatch = item.description.match(/\b(CDI|CDD|Freelance|Intérim|Stage|Alternance|Full.?time|Part.?time|Contract)\b/i);
    if (contractMatch) contractType = contractMatch[1];

    return {
      source:             'linkedin_rss',
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
