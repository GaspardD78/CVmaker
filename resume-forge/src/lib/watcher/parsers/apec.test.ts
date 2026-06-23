/**
 * apec.test.ts — Tests du filtre titre APEC (token-overlap)
 *
 * Runner : bun test
 *
 * Le filtre titre arbitre le compromis rappel/précision après le fetch APEC :
 * trop strict (ancien match exact) il jetait des variantes pertinentes ;
 * trop lâche il laisse passer du bruit. Ces cas verrouillent ce compromis.
 */

import { describe, expect, test } from 'bun:test';
import { titleMatchesAnyJobTitle } from './apec';

describe('titleMatchesAnyJobTitle', () => {
  test('aucun intitulé exploitable → accepte tout', () => {
    expect(titleMatchesAnyJobTitle('Comptable', [])).toBe(true);
    expect(titleMatchesAnyJobTitle('Comptable', ['   '])).toBe(true);
    expect(titleMatchesAnyJobTitle('Comptable', ['de', 'les'])).toBe(true);
  });

  test('token unique → match exact requis', () => {
    expect(titleMatchesAnyJobTitle('Recruteur tech H/F', ['Recruteur'])).toBe(true);
    expect(titleMatchesAnyJobTitle('Comptable général', ['Recruteur'])).toBe(false);
  });

  test('variante proche tolérée (1 token manquant sur 3)', () => {
    expect(
      titleMatchesAnyJobTitle('Talent Acquisition Specialist', ['Talent Acquisition Manager']),
    ).toBe(true);
  });

  test('insensible aux accents et à l’ordre des mots', () => {
    expect(
      titleMatchesAnyJobTitle('Recrutement — Charge de mission', ['Chargé de recrutement']),
    ).toBe(true);
  });

  test('rejette le bruit proche (1 token commun sur 2)', () => {
    expect(titleMatchesAnyJobTitle('Chargé de clientèle', ['Chargé de recrutement'])).toBe(false);
  });

  test('intitulé à 2 tokens → les deux requis', () => {
    expect(titleMatchesAnyJobTitle('Talent Acquisition Partner', ['Talent Partner'])).toBe(true);
    expect(titleMatchesAnyJobTitle('Business Partner RH', ['Talent Partner'])).toBe(false);
  });

  test('plusieurs intitulés → un seul match suffit', () => {
    expect(titleMatchesAnyJobTitle('Développeur Full Stack', ['Recruteur', 'Développeur'])).toBe(true);
  });
});
