/**
 * Parser Indeed FR via WebView Tauri.
 *
 * Indeed peut être scrapé sans login, mais sa protection anti-bot
 * (Cloudflare + JS challenges) rend le scraping HTTP direct peu fiable.
 * La WebView résout les deux problèmes : JS exécuté, cookies conservés
 * entre les collectes (si l'utilisateur passe une fois un challenge,
 * les cookies de bypass restent valides plusieurs heures).
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (`h2.jobTitle`)
 *   Entreprise: HIGH (`[data-testid="company-name"]`)
 *   Lieu     : MEDIUM (`[data-testid="text-location"]`)
 *   Contrat  : MEDIUM (`[data-testid="attribute_snippet_testid"]`)
 *   Salaire  : MEDIUM quand affiché (souvent absent)
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings } from '@/types/job-watch';
import { scrapeWithSession } from '../session-manager';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText, normalizeContractType } from './common/contract-type';
import { extractSalaryFromText } from './common/salary';

function buildIndeedUrl(settings: JobWatchSettings): string {
  const profile = settings.searchProfile;
  const titles = profile.jobTitles.map(t => `"${t.trim()}"`).join(' OR ');
  const q = titles || profile.skills[0] || '';
  const l = profile.location.city || 'France';
  const params = new URLSearchParams({ q, l, sort: 'date', fromage: '1' });
  return `https://fr.indeed.com/emplois?${params.toString()}`;
}

export async function parseIndeed(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
  profileId?: string | null,
): Promise<RawJobOffer[]> {
  const url = buildIndeedUrl(settings);
  const html = await scrapeWithSession('indeed', url, {
    waitSelector: '#mosaic-provider-jobcards, .jobsearch-ResultsList, [data-testid="jobListing"]',
    timeoutSecs:  25,
  }, profileId);

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = Array.from(
    doc.querySelectorAll('[data-testid="jobListing"], div.job_seen_beacon, .resultWithShelf')
  );

  const profile = settings.searchProfile;
  const offers: RawJobOffer[] = [];

  for (const card of cards) {
    const titleEl   = card.querySelector('h2.jobTitle a, h2.jobTitle span, a.jcs-JobTitle');
    const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
    const locEl     = card.querySelector('[data-testid="text-location"], .companyLocation');
    const attrEl    = card.querySelector('[data-testid="attribute_snippet_testid"], .attribute_snippet');
    const salaryEl  = card.querySelector('[data-testid="attribute_snippet_compensation"], .salary-snippet');
    const linkEl    = card.querySelector<HTMLAnchorElement>('a.jcs-JobTitle, h2.jobTitle a');

    const title   = titleEl?.textContent?.trim();
    const company = companyEl?.textContent?.trim();
    const location = normalizeLocation(locEl?.textContent?.trim());
    const href    = linkEl?.getAttribute('href');

    if (!title || !href) continue;
    const offerUrl = href.startsWith('http') ? href : `https://fr.indeed.com${href}`;

    const contractFromAttr = attrEl?.textContent?.trim();
    const contractType = normalizeContractType(contractFromAttr) ?? extractContractFromText(title);

    const salaryText = salaryEl?.textContent?.trim() ?? '';
    const salary = extractSalaryFromText(salaryText);

    offers.push({
      source:             'indeed',
      url:                offerUrl.split('&vjk=')[0],
      title,
      company:            company ?? null,
      location:           location ?? null,
      contractType,
      descriptionSnippet: null,
      publishedAt:        null,
      salaryMin:          salary.min,
      salaryMax:          salary.max,
      salaryRaw:          salary.raw,
      extraction: {
        titleSource:        'html_primary',
        titleConfidence:    'high',
        locationSource:     location ? 'html' : 'none',
        locationConfidence: location ? 'medium' : 'none',
        contractSource:     contractType ? (contractFromAttr ? 'html' : 'regex') : 'none',
        contractConfidence: contractType ? (contractFromAttr ? 'medium' : 'low') : 'none',
      },
    });
  }

  return offers.filter(o => !isExcludedByProfile(`${o.title} ${o.company ?? ''}`, profile));
}
