/**
 * Tests du classificateur d'erreurs de sources (`source-error.ts`).
 *
 * Couvre les messages réellement levés par les parsers afin de garantir que :
 *  - les pannes opérationnelles (HTTP 4xx/5xx, réseau, anti-bot, quota) sont
 *    bien reconnues → journalisées en `console.warn`, hors du suivi d'erreurs ;
 *  - les vrais bugs applicatifs ne sont PAS reconnus → restent `console.error`.
 */

import { describe, expect, test } from 'bun:test';
import { isOperationalSourceError } from './source-error';

describe('isOperationalSourceError — pannes opérationnelles', () => {
  // Messages réels levés/renvoyés par les parsers et la commande Rust.
  const operational = [
    'APEC HTTP 500',                                   // fetch_apec_api (Rust)
    'APEC HTTP 502',
    'LinkedIn jobs-guest API 429',                     // linkedin-xray.ts
    'LinkedIn jobs-guest API 403',
    'HTTP 403',                                         // wttj.ts / jobicy.ts
    'HTTP 503 pour https://exemple.fr/flux.rss',        // rss-utils.ts
    'France Travail OAuth2 error 500: token...',        // france-travail.ts
    'France Travail search error 503: Erreur technique',
    'France Travail: fetch failed after retries',
    'APEC réseau: error sending request for url (...)', // fetch_apec_api réseau
    'Request timed out',
    'Failed to fetch',
    'Too Many Requests',
    // Legacy : message DuckDuckGo avant migration vers l'API guest.
    'DuckDuckGo HTML 403 : <!DOCTYPE html><html lang="en-US">... bots use DuckDuckGo too',
  ];

  for (const msg of operational) {
    test(`opérationnel : ${msg.slice(0, 48)}`, () => {
      expect(isOperationalSourceError(msg)).toBe(true);
    });
  }
});

describe('isOperationalSourceError — vrais bugs applicatifs', () => {
  const bugs = [
    "Cannot read properties of undefined (reading 'slice')",
    'Maximum call stack size exceeded',
    'Source inconnue: foobar',
    'Source dépréciée: mantiks',
    'assertion failed: offers.length > 0',
    // Un identifiant numérique d'offre ne doit pas être pris pour un code HTTP.
    'Offre 4500123 introuvable en base',
  ];

  for (const msg of bugs) {
    test(`bug : ${msg.slice(0, 48)}`, () => {
      expect(isOperationalSourceError(msg)).toBe(false);
    });
  }
});
