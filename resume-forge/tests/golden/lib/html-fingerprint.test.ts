import { describe, expect, test } from 'bun:test';
import { enabledLigatureFeatures } from './html-fingerprint';

describe('enabledLigatureFeatures', () => {
  test('"liga", "liga" 1 et "liga" on activent', () => {
    expect(enabledLigatureFeatures('"liga"')).toEqual(['liga']);
    expect(enabledLigatureFeatures('"liga" 1')).toEqual(['liga']);
    expect(enabledLigatureFeatures('"liga" on')).toEqual(['liga']);
  });

  test('"liga" 0 et "liga" off désactivent', () => {
    expect(enabledLigatureFeatures('"liga" 0')).toEqual([]);
    expect(enabledLigatureFeatures('"liga" off')).toEqual([]);
  });

  test('clig, dlig, hlig et calt, listes et valeur normal', () => {
    expect(enabledLigatureFeatures("'clig', \"dlig\" 2, \"hlig\" 0, \"calt\" on, \"kern\"")).toEqual(['clig', 'dlig', 'calt']);
    expect(enabledLigatureFeatures('normal')).toEqual([]);
  });
});
