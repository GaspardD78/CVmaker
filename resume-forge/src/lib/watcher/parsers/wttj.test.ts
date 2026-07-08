/**
 * wttj.test.ts — Tests du mapping hit Algolia → RawJobOffer
 *
 * Runner : bun test
 *
 * La page de recherche WTTJ étant une SPA, le parser interroge désormais
 * l'API Algolia publique. Ces tests verrouillent le mapping des hits :
 * URL canonique, salaires (annualisation), contrat, localisation.
 */

import { describe, expect, test, mock } from 'bun:test';

// Le parser importe http-client → http.ts → @tauri-apps/plugin-http. On stub la
// feuille pour que l'import du module ne touche jamais le natif (cf. linkedin-xray.test.ts).
mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async () => new Response('', { status: 200 }),
}));

// stripHtml s'appuie sur `document`, absent sous bun:test — stub minimal.
if (typeof document === 'undefined') {
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      let html = '';
      return {
        set innerHTML(v: string) { html = v; },
        get textContent() { return html.replace(/<[^>]*>/g, ' '); },
        get innerText() { return html.replace(/<[^>]*>/g, ' '); },
      };
    },
  };
}

import { hitToOffer } from './wttj';
import type { WttjAlgoliaHit } from './wttj';

const baseHit: WttjAlgoliaHit = {
  name: 'Talent Acquisition Manager',
  slug: 'talent-acquisition-manager_paris',
  organization: { name: 'Acme', slug: 'acme' },
  offices: [{ city: 'Paris', country_code: 'FR', latitude: 48.8566, longitude: 2.3522 }],
  contract_type: 'full_time',
  published_at: '2026-07-01T08:00:00Z',
  summary: 'Vous pilotez le recrutement.',
};

describe('hitToOffer', () => {
  test('mapping nominal — URL canonique, ville FR, contrat normalisé', () => {
    const offer = hitToOffer(baseHit);
    expect(offer).not.toBeNull();
    expect(offer!.url).toBe(
      'https://www.welcometothejungle.com/fr/companies/acme/jobs/talent-acquisition-manager_paris'
    );
    expect(offer!.title).toBe('Talent Acquisition Manager');
    expect(offer!.company).toBe('Acme');
    expect(offer!.location).toBe('Paris');
    expect(offer!.locationLat).toBeCloseTo(48.8566);
    expect(offer!.locationLon).toBeCloseTo(2.3522);
    expect(offer!.contractType).toBe('CDI');
    expect(offer!.source).toBe('wttj');
    expect(offer!.extraction.titleSource).toBe('api');
    expect(offer!.extraction.titleConfidence).toBe('high');
  });

  test('hit sans titre ou sans slugs → écarté (pas de dédup/ouverture possible)', () => {
    expect(hitToOffer({ ...baseHit, name: undefined })).toBeNull();
    expect(hitToOffer({ ...baseHit, name: '  ' })).toBeNull();
    expect(hitToOffer({ ...baseHit, slug: undefined, reference: undefined })).toBeNull();
    expect(hitToOffer({ ...baseHit, organization: { name: 'Acme' } })).toBeNull();
  });

  test('reference utilisée comme slug de repli', () => {
    const offer = hitToOffer({ ...baseHit, slug: undefined, reference: 'REF123' });
    expect(offer!.url).toBe('https://www.welcometothejungle.com/fr/companies/acme/jobs/REF123');
  });

  test('bureau FR privilégié parmi plusieurs bureaux', () => {
    const offer = hitToOffer({
      ...baseHit,
      offices: [
        { city: 'Berlin', country_code: 'DE' },
        { city: 'Lyon', country_code: 'FR' },
      ],
    });
    expect(offer!.location).toBe('Lyon');
  });

  test('salaire annuel transmis tel quel', () => {
    const offer = hitToOffer({
      ...baseHit,
      salary_yearly_minimum: 45_000,
      salary_maximum: 55_000,
      salary_currency: 'EUR',
    });
    expect(offer!.salaryMin).toBe(45_000);
    expect(offer!.salaryMax).toBe(55_000);
    expect(offer!.salaryRaw).toBe('45000-55000 EUR');
  });

  test('salaire mensuel annualisé (×12)', () => {
    const offer = hitToOffer({
      ...baseHit,
      salary_minimum: 3_000,
      salary_maximum: 3_500,
      salary_period: 'monthly',
      salary_currency: 'EUR',
    });
    expect(offer!.salaryMin).toBe(36_000);
    expect(offer!.salaryMax).toBe(42_000);
  });

  test('contrats WTTJ normalisés en libellés français', () => {
    expect(hitToOffer({ ...baseHit, contract_type: 'temporary' })!.contractType).toBe('CDD');
    expect(hitToOffer({ ...baseHit, contract_type: 'internship' })!.contractType).toBe('Stage');
    expect(hitToOffer({ ...baseHit, contract_type: 'apprenticeship' })!.contractType).toBe('Alternance');
    expect(hitToOffer({ ...baseHit, contract_type: 'freelance' })!.contractType).toBe('Freelance');
    expect(hitToOffer({ ...baseHit, contract_type: undefined })!.contractType).toBeNull();
  });

  test('_geoloc (objet) utilisé quand offices[] n\'a pas de coordonnées', () => {
    const offer = hitToOffer({
      ...baseHit,
      offices: [{ city: 'Montpellier', country_code: 'FR' }],
      _geoloc: { lat: 43.61, lng: 3.88 },
    });
    expect(offer!.location).toBe('Montpellier');
    expect(offer!.locationLat).toBeCloseTo(43.61);
    expect(offer!.locationLon).toBeCloseTo(3.88);
  });

  test('_geoloc (tableau) aligné sur le bureau FR retenu', () => {
    const offer = hitToOffer({
      ...baseHit,
      offices: [
        { city: 'Berlin', country_code: 'DE' },
        { city: 'Lyon', country_code: 'FR' },
      ],
      _geoloc: [
        { lat: 52.52, lng: 13.40 },
        { lat: 45.76, lng: 4.84 },
      ],
    });
    expect(offer!.location).toBe('Lyon');
    expect(offer!.locationLat).toBeCloseTo(45.76);
    expect(offer!.locationLon).toBeCloseTo(4.84);
  });

  test('coordonnées du bureau prioritaires sur _geoloc', () => {
    const offer = hitToOffer({
      ...baseHit,
      _geoloc: { lat: 0, lng: 0 },
    });
    expect(offer!.locationLat).toBeCloseTo(48.8566);
    expect(offer!.locationLon).toBeCloseTo(2.3522);
  });

  test('champs optionnels absents → offre valide avec métadonnées "none"', () => {
    const offer = hitToOffer({
      name: 'Recruteur',
      slug: 'recruteur',
      organization: { slug: 'org' },
    });
    expect(offer).not.toBeNull();
    expect(offer!.company).toBeNull();
    expect(offer!.location).toBeNull();
    expect(offer!.locationLat).toBeNull();
    expect(offer!.salaryMin).toBeNull();
    expect(offer!.extraction.locationSource).toBe('none');
    expect(offer!.extraction.contractSource).toBe('none');
  });
});
