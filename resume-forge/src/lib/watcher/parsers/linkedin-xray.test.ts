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

import { extractJobId, buildKeywords } from './linkedin-xray';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';

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
