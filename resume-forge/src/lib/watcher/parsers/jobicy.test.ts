/**
 * Integration test for parseJobicy — we stub the resilient HTTP client and
 * feed it a canned API response to verify parsing, salary normalisation,
 * and contract-type mapping.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// Canned response the fake HTTP client will return
let cannedResponse: Response = new Response('{}', { status: 200 });

// Mock at the leaf — http-client.ts imports @tauri-apps/plugin-http for its
// actual network call. By stubbing this we don't need any of the native bits.
mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async () => cannedResponse,
}));

// stripHtml pulls document from the DOM which doesn't exist in bun:test.
// Provide a minimal substitute.
mock.module('./rss-utils', () => ({
  stripHtml: (html: string, max = 500) => html.replace(/<[^>]+>/g, '').slice(0, max),
}));

import { parseJobicy } from './jobicy';
import { DEFAULT_JOB_WATCH_SETTINGS, DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import type { JobWatchConfig } from '@/types/job-watch';

const config: JobWatchConfig = {
  id: 'c1',
  alertId: null,
  source: 'jobicy',
  rssUrl: null,
  enabled: 1,
  lastFetchedAt: null,
  createdAt: new Date().toISOString(),
};

const settings = { ...DEFAULT_JOB_WATCH_SETTINGS };
const profile = { ...DEFAULT_SEARCH_PROFILE, jobTitles: ['Developer'] };

beforeEach(() => {
  cannedResponse = new Response('{}', { status: 200 });
});

describe('parseJobicy', () => {
  test('empty jobs list returns []', async () => {
    cannedResponse = new Response(JSON.stringify({ jobCount: 0, jobs: [] }), { status: 200 });
    const offers = await parseJobicy(config, settings, profile);
    expect(offers).toEqual([]);
  });

  test('parses a single job with full-time mapping and monthly salary normalisation', async () => {
    cannedResponse = new Response(
      JSON.stringify({
        jobCount: 1,
        jobs: [{
          id: 42,
          url: 'https://jobicy.com/jobs/42',
          jobTitle: 'Senior React Developer',
          companyName: 'Remote Corp',
          jobIndustry: ['Tech'],
          jobType: ['full-time'],
          jobGeo: 'EMEA',
          jobLevel: 'Senior',
          jobExcerpt: '<p>Great job</p>',
          jobDescription: '<p>Long description</p>',
          pubDate: '2026-04-01T00:00:00Z',
          salaryMin: 5000,
          salaryMax: 7000,
          salaryCurrency: 'EUR',
          salaryPeriod: 'monthly',
        }],
      }),
      { status: 200 },
    );

    const offers = await parseJobicy(config, settings, profile);
    expect(offers).toHaveLength(1);
    const o = offers[0];

    expect(o.source).toBe('jobicy');
    expect(o.title).toBe('Senior React Developer');
    expect(o.company).toBe('Remote Corp');
    expect(o.location).toBe('EMEA');
    expect(o.contractType).toBe('CDI'); // full-time → CDI

    // Monthly salaries must be annualised
    expect(o.salaryMin).toBe(60_000);
    expect(o.salaryMax).toBe(84_000);
    expect(o.salaryRaw).toContain('EUR');

    expect(o.extraction.titleConfidence).toBe('high');
    expect(o.extraction.contractConfidence).toBe('medium');
  });

  test('throws on non-ok HTTP status', async () => {
    cannedResponse = new Response('Server Error', { status: 500 });
    let thrown: unknown = null;
    try {
      await parseJobicy(config, settings, profile);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('500');
  });

  test('yearly salary is kept as-is', async () => {
    cannedResponse = new Response(
      JSON.stringify({
        jobCount: 1,
        jobs: [{
          id: 1,
          url: 'https://jobicy.com/jobs/1',
          jobTitle: 'X',
          companyName: 'Y',
          jobIndustry: [],
          jobType: ['contract'],
          jobGeo: '',
          jobLevel: '',
          jobExcerpt: '',
          jobDescription: '',
          pubDate: '2026-04-01T00:00:00Z',
          salaryMin: 75_000,
          salaryMax: 90_000,
          salaryCurrency: 'EUR',
          salaryPeriod: 'yearly',
        }],
      }),
      { status: 200 },
    );

    const [o] = await parseJobicy(config, settings, profile);
    expect(o.salaryMin).toBe(75_000);
    expect(o.salaryMax).toBe(90_000);
    expect(o.contractType).toBe('Freelance');
  });
});
