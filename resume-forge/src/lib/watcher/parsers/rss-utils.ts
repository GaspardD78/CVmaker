/**
 * Minimal RSS/Atom feed parser using DOMParser (native Web API, no npm dependency).
 * Handles RSS 2.0 and Atom 1.0 formats.
 * HTTP requests are routed through tauri-plugin-http to bypass CORS.
 */
import { tauriFetch, BROWSER_USER_AGENT } from '../http';

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

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1_000;

const RSS_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
};

export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await tauriFetch(url, {
        signal: controller.signal,
        headers: RSS_HEADERS,
      });

      if (!res.ok) {
        // 4xx errors are deterministic — fail fast, no retry
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`HTTP ${res.status} pour ${url}`);
        }
        // 5xx errors are transient — retry with backoff
        lastError = new Error(`HTTP ${res.status} pour ${url}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, INITIAL_DELAY_MS * 2 ** attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} pour ${url} (après ${MAX_RETRIES} tentatives)`);
      }

      const text = await res.text();
      return parseXml(text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry 4xx or if last attempt
      if (attempt >= MAX_RETRIES - 1 || lastError.message.startsWith('HTTP 4')) {
        throw lastError;
      }
      await new Promise(r => setTimeout(r, INITIAL_DELAY_MS * 2 ** attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error(`Échec après ${MAX_RETRIES} tentatives pour ${url}`);
}

function parseXml(text: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Erreur parsing XML: ${parseError.textContent?.slice(0, 100)}`);
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
