/**
 * Unit tests for the pure helpers of the LinkedIn guest-API parser.
 *
 * The DOM-based card parsing (parseLinkedinJobCards) relies on DOMParser, which
 * isn't available under bun:test — so we cover the regex-sensitive logic that
 * decides job identity and query building, which is where bugs hide.
 */

import { describe, expect, test, mock } from 'bun:test';

// Parser pulls in http-client → http.ts → @tauri-apps/plugin-http. Stub the leaf
// so importing the module never touches native bits.
mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async () => new Response('', { status: 200 }),
}));

import { extractJobId, buildKeywords, mergeEnrichedWithCard } from './linkedin-xray';
import { DEFAULT_SEARCH_PROFILE, DEFAULT_EXTRACTION } from '@/types/job-watch';
import type { RawJobOffer } from '@/types/job-watch';

describe('extractJobId', () => {
  test('bare numeric job-view URL', () => {
    expect(extractJobId('https://www.linkedin.com/jobs/view/3900000000')).toBe('3900000000');
    expect(extractJobId('https://www.linkedin.com/jobs/view/3900000000/')).toBe('3900000000');
  });

  test('slug-id job-view URL with query string', () => {
    expect(
      extractJobId('https://fr.linkedin.com/jobs/view/software-engineer-at-acme-3900000000?refId=abc&trk=x'),
    ).toBe('3900000000');
  });

  test('slug containing digits keeps the trailing id', () => {
    expect(
      extractJobId('https://www.linkedin.com/jobs/view/data-engineer-2024-at-acme-3900000000?x=1'),
    ).toBe('3900000000');
  });

  test('entity URN (plain and decorated)', () => {
    expect(extractJobId('urn:li:jobPosting:3900000000')).toBe('3900000000');
    expect(extractJobId('urn:li:fsd_jobPosting:3900000000')).toBe('3900000000');
  });

  test('non-matching inputs return null', () => {
    expect(extractJobId(null)).toBeNull();
    expect(extractJobId(undefined)).toBeNull();
    expect(extractJobId('')).toBeNull();
    expect(extractJobId('https://www.linkedin.com/jobs/view/')).toBeNull();
    expect(extractJobId('https://www.linkedin.com/company/acme')).toBeNull();
  });
});

describe('buildKeywords', () => {
  const profile = (jobTitles: string[]) => ({ ...DEFAULT_SEARCH_PROFILE, jobTitles });

  test('empty titles → empty string', () => {
    expect(buildKeywords(profile([]))).toBe('');
    expect(buildKeywords(profile(['  ', '']))).toBe('');
  });

  test('single title is passed through unquoted', () => {
    expect(buildKeywords(profile(['Développeur React']))).toBe('Développeur React');
  });

  test('multiple titles are OR-joined and quoted', () => {
    expect(buildKeywords(profile(['Recruteur', 'RRH']))).toBe('"Recruteur" OR "RRH"');
  });

  test('blank entries are trimmed and dropped', () => {
    expect(buildKeywords(profile([' Dev ', '', 'Lead']))).toBe('"Dev" OR "Lead"');
  });
});

describe('mergeEnrichedWithCard', () => {
  const base = (over: Partial<RawJobOffer>): RawJobOffer => ({
    source: 'linkedin',
    url: 'https://www.linkedin.com/jobs/view/123',
    title: 'Talent Acquisition Specialist',
    company: null,
    location: null,
    contractType: null,
    descriptionSnippet: null,
    publishedAt: null,
    salaryMin: null,
    salaryMax: null,
    salaryRaw: null,
    extraction: { ...DEFAULT_EXTRACTION },
    ...over,
  });

  test('keeps enriched fields when present', () => {
    const enriched = base({
      location: 'Paris, Île-de-France',
      company: 'Acme',
      extraction: { ...DEFAULT_EXTRACTION, locationSource: 'json_ld', locationConfidence: 'high' },
    });
    const card = base({ location: 'Boulogne-Billancourt', company: 'Other' });
    const merged = mergeEnrichedWithCard(enriched, card);
    expect(merged.location).toBe('Paris, Île-de-France');
    expect(merged.company).toBe('Acme');
    expect(merged.extraction.locationSource).toBe('json_ld');
  });

  test('falls back to card location/company when JSON-LD omits them', () => {
    const enriched = base({ descriptionSnippet: 'Great job', publishedAt: null });
    const card = base({
      location: 'Boulogne-Billancourt',
      company: 'ITS Services',
      publishedAt: '2026-07-07T00:00:00.000Z',
      extraction: { ...DEFAULT_EXTRACTION, locationSource: 'html', locationConfidence: 'medium' },
    });
    const merged = mergeEnrichedWithCard(enriched, card);
    expect(merged.location).toBe('Boulogne-Billancourt');
    expect(merged.company).toBe('ITS Services');
    expect(merged.publishedAt).toBe('2026-07-07T00:00:00.000Z');
    expect(merged.descriptionSnippet).toBe('Great job');
    expect(merged.extraction.locationSource).toBe('html');
    expect(merged.extraction.locationConfidence).toBe('medium');
  });

  test('null card returns enriched unchanged', () => {
    const enriched = base({ location: 'Paris' });
    expect(mergeEnrichedWithCard(enriched, null)).toEqual(enriched);
  });
});
