/**
 * Unit tests for the pure helpers of the commute module.
 * Network paths (Nominatim/Navitia) are not exercised here — we cover the
 * location sanitisation that decides whether geocoding can succeed at all.
 */

import { describe, expect, test, mock } from 'bun:test';

// commute.ts pulls in http-client → http.ts → @tauri-apps/plugin-http. Stub the
// leaf so importing the module never touches native bits.
mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async () => new Response('', { status: 200 }),
}));

import { sanitizeLocationForGeocoding } from './commute';

describe('sanitizeLocationForGeocoding', () => {
  test('strips trailing department code in parentheses', () => {
    expect(sanitizeLocationForGeocoding('Boulogne-Billancourt (92)')).toBe('Boulogne-Billancourt, France');
    expect(sanitizeLocationForGeocoding('Paris (75)')).toBe('Paris, France');
  });

  test('strips leading "NN - " department prefix (France Travail style)', () => {
    expect(sanitizeLocationForGeocoding('92 - Levallois-Perret')).toBe('Levallois-Perret, France');
    expect(sanitizeLocationForGeocoding('92 – Levallois-Perret')).toBe('Levallois-Perret, France');
  });

  test('strips trailing " - NN" department suffix', () => {
    expect(sanitizeLocationForGeocoding('La Défense – 92')).toBe('La Défense, France');
    expect(sanitizeLocationForGeocoding('Levallois-Perret - 92')).toBe('Levallois-Perret, France');
  });

  test('appends France only when absent', () => {
    expect(sanitizeLocationForGeocoding('Lyon, France')).toBe('Lyon, France');
    // « Île-de-France » contient déjà le mot France — pas de suffixe redondant.
    expect(sanitizeLocationForGeocoding('Boulogne-Billancourt, Île-de-France')).toBe(
      'Boulogne-Billancourt, Île-de-France',
    );
  });

  test('collapses whitespace', () => {
    expect(sanitizeLocationForGeocoding('  Levallois   Perret  ')).toBe('Levallois Perret, France');
  });

  test('falls back to raw input when stripping empties the string', () => {
    expect(sanitizeLocationForGeocoding('92')).toBe('92, France');
  });
});
