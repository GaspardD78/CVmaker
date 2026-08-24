/**
 * Tests des invariants du portefeuille de pistes.
 *
 * On couvre ici la logique de décision — celle qui protège l'utilisateur d'un
 * portefeuille incohérent — sans passer par SQLite : les fonctions asynchrones
 * ne font que traduire ces décisions en requêtes.
 */

import { describe, expect, test, mock } from 'bun:test';

// alerts.ts importe getDb ; le module SQL de Tauri n'existe pas hors application.
mock.module('@/lib/db', () => ({ getDb: async () => ({}) }));

import {
  assertCanCreateAlert,
  resolveFeedbackAlert,
  assertCanDeleteAlert,
  bestScoreOf,
  duplicateName,
  mapAlertRow,
  newAlertId,
  nextPosition,
  planLinkUpdates,
  renumberPositions,
  type AlertRow,
} from './alerts';
import { MAX_ALERTS } from '@/types/job-watch';

function row(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'a1',
    profile_id: '',
    name: 'Piste RH',
    color: '#6366f1',
    kind: 'core',
    position: 0,
    enabled: 1,
    search_profile: JSON.stringify({ jobTitles: ['Recruteur'] }),
    ai_filter_rule: null,
    learned_dict: '{"positive":{"ats":3},"negative":{}}',
    company_reputation: '{"acme":-2}',
    learned_decayed_at: null,
    last_fetched_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('limite du portefeuille', () => {
  test('autorise la création tant que le maximum n\'est pas atteint', () => {
    expect(() => assertCanCreateAlert(MAX_ALERTS - 1)).not.toThrow();
  });

  test('refuse la création au-delà du maximum', () => {
    expect(() => assertCanCreateAlert(MAX_ALERTS)).toThrow(/4 pistes maximum/);
  });

  test('refuse de supprimer la dernière piste', () => {
    expect(() => assertCanDeleteAlert(1)).toThrow(/dernière piste/);
    expect(() => assertCanDeleteAlert(2)).not.toThrow();
  });
});

describe('positions', () => {
  test('une nouvelle piste se place en fin de portefeuille', () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0 }, { position: 1 }])).toBe(2);
    // Positions non contiguës (suppression antérieure) : on repart après la plus haute.
    expect(nextPosition([{ position: 0 }, { position: 5 }])).toBe(6);
  });

  test('la renumérotation produit des positions contiguës', () => {
    const alerts = [
      { id: 'a', position: 0 },
      { id: 'b', position: 4 },
      { id: 'c', position: 9 },
    ];
    expect(renumberPositions(alerts, ['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  test('les identifiants inconnus sont ignorés et les omis replacés en fin', () => {
    const alerts = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];
    expect(renumberPositions(alerts, ['c', 'inconnu'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });
});

describe('duplication', () => {
  test('nomme la copie sans collision', () => {
    expect(duplicateName('Piste RH', ['Piste RH'])).toBe('Piste RH (copie)');
    expect(duplicateName('Piste RH', ['Piste RH', 'Piste RH (copie)'])).toBe('Piste RH (copie 2)');
    expect(
      duplicateName('Piste RH', ['Piste RH', 'Piste RH (copie)', 'Piste RH (copie 2)']),
    ).toBe('Piste RH (copie 3)');
  });
});

describe('mapAlertRow', () => {
  test('complète le profil de recherche avec les valeurs par défaut', () => {
    const alert = mapAlertRow(row(), ['apec', 'wttj']);
    expect(alert.searchProfile.jobTitles).toEqual(['Recruteur']);
    // Champs absents du JSON stocké : repris du profil par défaut.
    expect(alert.searchProfile.contractTypes).toEqual(['CDI']);
    expect(alert.searchProfile.scoring.mode).toBe('balanced');
    expect(alert.sources).toEqual(['apec', 'wttj']);
    expect(alert.learnedDict.positive).toEqual({ ats: 3 });
    expect(alert.companyReputation).toEqual({ acme: -2 });
  });

  test('un JSON corrompu ne rend pas la piste inutilisable', () => {
    const alert = mapAlertRow(row({ search_profile: '{ oops', learned_dict: 'nope' }));
    expect(alert.searchProfile.jobTitles).toEqual([]);
    expect(alert.learnedDict).toEqual({ positive: {}, negative: {} });
  });

  test('un type de piste inconnu retombe sur « core »', () => {
    expect(mapAlertRow(row({ kind: 'bizarre' })).kind).toBe('core');
  });

  test('génère un identifiant au format du schéma', () => {
    expect(newAlertId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('resolveFeedbackAlert', () => {
  const links = [
    { alertId: 'a', score: 40, matchedAt: '' },
    { alertId: 'b', score: 85, matchedAt: '' },
  ];

  test('en vue filtrée, le feedback revient à la piste consultée', () => {
    // Même si elle note l'offre plus bas : c'est dans son contexte que
    // l'utilisateur a jugé l'offre.
    expect(resolveFeedbackAlert(links, 'a')).toBe('a');
  });

  test('en vue « toutes les pistes », il revient à la mieux-disante', () => {
    expect(resolveFeedbackAlert(links, null)).toBe('b');
  });

  test('une piste sélectionnée non rattachée à l\'offre est ignorée', () => {
    expect(resolveFeedbackAlert(links, 'autre')).toBe('b');
  });

  test('une offre orpheline n\'attribue le feedback à personne', () => {
    expect(resolveFeedbackAlert([], null)).toBeNull();
    expect(resolveFeedbackAlert([], 'unlinked')).toBeNull();
  });
});

describe('planLinkUpdates', () => {
  test('crée les liaisons manquantes', () => {
    const plan = planLinkUpdates([], [{ alertId: 'a', score: 70 }, { alertId: 'b', score: 40 }]);
    expect(plan.inserts).toEqual([{ alertId: 'a', score: 70 }, { alertId: 'b', score: 40 }]);
    expect(plan.scoreUpdates).toEqual([]);
    expect(plan.bestScore).toBe(70);
  });

  test('relève un score existant mais ne le dégrade jamais', () => {
    const existing = [{ alertId: 'a', score: 50, matchedAt: '2026-01-01T00:00:00.000Z' }];
    const monte = planLinkUpdates(existing, [{ alertId: 'a', score: 80 }]);
    expect(monte.scoreUpdates).toEqual([{ alertId: 'a', score: 80 }]);
    expect(monte.bestScore).toBe(80);

    const descend = planLinkUpdates(existing, [{ alertId: 'a', score: 20 }]);
    expect(descend.scoreUpdates).toEqual([]);
    expect(descend.inserts).toEqual([]);
    expect(descend.bestScore).toBe(50);
  });

  test('une nouvelle piste sur une offre déjà rattachée ajoute la liaison manquante', () => {
    const existing = [{ alertId: 'a', score: 60, matchedAt: '2026-01-01T00:00:00.000Z' }];
    const plan = planLinkUpdates(existing, [{ alertId: 'b', score: 35 }]);
    expect(plan.inserts).toEqual([{ alertId: 'b', score: 35 }]);
    // Le meilleur score reste celui de la piste existante.
    expect(plan.bestScore).toBe(60);
  });

  test('le meilleur score agrège pistes existantes et nouvelles', () => {
    const existing = [{ alertId: 'a', score: 30, matchedAt: '2026-01-01T00:00:00.000Z' }];
    const plan = planLinkUpdates(existing, [{ alertId: 'b', score: 90 }]);
    expect(plan.bestScore).toBe(90);
  });

  test('bestScoreOf vaut 0 pour une offre sans rattachement', () => {
    expect(bestScoreOf([])).toBe(0);
    expect(bestScoreOf([
      { alertId: 'a', score: 12, matchedAt: '' },
      { alertId: 'b', score: 77, matchedAt: '' },
    ])).toBe(77);
  });
});
