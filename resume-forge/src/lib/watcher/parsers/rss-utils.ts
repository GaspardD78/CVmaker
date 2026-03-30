/**
 * Minimal RSS/Atom feed parser using DOMParser (native Web API, no npm dependency).
 * Handles RSS 2.0 and Atom 1.0 formats.
 */

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

export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let text: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ResumeForge/1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} pour ${url}`);
    }
    text = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }

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
