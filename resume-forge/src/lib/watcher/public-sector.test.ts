import { describe, expect, test } from 'bun:test';
import { isPublicSectorText } from './public-sector';

describe('isPublicSectorText', () => {
  test('piste fonction publique', () => {
    expect(isPublicSectorText(['Chargé de recrutement'], ['Collectivités territoriales'])).toBe(true);
    expect(isPublicSectorText('Fonction publique territoriale')).toBe(true);
    expect(isPublicSectorText(['Responsable RH'], ['Conseil départemental', 'FPT'])).toBe(true);
  });
  test('piste privée', () => {
    expect(isPublicSectorText(['Talent Acquisition Manager'], ['SaaS', 'Scale-up'])).toBe(false);
    expect(isPublicSectorText(undefined)).toBe(false);
  });
});
