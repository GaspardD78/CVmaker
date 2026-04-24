/**
 * Parser LinkedIn via WebView Tauri avec session utilisateur.
 *
 * Remplace `linkedin-rss.ts` qui dépendait d'un flux RSS tiers (rss.app).
 * L'utilisateur se logue une fois via le Session Manager ; les cookies
 * sont persistés par Chrome. Chaque collecte charge la page de recherche
 * complète et extrait les cartes d'offres.
 *
 * Qualité d'extraction :
 *   Titre    : HIGH  (attribut title ou textContent du lien de carte)
 *   Entreprise: HIGH (sous-titre de la carte)
 *   Lieu     : MEDIUM (texte libre de la carte)
 *   Contrat  : LOW  (absent de la vue liste ; regex dans le titre)
 *   Salaire  : absent de la vue liste LinkedIn
 *
 * Stratégie de robustesse face aux changements DOM LinkedIn :
 *   1. Sélecteur d'attente large (plusieurs variantes connues)
 *   2. Le Rust tente le sélecteur mais extrait l'HTML même en cas d'échec
 *   3. Le parser essaie 3 stratégies d'extraction dans l'ordre
 *   4. Détection explicite de la page de login/challenge
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings } from '@/types/job-watch';
import { scrapeWithSession, sessionExists } from '../session-manager';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';

/**
 * LinkedIn job search URL.
 * f_TPR=r86400 = "last 24 hours", keeps results fresh.
 * geoId=105015875 = France (fallback si la ville n'est pas reconnue par LinkedIn).
 */
function buildLinkedinUrl(settings: JobWatchSettings): string {
  const profile = settings.searchProfile;
  const keywords = [...profile.jobTitles].filter(Boolean).join(' OR ');
  const location = profile.location.city || 'France';
  const params = new URLSearchParams();
  if (keywords) params.set('keywords', keywords);
  params.set('location', location);
  params.set('f_TPR', 'r86400');
  params.set('sortBy', 'DD');
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * CSS selectors for LinkedIn job results — kept in order of reliability.
 * LinkedIn changes class names frequently; data attributes are more stable.
 *
 * The combined selector string is passed to headless_chrome's best-effort
 * wait, then queried directly in the returned HTML.
 */
const WAIT_SELECTOR = [
  // Data attributes (most stable across redesigns)
  '[data-job-id]',
  '[data-occludable-job-id]',
  // Modern scaffold layout (2024–2026)
  '.scaffold-layout__list-container',
  '.jobs-search-results__list',
  // Legacy class names
  '.jobs-search__results-list',
].join(', ');

/** Selectors for individual job cards — tried in order, first match wins. */
const CARD_SELECTORS = [
  'li[data-occludable-job-id]',
  'li[data-job-id]',
  '.jobs-search-results__list-item',
  '.jobs-search__results-list li',
  '.scaffold-layout__list-container li',
  '.job-card-container',
];

/** Returns true if the page is a login / challenge wall (session expired). */
function isLoginPage(doc: Document): boolean {
  return Boolean(
    doc.querySelector('form[action*="login"], form[action*="uas/login"]') ||
    doc.querySelector('#username, #password') ||
    doc.querySelector('[class*="sign-in"], [class*="signin"]') ||
    (doc.title && /sign in|log in|connexion|challenge/i.test(doc.title))
  );
}

function parseCard(card: Element): { title: string; company: string | null; location: string | null; href: string | null } {
  // Title — try data attribute first, then various class patterns
  const linkEl = card.querySelector<HTMLAnchorElement>(
    'a[href*="/jobs/view/"],' +
    'a.job-card-list__title--link,' +
    'a[class*="job-card-list__title"],' +
    'a.base-card__full-link'
  );
  const title =
    linkEl?.getAttribute('aria-label')?.trim() ||
    card.querySelector('h3, h2, .job-card-list__title, .base-search-card__title')?.textContent?.trim() ||
    linkEl?.textContent?.trim();

  // Company
  const company =
    card.querySelector('.job-card-container__primary-description, .base-search-card__subtitle, h4')?.textContent?.trim() ||
    null;

  // Location
  const location =
    card.querySelector('.job-card-container__metadata-item, .job-search-card__location, [class*="location"]')?.textContent?.trim() ||
    null;

  return { title: title ?? '', company, location, href: linkEl?.getAttribute('href') ?? null };
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
    // Best-effort wait — Rust returns HTML even if the selector is never found
    waitSelector: WAIT_SELECTOR,
    timeoutSecs:  30,
  });

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Detect login redirect before attempting to parse job cards
  if (isLoginPage(doc)) {
    throw new Error(
      'Session LinkedIn expirée — reconnecte-toi depuis Paramètres › Veille › Connexions aux sites'
    );
  }

  // Try card selectors in priority order
  let cards: Element[] = [];
  for (const sel of CARD_SELECTORS) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 0) {
      cards = found;
      break;
    }
  }

  if (cards.length === 0) {
    // Last resort: any element with a job-view link
    cards = Array.from(doc.querySelectorAll('[href*="/jobs/view/"]'))
      .map(el => el.closest('li, article, div[class*="card"]') ?? el)
      .filter((el, i, arr) => arr.indexOf(el) === i); // deduplicate
  }

  const profile = settings.searchProfile;
  const offers: RawJobOffer[] = [];

  for (const card of cards) {
    const { title, company, location: rawLoc, href } = parseCard(card);
    if (!title || !href) continue;

    const offerUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
    const location = normalizeLocation(rawLoc ?? undefined);
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
