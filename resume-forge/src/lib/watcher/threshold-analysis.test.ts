import { describe, expect, it } from 'bun:test';
import { SCORER_VERSION } from './scorer';
import { hiddenByThreshold, suggestThreshold, visibleCount, type ThresholdOffer } from './threshold-analysis';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function offer(id: string, score: number, o: Partial<ThresholdOffer> = {}): ThresholdOffer {
  return {
    id, title: id, company: 'X', score, scoreVersion: SCORER_VERSION,
    fetchedAt: day(1), kanbanId: null, isArchived: 0, ...o,
  };
}

describe('seuil de score', () => {
  it('masque seulement les offres de la version courante sous le seuil, les meilleures d\'abord', () => {
    const offers = [
      offer('a', 50), offer('b', 65), offer('c', 90),
      offer('legacy', 12.345, { scoreVersion: 1 }), // autre échelle : ni masquée ni comptée
    ];
    expect(hiddenByThreshold(offers, 70).map(o => o.id)).toEqual(['b', 'a']);
  });

  it('les offres d\'une ancienne version restent visibles', () => {
    const offers = [offer('legacy', 5, { scoreVersion: 1 }), offer('a', 40)];
    expect(visibleCount(offers, 60)).toBe(1);
  });

  it('suggère le seuil qui garde les offres importées ou aimées des 30 derniers jours', () => {
    const offers = [
      offer('imported', 58.9, { kanbanId: 'k1' }),
      offer('liked', 64),
      offer('x', 30), offer('y', 20), offer('z', 80), offer('w', 62),
      offer('old-liked', 10, { fetchedAt: day(45) }), // hors fenêtre
    ];
    const s = suggestThreshold(offers, new Set(['liked', 'old-liked']), 70, NOW)!;
    expect(s.threshold).toBe(58);
    expect(s.appreciated).toBe(2);
    expect(s.visibleNow).toBe(1);   // seule z (80) passe 70
    expect(s.visibleAfter).toBe(4); // imported, liked, z, w
  });

  it('aucune offre appréciée : pas de suggestion', () => {
    expect(suggestThreshold([offer('a', 50)], new Set(), 60, NOW)).toBeNull();
  });

  it('les offres appréciées d\'une ancienne échelle ne servent pas à la suggestion', () => {
    const offers = [offer('a', 2.5, { kanbanId: 'k', scoreVersion: 1 })];
    expect(suggestThreshold(offers, new Set(), 60, NOW)).toBeNull();
  });
});
