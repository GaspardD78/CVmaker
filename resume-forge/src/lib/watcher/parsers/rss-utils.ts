/**
 * Minimal RSS/Atom feed parser using DOMParser (native Web API, no npm dependency).
 * Handles RSS 2.0 and Atom 1.0 formats.
 * HTTP requests go through `fetchResilient` for retry + circuit breaker + timeout.
 */
import { BROWSER_USER_AGENT } from '../http';
import { fetchResilient } from '../http-client';
import type { JobSource } from '@/types/job-watch';
import { assertExpectedBody, SourceError } from '../source-status';

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  author: string | null;
}

function getText(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

function getAttr(el: Element, tag: string, attr: string): string {
  return el.getElementsByTagName(tag)[0]?.getAttribute(attr) ?? '';
}

const RSS_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
};

/**
 * Fetch and parse an RSS/Atom feed. The `source` parameter keys the circuit
 * breaker — pass the caller's JobSource so a single broken feed doesn't
 * affect other feeds under the same source.
 */
export async function fetchRssFeed(url: string, source: JobSource | string = 'rss'): Promise<RssItem[]> {
  const res = await fetchResilient(url, {
    source,
    headers: RSS_HEADERS,
    // Explicitly do NOT retry on 4xx — those are deterministic (bad URL, gone)
    retry: {
      shouldRetry: (r, err) => {
        if (err) return true;
        if (!r) return true;
        if (r.status === 429) return true;
        if (r.status >= 500 && r.status < 600) return true;
        return false;
      },
    },
  });

  if (!res.ok) {
    // Statut typé : 403/429 = refus du site, 404/410 = adresse disparue.
    const kind = res.status === 403 || res.status === 429
      ? 'bloquee'
      : res.status === 404 || res.status === 410 ? 'introuvable' : 'erreur_reseau';
    throw new SourceError(kind, `HTTP ${res.status} pour ${url}`, { httpStatus: res.status, url });
  }

  const text = await res.text();
  // Un pare-feu applicatif répond souvent 200 avec une page HTML « Request
  // Rejected » : ce n'est ni un flux vide ni un flux invalide anodin.
  assertExpectedBody(text, 'xml', { url, httpStatus: res.status });
  return parseXml(text);
}

function parseXml(text: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new SourceError('reponse_invalide', `Erreur parsing XML: ${parseError.textContent?.slice(0, 100)}`);
  }

  // Detect format: RSS 2.0 or Atom
  const isAtom = doc.documentElement.tagName === 'feed';

  if (isAtom) {
    return parseAtom(doc);
  }
  return parseRss2(doc);
}

function parseRss2(doc: Document): RssItem[] {
  const items = Array.from(doc.getElementsByTagName('item'));
  return items.map(item => ({
    title:       getText(item, 'title')       || '(sans titre)',
    link:        getText(item, 'link')        || getAttr(item, 'guid', 'isPermaLink') || getText(item, 'guid'),
    description: getText(item, 'description') || '',
    pubDate:     getText(item, 'pubDate')     || null,
    author:      getText(item, 'author')      || getText(item, 'dc:creator') || null,
  })).filter(i => i.link);
}

function parseAtom(doc: Document): RssItem[] {
  const entries = Array.from(doc.getElementsByTagName('entry'));
  return entries.map(entry => {
    const linkEl = entry.querySelector('link[rel="alternate"]') ?? entry.querySelector('link');
    return {
      title:       getText(entry, 'title')   || '(sans titre)',
      link:        linkEl?.getAttribute('href') ?? '',
      description: getText(entry, 'summary') || getText(entry, 'content') || '',
      pubDate:     getText(entry, 'published') || getText(entry, 'updated') || null,
      author:      getText(entry, 'name')    || null,
    };
  }).filter(i => i.link);
}

/** Strip HTML tags and truncate to maxLength characters */
export function stripHtml(html: string, maxLength = 500): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent ?? div.innerText ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Parse a loose date string to ISO, returns null if unparseable */
export function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
