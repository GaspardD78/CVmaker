import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cspLocationId, departmentLocationId, regionLocationIdOf, resolveCspLocationIds, DEPARTMENT_PLACE,
  MAX_LOCATION_SEARCHES, normalizePlaceName,
} from './csp-locations';
import { buildCspSearchUrl } from './csp-html';

describe('table des lieux', () => {
  test('la table de la spec est identique à celle embarquée (335 lieux)', () => {
    const spec = JSON.parse(readFileSync(join(import.meta.dir, '../../../../../specs/007-apec-et-recovery/fixtures/csp-localisations.json'), 'utf8'));
    const embedded = JSON.parse(readFileSync(join(import.meta.dir, 'data/csp-localisations.json'), 'utf8'));
    expect(Object.keys(spec)).toHaveLength(335);
    expect(embedded).toEqual(spec);
  });
  test('identifiants constatés sur le site', () => {
    expect(departmentLocationId('78')).toBe(289);   // Yvelines
    expect(departmentLocationId('75')).toBe(284);   // Paris
    expect(departmentLocationId('92')).toBe(283);   // Hauts-de-Seine
    expect(departmentLocationId('93')).toBe(286);   // Seine-Saint-Denis
    expect(departmentLocationId('94')).toBe(287);   // Val-de-Marne
    expect(departmentLocationId('91')).toBe(282);   // Essonne
    expect(departmentLocationId('95')).toBe(288);   // Val-d'Oise
    expect(departmentLocationId('77')).toBe(285);   // Seine-et-Marne
    expect(cspLocationId('Île-de-France')).toBe(208);
    expect(cspLocationId('ile de france')).toBe(208);
  });
  test('tous les départements ont un identifiant, toutes les régions aussi', () => {
    for (const code of Object.keys(DEPARTMENT_PLACE)) {
      expect(departmentLocationId(code)).not.toBeNull();
      expect(regionLocationIdOf(code)).not.toBeNull();
    }
    expect(Object.keys(DEPARTMENT_PLACE)).toHaveLength(101);
  });
  test('normalisation des noms', () => {
    expect(normalizePlaceName("Côtes d'Armor")).toBe(normalizePlaceName('Côtes d Armor'));
  });
});

describe('resolveCspLocationIds', () => {
  const q = (departmentCodes: string[], radiusKm = 30, city = '') => ({ departmentCodes, city, radiusKm });
  test('Yvelines : le département (289)', () => {
    expect(resolveCspLocationIds(q(['78']))).toEqual([289]);
  });
  test('rayon au-delà du département : la région (Île-de-France = 208)', () => {
    expect(resolveCspLocationIds(q(['78'], 60))).toEqual([208]);
  });
  test('plusieurs départements d\'une même région : la région, une seule recherche', () => {
    expect(resolveCspLocationIds(q(['78', '92', '75']))).toEqual([208]);
  });
  test('régions différentes : bornées', () => {
    const ids = resolveCspLocationIds(q(['78', '69', '13']));
    expect(ids.length).toBeLessThanOrEqual(MAX_LOCATION_SEARCHES);
    expect(ids).toEqual([208, cspLocationId('Auvergne-Rhône-Alpes')!]);
  });
  test('sans département : déduit de la ville', () => {
    expect(resolveCspLocationIds(q([], 30, 'Versailles'))).toEqual([289]);
  });
  test('lieu inconnu : aucun filtre (post-filtre client)', () => {
    expect(resolveCspLocationIds(q([], 30, 'Lieu inexistant'))).toEqual([]);
    expect(resolveCspLocationIds(q(['99']))).toEqual([]);
  });
  test('URL de recherche avec identifiant interne', () => {
    const [id] = resolveCspLocationIds(q(['78']));
    expect(buildCspSearchUrl({ keywords: 'recrutement', locationId: id }))
      .toBe('https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/recrutement/localisation/289/');
    const [region] = resolveCspLocationIds(q(['78'], 80));
    expect(buildCspSearchUrl({ keywords: 'recrutement', locationId: region })).toContain('/localisation/208/');
  });
});
