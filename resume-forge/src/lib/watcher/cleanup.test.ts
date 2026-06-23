/**
 * cleanup.test.ts — logique de détection des offres périmées
 *
 * Runner : bun test
 */

import { describe, expect, test } from 'bun:test';
import { isOfferExpired, offerAgeDays, DEFAULT_EXPIRED_MAX_AGE_DAYS } from './cleanup';

const NOW = new Date('2026-06-23T12:00:00Z');

describe('offerAgeDays', () => {
  test('utilise publishedAt quand il est disponible', () => {
    const age = offerAgeDays(
      { publishedAt: '2026-06-13T12:00:00Z', fetchedAt: '2026-06-22 12:00:00' },
      NOW,
    );
    expect(age).toBeCloseTo(10, 5);
  });

  test('retombe sur fetchedAt quand publishedAt est null', () => {
    const age = offerAgeDays({ publishedAt: null, fetchedAt: '2026-06-18 12:00:00' }, NOW);
    expect(age).toBeCloseTo(5, 5);
  });

  test('retombe sur fetchedAt quand publishedAt est illisible', () => {
    const age = offerAgeDays({ publishedAt: 'pas-une-date', fetchedAt: '2026-06-21 12:00:00' }, NOW);
    expect(age).toBeCloseTo(2, 5);
  });

  test('interprète les timestamps SQLite « YYYY-MM-DD HH:MM:SS » en UTC', () => {
    const age = offerAgeDays({ publishedAt: null, fetchedAt: '2026-06-23 00:00:00' }, NOW);
    expect(age).toBeCloseTo(0.5, 5);
  });

  test('renvoie null quand aucune date n’est exploitable', () => {
    expect(offerAgeDays({ publishedAt: 'x', fetchedAt: 'y' }, NOW)).toBeNull();
  });
});

describe('isOfferExpired', () => {
  test('périmée au-delà du seuil', () => {
    expect(
      isOfferExpired({ publishedAt: '2026-05-01T12:00:00Z', fetchedAt: '2026-05-01 12:00:00' }, 30, NOW),
    ).toBe(true);
  });

  test('non périmée dans le seuil', () => {
    expect(
      isOfferExpired({ publishedAt: '2026-06-10T12:00:00Z', fetchedAt: '2026-06-10 12:00:00' }, 30, NOW),
    ).toBe(false);
  });

  test('borne : pile au seuil n’est pas périmée (strictement supérieur)', () => {
    // 2026-05-24 → 2026-06-23 = exactement 30 jours
    expect(
      isOfferExpired({ publishedAt: '2026-05-24T12:00:00Z', fetchedAt: '2026-05-24 12:00:00' }, 30, NOW),
    ).toBe(false);
  });

  test('jamais périmée quand les dates sont illisibles', () => {
    expect(isOfferExpired({ publishedAt: 'x', fetchedAt: 'y' }, 30, NOW)).toBe(false);
  });

  test('le seuil par défaut est de 30 jours', () => {
    expect(DEFAULT_EXPIRED_MAX_AGE_DAYS).toBe(30);
  });
});
