/**
 * Parser LinkedIn via WebView Tauri avec session utilisateur.
 *
 * Remplace `linkedin-rss.ts` qui dépendait d'un flux RSS tiers (rss.app).
 * L'utilisateur se logue une fois via le Session Manager ; les cookies
 * sont persistés par Chrome. Chaque collecte charge la page de recherche
 * complète et extrait les cartes d'offres.
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (`<h3>` titre de carte, toujours présent)
 *   Entreprise: HIGH (`<h4>` sous-titre de carte)
 *   Lieu     : MEDIUM (string libre sur la carte)
 *   Contrat  : LOW  (absent de la vue liste ; regex dans le titre)
 *   Salaire  : absent de la vue liste LinkedIn
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings } from '@/types/job-watch';
import { scrapeWithSession, sessionExists } from '../session-manager';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';

/**
 * LinkedIn job search URL — the "current" search page users interact with.
 * f_TPR=r86400 = "last 24 hours", keeps results fresh.
 */
function buildLinkedinUrl(settings: JobWatchSettings): string {
  const profile = settings.searchProfile;
  const keywords = [...profile.jobTitles].filter(Boolean).join(' OR ');
  const location = profile.location.city || 'France';
  const params = new URLSearchParams();
  if (keywords) params.set('keywords', keywords);
  params.set('location', location);
  params.set('f_TPR', 'r86400'); // last 24h
  params.set('sortBy', 'DD');    // newest first
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export async function parseLinkedin(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  if (!(await sessionExists('linkedin'))) {
    throw new Error('Session LinkedIn absente — connecte-toi depuis Paramètres › Veille › Sessions');
  }

  const url = buildLinkedinUrl(settings);
  const html = await scrapeWithSession('linkedin', url, {
    waitSelector: '.jobs-search__results-list, .scaffold-layout__list-container',
    timeoutSecs:  25,
  });

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = Array.from(
    doc.querySelectorAll('.jobs-search__results-list li, .scaffold-layout__list-container li[data-occludable-job-id]')
  );

  const profile = settings.searchProfile;
  const offers: RawJobOffer[] = [];

  for (const card of cards) {
    const titleEl   = card.querySelector('h3, .base-search-card__title, .job-card-list__title');
    const companyEl = card.querySelector('h4, .base-search-card__subtitle, .job-card-container__primary-description');
    const locEl     = card.querySelector('.job-search-card__location, .job-card-container__metadata-item');
    const linkEl    = card.querySelector<HTMLAnchorElement>('a.base-card__full-link, a.job-card-list__title, a[href*="/jobs/view/"]');

    const title   = titleEl?.textContent?.trim();
    const company = companyEl?.textContent?.trim();
    const location = normalizeLocation(locEl?.textContent?.trim());
    const href    = linkEl?.getAttribute('href');

    if (!title || !href) continue;
    const offerUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
    const contractType = extractContractFromText(title);

    offers.push({
      source:             'linkedin',
      url:                offerUrl.split('?')[0],
      title,
      company:            company ?? null,
      location:           location ?? null,
      contractType,
      descriptionSnippet: null,
      publishedAt:        null,
      salaryMin:          null,
      salaryMax:          null,
      salaryRaw:          null,
      extraction: {
        titleSource:        'html_primary',
        titleConfidence:    'high',
        locationSource:     location ? 'html' : 'none',
        locationConfidence: location ? 'medium' : 'none',
        contractSource:     contractType ? 'regex' : 'none',
        contractConfidence: contractType ? 'low' : 'none',
      },
    });
  }

  return offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
