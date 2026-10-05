/**
 * Parser HelloWork via WebView Tauri.
 *
 * HelloWork (ex-RegionsJob) n'exige pas de login mais rend toute la liste
 * en JavaScript côté client. Le HTTP brut renvoie une page quasi-vide
 * avec un loader — WebView résout ça proprement.
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (`h3` dans chaque carte)
 *   Entreprise: HIGH
 *   Lieu     : MEDIUM
 *   Contrat  : MEDIUM (badge contrat visible sur chaque carte)
 *   Salaire  : MEDIUM quand affiché
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import { scrapeWithSession } from '../session-manager';
import { isExcludedByProfile } from '../profile-to-query';
import { assertNotChallengePage } from '../source-status';
import { normalizeLocation } from './common/location';
import { normalizeContractType, extractContractFromText } from './common/contract-type';
import { extractSalaryFromText } from './common/salary';

function buildHelloworkUrl(profile: SearchProfile): string {
  const k = profile.jobTitles.slice(0, 2).map(t => `"${t.trim()}"`).join(' ') || '';
  const l = profile.location.city || 'France';
  const params = new URLSearchParams({ k, l, d: 'r86400', st: 'date' });
  return `https://www.hellowork.com/fr-fr/emploi/recherche.html?${params.toString()}`;
}

export async function parseHellowork(
  _config: JobWatchConfig,
  _settings: JobWatchSettings,
  profile: SearchProfile,
  profileId?: string | null,
): Promise<RawJobOffer[]> {
  const url = buildHelloworkUrl(profile);
  const html = await scrapeWithSession('hellowork', url, {
    waitSelector: '[data-cy="serpCard"], ul[data-cy="serpList"] li, .tw-relative article',
    timeoutSecs:  25,
  }, profileId);

  // Contrôle anti-robot : on s'arrête et on le dit, sans tenter de le franchir.
  assertNotChallengePage(html, { url });

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = Array.from(
    doc.querySelectorAll('[data-cy="serpCard"], ul[data-cy="serpList"] > li')
  );

  const offers: RawJobOffer[] = [];

  for (const card of cards) {
    const titleEl   = card.querySelector('h3, [data-cy="serpCardTitle"]');
    const companyEl = card.querySelector('[data-cy="serpCardCompany"], .tw-text-grey-800');
    const locEl     = card.querySelector('[data-cy="localisationCard"], [class*="localisation"]');
    const contractEl = card.querySelector('[data-cy="contractCard"], [class*="contract"]');
    const salaryEl  = card.querySelector('[data-cy="salaryCard"], [class*="salary"]');
    const linkEl    = card.querySelector<HTMLAnchorElement>('a[href*="/emplois/"]');

    const title   = titleEl?.textContent?.trim();
    const company = companyEl?.textContent?.trim();
    const location = normalizeLocation(locEl?.textContent?.trim());
    const href    = linkEl?.getAttribute('href');

    if (!title || !href) continue;
    const offerUrl = href.startsWith('http') ? href : `https://www.hellowork.com${href}`;

    const contractRaw = contractEl?.textContent?.trim();
    const contractType = normalizeContractType(contractRaw) ?? extractContractFromText(title);

    const salary = extractSalaryFromText(salaryEl?.textContent?.trim() ?? '');

    offers.push({
      source:             'hellowork',
      url:                offerUrl,
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
        contractSource:     contractType ? (contractRaw ? 'html' : 'regex') : 'none',
        contractConfidence: contractType ? (contractRaw ? 'medium' : 'low') : 'none',
      },
    });
  }

  return offers.filter(o => !isExcludedByProfile(`${o.title} ${o.company ?? ''}`, profile));
}
