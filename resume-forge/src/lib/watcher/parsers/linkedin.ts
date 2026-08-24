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

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import { scrapeWithSession, sessionExists } from '../session-manager';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';
import { setCapturedDebugHtml, type SelectorOverride } from '../selector-debug';

/**
 * LinkedIn job search URL.
 * f_TPR=r86400 = "last 24 hours", keeps results fresh.
 * geoId=105015875 = France (fallback si la ville n'est pas reconnue par LinkedIn).
 */
function buildLinkedinUrl(profile: SearchProfile): string {
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
  // Logged-in selectors
  '[data-job-id]',
  '[data-occludable-job-id]',
  '.scaffold-layout__list-container',
  // Guest mode selectors
  '.jobs-search__results-list',
  '.base-card',
  '.base-search-card',
  '.job-search-card',
].join(', ');

/** Selectors for individual job cards — tried in order, first match wins. */
const CARD_SELECTORS = [
  'li[data-occludable-job-id]',
  'li[data-job-id]',
  '.jobs-search-results__list-item',
  '.jobs-search__results-list li',
  '.scaffold-layout__list-container li',
  '.job-card-container',
  '.base-card',
  '.base-search-card',
  '.job-search-card',
];

/** Returns true if the page is a login / challenge wall (session expired). */
function isLoginPage(doc: Document): boolean {
  const hasJobs = !!doc.querySelector('[data-job-id], [data-occludable-job-id], .scaffold-layout__list-container, .base-card, .job-search-card');
  const hasMeMenu = !!doc.querySelector('.global-nav__me, #global-nav-typeahead, .search-global-typeahead');

  // Log state for debugging (visible in console)
  console.debug(`[linkedin] Page state: jobs=${hasJobs}, meMenu=${hasMeMenu}, title="${doc.title}"`);

  // If we found actual job cards OR have a "Me" menu OR the title mentions results, it's NOT a login page
  if (hasMeMenu || hasJobs || (doc.title && /\d+ (offres|jobs)/i.test(doc.title))) {
    return false;
  }

  const loginForm = doc.querySelector('form[action*="uas/login"], form#login-form');
  const authInputs = doc.querySelector('input#username, input#password');
  const isAuthWall = doc.querySelector('.authwall, [class*="authwall-join-form"]');
  const isChallenge = doc.querySelector('.challenge-container, #challenge-error, [id*="challenge"]');

  // More specific title check to avoid matching search results like "Challenge recruitment"
  const titleMatch = doc.title && /sign in|log in|connexion|s'identifier|identifiez-vous/i.test(doc.title);

  return Boolean(loginForm || authInputs || isAuthWall || isChallenge || titleMatch);
}

interface CardSelectors {
  titleSelector: string;
  companySelector: string;
  locationSelector: string;
  linkSelector: string;
}

const DEFAULT_CARD_SELECTORS: CardSelectors = {
  titleSelector:
    'a[href*="/jobs/view/"], a.job-card-list__title--link, a[class*="job-card-list__title"], a.base-card__full-link, .base-search-card__title',
  companySelector:
    '.job-card-container__primary-description, .base-search-card__subtitle, h4, .base-search-card__subtitle a',
  locationSelector:
    '.job-card-container__metadata-item, .job-search-card__location, [class*="location"], .base-search-card__metadata',
  linkSelector:
    'a[href*="/jobs/view/"], a.job-card-list__title--link, a.base-card__full-link',
};

function parseCard(
  card: Element,
  sel: CardSelectors = DEFAULT_CARD_SELECTORS,
): { title: string; company: string | null; location: string | null; href: string | null } {
  const linkEl = card.querySelector<HTMLAnchorElement>(sel.linkSelector);
  const title =
    linkEl?.getAttribute('aria-label')?.trim() ||
    card.querySelector(sel.titleSelector)?.textContent?.trim() ||
    linkEl?.textContent?.trim();

  const company = card.querySelector(sel.companySelector)?.textContent?.trim() || null;
  const location = card.querySelector(sel.locationSelector)?.textContent?.trim() || null;

  return { title: title ?? '', company, location, href: linkEl?.getAttribute('href') ?? null };
}

export async function parseLinkedin(
  _config: JobWatchConfig,
  _settings: JobWatchSettings,
  profile: SearchProfile,
  override?: SelectorOverride,
  profileId?: string | null,
): Promise<RawJobOffer[]> {
  if (!(await sessionExists('linkedin', profileId))) {
    throw new Error('Session LinkedIn absente — connecte-toi depuis Paramètres › Veille › Sessions');
  }

  const url = buildLinkedinUrl(profile);

  // Use override wait selector if available
  const waitSel = override?.waitSelector ?? WAIT_SELECTOR;
  const html = await scrapeWithSession('linkedin', url, {
    waitSelector: waitSel,
    timeoutSecs:  30,
  }, profileId);

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Detect login redirect before attempting to parse job cards
  if (isLoginPage(doc)) {
    // Capture HTML for debugging before throwing, so the user can see what LinkedIn is showing
    setCapturedDebugHtml('linkedin', html, url);

    throw new Error(
      'Session LinkedIn expirée — reconnecte-toi depuis Paramètres › Veille › Connexions aux sites'
    );
  }

  // Build effective card selectors: override has priority, then built-in cascade
  const cardSelectors = override?.cardSelector
    ? [override.cardSelector, ...CARD_SELECTORS]
    : CARD_SELECTORS;

  let cards: Element[] = [];
  for (const sel of cardSelectors) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 0) { cards = found; break; }
  }
  if (cards.length === 0) {
    // Last resort: any element with a job-view link
    cards = Array.from(doc.querySelectorAll('[href*="/jobs/view/"]'))
      .map(el => el.closest('li, article, div[class*="card"]') ?? el)
      .filter((el, i, arr) => arr.indexOf(el) === i);
  }

  // Build per-field selectors merging override values over defaults
  const fieldSelectors: CardSelectors = {
    titleSelector:    override?.titleSelector    ?? DEFAULT_CARD_SELECTORS.titleSelector,
    companySelector:  override?.companySelector  ?? DEFAULT_CARD_SELECTORS.companySelector,
    locationSelector: override?.locationSelector ?? DEFAULT_CARD_SELECTORS.locationSelector,
    linkSelector:     override?.linkSelector     ?? DEFAULT_CARD_SELECTORS.linkSelector,
  };

  const offers: RawJobOffer[] = [];

  for (const card of cards) {
    const { title, company, location: rawLoc, href } = parseCard(card, fieldSelectors);
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

  const filtered = offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });

  // Capture HTML for AI-assisted selector debugging when no cards were found
  if (filtered.length === 0) {
    setCapturedDebugHtml('linkedin', html, url);
  }

  return filtered;
}
