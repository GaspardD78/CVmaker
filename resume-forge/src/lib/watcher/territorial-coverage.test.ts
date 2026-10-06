import { describe, expect, test } from 'bun:test';
import { countTerritorialOffers, territorialCoverageText, toMillis } from './territorial-coverage';

const offer = (over: Partial<{ source: string; origin: string | null; fetchedAt: string }>) => ({
  source: 'choisir_service_public', origin: 'emploi_territorial', fetchedAt: '2026-10-06 08:10:00', ...over,
}) as never;

describe('countTerritorialOffers', () => {
  const logAt = '2026-10-06T08:12:00.000Z';
  test('compte les offres d\'origine territoriale de la dernière collecte', () => {
    const offers = [offer({}), offer({ fetchedAt: '2026-10-06 08:11:30' }), offer({ origin: 'place_emploi_public' }), offer({ origin: null })];
    expect(countTerritorialOffers(offers, logAt)).toBe(2);
  });
  test('ignore les collectes antérieures et les autres sources', () => {
    expect(countTerritorialOffers([offer({ fetchedAt: '2026-10-05 08:10:00' }), offer({ source: 'apec' })], logAt)).toBe(0);
  });
  test('pas de journal : zéro', () => {
    expect(countTerritorialOffers([offer({})], null)).toBe(0);
  });
  test('horodatage SQLite lu en UTC', () => {
    expect(toMillis('2026-10-06 08:10:00')).toBe(Date.parse('2026-10-06T08:10:00Z'));
  });
});

describe('territorialCoverageText', () => {
  test('libellé et détail', () => {
    expect(territorialCoverageText(true, 'x', 3)).toEqual({
      headline: 'Couvert via Choisir le service public',
      detail: '3 offres d\'origine territoriale à la dernière collecte.',
    });
    expect(territorialCoverageText(true, 'x', 1).detail).toContain('1 offre d\'origine');
    expect(territorialCoverageText(true, 'x', 0).detail).toContain('Aucune offre');
    expect(territorialCoverageText(false, null, 0).detail).toContain('Ajoutez');
    expect(territorialCoverageText(true, null, 0).detail).toBe('Aucune collecte encore.');
  });
});
