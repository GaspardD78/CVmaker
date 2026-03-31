/**
 * Parser HelloWork (ex-RegionsJob) — scraping HTML
 *
 * HelloWork rend les résultats côté serveur (Turbo/Stimulus), pas de SPA.
 * On parse les cartes d'offres identifiées par data-cy="serpCard".
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
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HelloWork HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }

  // Split on data-cy="serpCard" to isolate each job card
  const cardChunks = html.split('data-cy="serpCard"');
  // First chunk is before any card, skip it
  const offers: RawJobOffer[] = [];

  for (let i = 1; i < cardChunks.length; i++) {
    const card = cardChunks[i];

    // Job link & title: href="/fr-fr/emplois/12345.html" ... title="Poste H/F - Entreprise"
    const linkMatch = card.match(/href="(\/fr-fr\/emplois\/\d+\.html)"[^>]*title="([^"]+)"/);
    if (!linkMatch) continue;

    const url = `${HELLOWORK_BASE}${linkMatch[1]}`;
    const rawTitle = decodeEntities(linkMatch[2]);

    // Title format: "Poste H/F - Entreprise"
    const lastDash = rawTitle.lastIndexOf(' - ');
    const title = lastDash !== -1 ? rawTitle.slice(0, lastDash).trim() : rawTitle;
    const company = lastDash !== -1 ? rawTitle.slice(lastDash + 3).trim() : null;

    // Location: data-cy="localisationCard">Paris - 75</...>
    const locMatch = card.match(/data-cy="localisationCard"[^>]*>([^<]+)/);
    const location = locMatch ? decodeEntities(locMatch[1].trim()) : null;

    // Contract type: data-cy="contractCard">CDI</...>
    const contractMatch = card.match(/data-cy="contractCard"[^>]*>([^<]+)/);
    const contractType = contractMatch ? normalizeContract(decodeEntities(contractMatch[1])) : null;

    offers.push({
      source:             'hellowork',
      url,
      title,
      company,
      location,
      contractType,
      descriptionSnippet: null, // Not available on search page
      publishedAt:        null, // Relative dates only ("il y a 3 jours")
    });
  }

  // Filter out offers matching exclude keywords (local filtering)
  if (config.excludeKeywords.length > 0) {
    const excludeLower = config.excludeKeywords.map(k => k.toLowerCase());
    return offers.filter(o => {
      const text = `${o.title} ${o.company ?? ''}`.toLowerCase();
      return !excludeLower.some(ex => text.includes(ex));
    });
  }

  return offers;
}
