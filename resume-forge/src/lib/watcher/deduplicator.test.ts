/**
 * Tests for deduplicator — focus on the cross-source dedup optimization
 * and hash computation correctness.
 */

import { describe, expect, test } from 'bun:test';
import { computeOfferHash, detectCrossSourceDuplicates } from './deduplicator';

describe('computeOfferHash', () => {
  test('produces deterministic SHA-256 hex', async () => {
    const h1 = await computeOfferHash('wttj', 'https://a/b');
    const h2 = await computeOfferHash('wttj', 'https://a/b');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different url → different hash', async () => {
    const a = await computeOfferHash('wttj', 'https://a/b');
    const b = await computeOfferHash('wttj', 'https://a/c');
    expect(a).not.toBe(b);
  });

  test('different source but same url → different hash', async () => {
    const a = await computeOfferHash('wttj', 'https://a/b');
    const b = await computeOfferHash('apec', 'https://a/b');
    expect(a).not.toBe(b);
  });
});

describe('detectCrossSourceDuplicates', () => {
  test('empty input returns empty set', () => {
    const skip = detectCrossSourceDuplicates([]);
    expect(skip.size).toBe(0);
  });

  test('same source offers are never paired (handled by hash dedup)', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Dev React', company: 'Acme', source: 'wttj', score: 80 },
      { title: 'Dev React', company: 'Acme', source: 'wttj', score: 70 },
    ]);
    expect(skip.size).toBe(0);
  });

  test('offers without company cannot be deduped', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Dev React', company: null, source: 'wttj', score: 80 },
      { title: 'Dev React', company: null, source: 'apec', score: 70 },
    ]);
    expect(skip.size).toBe(0);
  });

  test('different company → not duplicates', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Dev React', company: 'Acme', source: 'wttj', score: 80 },
      { title: 'Dev React', company: 'Foobar Inc', source: 'apec', score: 70 },
    ]);
    expect(skip.size).toBe(0);
  });

  test('same company + near-identical title + different source → skip lower-scored', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Développeur React Senior', company: 'Acme', source: 'wttj', score: 85 },
      { title: 'Développeur React Senior', company: 'acme', source: 'apec', score: 60 },
    ]);
    expect(skip.size).toBe(1);
    expect(skip.has(1)).toBe(true); // index 1 has lower score
  });

  test('accent-insensitive company matching', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Chef de Projet', company: 'Société Générale', source: 'wttj', score: 80 },
      { title: 'Chef de Projet', company: 'Societe Generale', source: 'apec', score: 90 },
    ]);
    expect(skip.size).toBe(1);
    expect(skip.has(0)).toBe(true); // index 0 has lower score
  });

  test('titles too different → not duplicates even with same company', () => {
    const skip = detectCrossSourceDuplicates([
      { title: 'Développeur Frontend React',  company: 'Acme', source: 'wttj', score: 80 },
      { title: 'Chief Revenue Officer',        company: 'Acme', source: 'apec', score: 70 },
    ]);
    expect(skip.size).toBe(0);
  });

  test('bucket optimization: dedups remain correct with many offers', () => {
    // 100 offers across 10 companies × 5 sources × 2 titles each.
    const offers: Array<{ title: string; company: string | null; source: string; score: number }> = [];
    const sources = ['wttj', 'apec', 'france_travail', 'linkedin_rss', 'jobicy'];
    for (let c = 0; c < 10; c++) {
      for (const src of sources) {
        offers.push({
          title: `Developer Role ${c}`,
          company: `Company ${c}`,
          source: src,
          score: 50 + c,
        });
        offers.push({
          title: `Manager Role ${c}`,
          company: `Company ${c}`,
          source: src,
          score: 40 + c,
        });
      }
    }

    const skip = detectCrossSourceDuplicates(offers);
    // For each (company, title) group there are 5 sources → 4 should be skipped.
    // 10 companies × 2 titles × 4 redundant = 80 skipped.
    expect(skip.size).toBe(80);
  });
});
