/**
 * Tests des métriques du portefeuille.
 *
 * Le recouvrement est ce que l'application doit pouvoir affirmer seule, sans
 * IA : c'est donc sa définition qui est vérifiée ici, en particulier le choix
 * de rapporter au plus petit des deux volumes.
 */

import { describe, expect, test, mock } from 'bun:test';

mock.module('@/lib/db', () => ({ getDb: async () => ({}) }));

import { computeMetricsFromRows, mergeDuplicateRows, type MetricRow } from './portfolio-metrics';
import { SCORER_VERSION } from './scorer';

const alerts = [
  { id: 'a', name: 'Piste A', position: 0 },
  { id: 'b', name: 'Piste B', position: 1 },
];

function row(alertId: string, offerId: string, overrides: Partial<MetricRow> = {}): MetricRow {
  return { alertId, offerId, score: 50, isRead: 0, hasKanban: false, quickArchived: false, ...overrides };
}

describe('computeMetricsFromRows', () => {
  test('une piste sans offre reste présente avec des compteurs à zéro', () => {
    const metrics = computeMetricsFromRows([row('a', 'o1')], alerts);
    expect(metrics.perAlert).toHaveLength(2);
    expect(metrics.perAlert[1].total).toBe(0);
    expect(metrics.perAlert[1].medianScore).toBe(0);
  });

  test('compte les offres exclusives à une piste', () => {
    const metrics = computeMetricsFromRows(
      [row('a', 'o1'), row('a', 'o2'), row('b', 'o2'), row('b', 'o3')],
      alerts,
    );
    expect(metrics.perAlert[0].total).toBe(2);
    expect(metrics.perAlert[0].exclusive).toBe(1); // o1
    expect(metrics.perAlert[1].exclusive).toBe(1); // o3
  });

  test('calcule les taux de lecture, import et archivage rapide', () => {
    const metrics = computeMetricsFromRows(
      [
        row('a', 'o1', { isRead: 1, hasKanban: true }),
        row('a', 'o2', { isRead: 1 }),
        row('a', 'o3', { quickArchived: true }),
        row('a', 'o4'),
      ],
      alerts,
    );
    expect(metrics.perAlert[0].readRate).toBe(50);
    expect(metrics.perAlert[0].kanbanRate).toBe(25);
    expect(metrics.perAlert[0].quickArchiveRate).toBe(25);
  });

  test('le score médian est celui de la piste', () => {
    const metrics = computeMetricsFromRows(
      [
        row('a', 'o1', { score: 10 }),
        row('a', 'o2', { score: 50 }),
        row('a', 'o3', { score: 90 }),
        row('b', 'o4', { score: 20 }),
      ],
      alerts,
    );
    expect(metrics.perAlert[0].medianScore).toBe(50);
    expect(metrics.perAlert[1].medianScore).toBe(20);
  });

  test('deux pistes sans offre commune ont un recouvrement nul', () => {
    const metrics = computeMetricsFromRows([row('a', 'o1'), row('b', 'o2')], alerts);
    expect(metrics.overlaps[0].sharedPercent).toBe(0);
  });

  test('deux pistes identiques se recouvrent à 100 %', () => {
    const metrics = computeMetricsFromRows(
      [row('a', 'o1'), row('a', 'o2'), row('b', 'o1'), row('b', 'o2')],
      alerts,
    );
    expect(metrics.overlaps[0].shared).toBe(2);
    expect(metrics.overlaps[0].sharedPercent).toBe(100);
  });

  test('une petite piste entièrement incluse dans une grosse affiche 100 %', () => {
    // Rapporté au plus grand volume, ce cas afficherait 20 % et masquerait le
    // fait que la petite piste n'apporte rien de plus que la grande.
    const big = ['o1', 'o2', 'o3', 'o4', 'o5'].map(id => row('a', id));
    const small = [row('b', 'o1')];
    const metrics = computeMetricsFromRows([...big, ...small], alerts);
    expect(metrics.overlaps[0].sharedPercent).toBe(100);
  });

  test('les recouvrements sont triés du plus fort au plus faible', () => {
    const three = [
      { id: 'a', name: 'A', position: 0 },
      { id: 'b', name: 'B', position: 1 },
      { id: 'c', name: 'C', position: 2 },
    ];
    const metrics = computeMetricsFromRows(
      [
        row('a', 'o1'), row('a', 'o2'),
        row('b', 'o3'),
        row('c', 'o1'), row('c', 'o2'),
      ],
      three,
    );
    expect(metrics.overlaps[0].sharedPercent).toBeGreaterThanOrEqual(metrics.overlaps[1].sharedPercent);
    expect(metrics.overlaps[0].nameA).toBe('A');
    expect(metrics.overlaps[0].nameB).toBe('C');
  });

  test('un rattachement vers une piste supprimée est ignoré', () => {
    const metrics = computeMetricsFromRows([row('a', 'o1'), row('disparue', 'o1')], alerts);
    expect(metrics.perAlert[0].total).toBe(1);
    // L'offre n'est comptée que sur une piste connue : elle reste exclusive.
    expect(metrics.perAlert[0].exclusive).toBe(1);
  });
});

describe('échelle de score et annonces republiées', () => {
  test('la médiane ignore les scores d\'une ancienne version', () => {
    const metrics = computeMetricsFromRows(
      [
        row('a', 'o1', { score: 80, scoreVersion: SCORER_VERSION }),
        row('a', 'o2', { score: 60, scoreVersion: SCORER_VERSION }),
        row('a', 'o3', { score: 12.345, scoreVersion: 1 }),
      ],
      alerts,
    );
    expect(metrics.perAlert[0].medianScore).toBe(70);
  });

  test('une annonce republiée (deux enregistrements) ne compte qu\'une fois dans la piste', () => {
    const canonical = new Map([['o1', 'o1'], ['o1-bis', 'o1']]);
    const merged = mergeDuplicateRows(
      [row('a', 'o1', { score: 70 }), row('a', 'o1-bis', { score: 85, isRead: 1 })],
      canonical,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ offerId: 'o1', score: 85, isRead: 1 });
    expect(computeMetricsFromRows(merged, alerts).perAlert[0].total).toBe(1);
  });

  test('le recouvrement entre pistes tient compte du regroupement', () => {
    const canonical = new Map([['o1', 'o1'], ['o1-bis', 'o1']]);
    const merged = mergeDuplicateRows([row('a', 'o1'), row('b', 'o1-bis')], canonical);
    const metrics = computeMetricsFromRows(merged, alerts);
    expect(metrics.overlaps[0].shared).toBe(1);
    expect(metrics.perAlert[0].exclusive).toBe(0);
  });
});
