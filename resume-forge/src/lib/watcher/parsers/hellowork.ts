/**
 * Parser HelloWork — scraping HTML
 *
 * HelloWork bloque activement le scraping (CGU 8.2). Leur page de résultats
 * est rendue côté serveur (Hotwire/Turbo) MAIS le contenu des offres est
 * injecté via JavaScript après chargement, rendant le scraping HTML
 * inutilisable sans navigateur headless.
 *
 * Ce parser tente quand même de récupérer les cartes ([data-cy="serpCard"])
 * lorsqu'elles sont présentes. Si la page revient sans offres (anti-bot ou
 * rendu JS), une erreur descriptive est levée pour informer l'utilisateur.
 *
 * URL de recherche :
 *   https://www.hellowork.com/fr-fr/emploi/recherche.html?k=MOTS&l=LIEU&ray=KM
 */

import { RawJobOffer } from '@/types/job-watch';
import type { JobWatchConfig } from '@/types/job-watch';
import { tauriFetch, BROWSER_USER_AGENT } from '../http';

const HELLOWORK_SEARCH_URL = 'https://www.hellowork.com/fr-fr/emploi/recherche.html';
const HELLOWORK_BASE = 'https://www.hellowork.com';
const TIMEOUT_MS = 15_000;

export function buildHelloworkUrl(config: Pick<JobWatchConfig, 'keywords' | 'location' | 'radiusKm'>): string {
  const params = new URLSearchParams();
  if (config.keywords.length > 0) params.set('k', config.keywords.join(' '));
  if (config.location)            params.set('l', config.location);
  if (config.radiusKm)            params.set('ray', String(config.radiusKm));
  return `${HELLOWORK_SEARCH_URL}?${params.toString()}`;
}

/** Decode HTML entities (&#xE9; → é, &amp; → &, etc.) */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g,            (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Normalize contract type labels from HelloWork to standard */
function normalizeContract(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (lower === 'cdi') return 'CDI';
  if (lower === 'cdd') return 'CDD';
  if (lower.includes('intérim') || lower.includes('interim')) return 'Intérim';
  if (lower.includes('stage')) return 'Stage';
  if (lower.includes('alternance')) return 'Alternance';
  if (lower.includes('indépendant') || lower.includes('freelance')) return 'Freelance';
  return raw.trim() || null;
}

export async function parseHellowork(config: JobWatchConfig): Promise<RawJobOffer[]> {
  const pageUrl = config.rssUrl ?? buildHelloworkUrl(config);
  console.debug('[hellowork] URL:', pageUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html: string;
  try {
    const res = await tauriFetch(pageUrl, {
      signal: controller.signal,
      headers: {
        // NB : Ne pas définir Accept-Encoding explicitement — tauri-plugin-http
        // (reqwest) gère la décompression automatiquement. Un header explicite
        // désactive la décompression automatique et retourne les octets gzip bruts.
        'User-Agent':                BROWSER_USER_AGENT,
        'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language':           'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control':             'max-age=0',
        'Sec-Fetch-Dest':            'document',
        'Sec-Fetch-Mode':            'navigate',
        'Sec-Fetch-Site':            'none',   // première visite directe (pas de referer)
        'Sec-Fetch-User':            '?1',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua':                 '"Google Chrome";v="131", "Chromium";v="131", "Not-A.Brand";v="24"',
        'sec-ch-ua-mobile':          '?0',
        'sec-ch-ua-platform':        '"Windows"',
      },
    });
    if (!res.ok) throw new Error(`HelloWork HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }

  const offers: RawJobOffer[] = [];

  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');

  // Sélecteurs connus pour les cartes d'offres HelloWork
  const cards = doc.querySelectorAll('[data-cy="serpCard"], li > div[class*="tw-flex-col"]');

  for (const card of cards) {
    const linkEl = card.querySelector('a[href^="/fr-fr/emplois/"]') as HTMLAnchorElement;
    if (!linkEl) continue;

    const rawUrl = linkEl.getAttribute('href');
    if (!rawUrl) continue;

    const url = `${HELLOWORK_BASE}${rawUrl}`;

    let rawTitle = linkEl.getAttribute('title') || linkEl.textContent?.trim() || '';
    rawTitle = decodeEntities(rawTitle);

    let title   = rawTitle;
    let company: string | null = null;

    const lastDash = rawTitle.lastIndexOf(' - ');
    if (lastDash !== -1) {
      title   = rawTitle.slice(0, lastDash).trim();
      company = rawTitle.slice(lastDash + 3).trim();
    } else {
      const companyEl = card.querySelector('[data-cy="offerCompany"], h3 p:last-child');
      if (companyEl) company = companyEl.textContent?.trim() || null;
    }

    const locEl      = card.querySelector('[data-cy="localisationCard"], [data-cy="location"]');
    const location   = locEl ? locEl.textContent?.trim() || null : null;

    const contractEl  = card.querySelector('[data-cy="contractCard"], [data-cy="contractType"]');
    const contractType = contractEl ? normalizeContract(contractEl.textContent?.trim() || '') : null;

    offers.push({
      source:             'hellowork',
      url,
      title,
      company,
      location,
      contractType,
      descriptionSnippet: null,
      publishedAt:        null,
    });
  }

  if (offers.length === 0) {
    // Détecter le type de blocage pour fournir un message précis.
    const isScrapingBlocked = html.includes('screen scraping') || html.includes('web scraping');
    const isJsRendered      = html.includes('tw-scroll-smooth') && !html.includes('serpCard');

    if (isScrapingBlocked || isJsRendered) {
      throw new Error(
        'HelloWork bloque le scraping HTML (CGU 8.2) ou charge les offres via JavaScript. ' +
        'Désactivez cette source dans la configuration de la Veille.'
      );
    }
    console.warn('[hellowork] 0 offres — sélecteurs peut-être obsolètes. Snippet HTML :', html.slice(0, 800));
  }

  // Filtrage local par mots-clés exclus
  if (config.excludeKeywords.length > 0) {
    const excludeLower = config.excludeKeywords.map(k => k.toLowerCase());
    return offers.filter(o => {
      const text = `${o.title} ${o.company ?? ''}`.toLowerCase();
      return !excludeLower.some(ex => text.includes(ex));
    });
  }

  return offers;
}
