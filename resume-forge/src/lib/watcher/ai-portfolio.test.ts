/**
 * Tests de la validation des échanges IA du portefeuille.
 *
 * Ce qui compte ici : un JSON malformé ne doit jamais abîmer la configuration,
 * et les problèmes de qualité (recouvrement, piste sans source, angles morts
 * absents) doivent remonter comme des avertissements — c'est un jugement, pas
 * une erreur de format, et l'utilisateur reste décideur.
 */

import { describe, expect, test } from 'bun:test';
import {
  AI_PORTFOLIO_SCHEMA_VERSION,
  AI_REVIEW_SCHEMA_VERSION,
  buildPortfolioImportPreview,
  buildPortfolioReviewPrompt,
  buildPortfolioStrategyPrompt,
  extractJson,
  toSearchProfile,
  validateAlertPortfolio,
  validatePortfolioReview,
} from './ai-portfolio';
import { DEFAULT_SEARCH_PROFILE, MAX_ALERTS, type AlertKind } from '@/types/job-watch';

function alert(name: string, kind: AlertKind, overrides: Record<string, unknown> = {}) {
  return {
    name,
    kind,
    rationale: `Justification de ${name}`,
    sources: ['apec'],
    searchProfile: {
      jobTitles: [`${name} A`, `${name} B`],
      skills: ['ATS'],
      domains: ['SaaS'],
      excludeTitles: ['stage', 'alternance', 'apprenti'],
      excludeDomains: [],
      location: { label: 'Paris (75)', city: 'Paris', radiusKm: 30 },
      contractTypes: ['CDI'],
      salary: { min: null, target: null },
      scoring: { mode: 'balanced' },
    },
    ...overrides,
  };
}

function portfolio(overrides: Record<string, unknown> = {}) {
  return {
    version: AI_PORTFOLIO_SCHEMA_VERSION,
    rationale: 'Trois pistes complémentaires.',
    alerts: [alert('Cœur', 'core'), alert('Voisin', 'adjacent'), alert('Ouverture', 'exploratory')],
    blindSpots: ['Le secteur public n\'est pas couvert.'],
    ...overrides,
  };
}

describe('validateAlertPortfolio — rejets', () => {
  test('accepte un portefeuille conforme', () => {
    const { portfolio: parsed, warnings } = validateAlertPortfolio(portfolio());
    expect(parsed.alerts).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  test('rejette une version de schéma inconnue', () => {
    expect(() => validateAlertPortfolio(portfolio({ version: '9.9' }))).toThrow(/Version de schéma inconnue/);
  });

  test('rejette un portefeuille trop petit ou trop grand', () => {
    expect(() => validateAlertPortfolio(portfolio({ alerts: [alert('A', 'core')] }))).toThrow(/au moins 3 pistes/);
    const tooMany = Array.from({ length: MAX_ALERTS + 1 }, (_, i) => alert(`P${i}`, 'adjacent'));
    expect(() => validateAlertPortfolio(portfolio({ alerts: tooMany }))).toThrow(/au plus 4 pistes/);
  });

  test('exige exactement une piste cœur de cible', () => {
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'adjacent'), alert('B', 'adjacent'), alert('C', 'exploratory')],
    }))).toThrow(/exactement une piste/);
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core'), alert('B', 'core'), alert('C', 'exploratory')],
    }))).toThrow(/exactement une piste/);
  });

  test('exige au moins une piste d\'ouverture', () => {
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core'), alert('B', 'adjacent'), alert('C', 'adjacent')],
    }))).toThrow(/au moins une piste d'ouverture/);
  });

  test('rejette un type de piste inconnu', () => {
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core'), alert('B', 'bizarre' as AlertKind), alert('C', 'exploratory')],
    }))).toThrow(/type inconnu/);
  });

  test('rejette une piste trop peu définie', () => {
    const maigre = alert('Maigre', 'adjacent');
    maigre.searchProfile.jobTitles = ['unique'];
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core'), maigre, alert('C', 'exploratory')],
    }))).toThrow(/au moins 2 intitulés/);

    const sansExclusions = alert('Sans', 'adjacent');
    sansExclusions.searchProfile.excludeTitles = ['stage'];
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core'), sansExclusions, alert('C', 'exploratory')],
    }))).toThrow(/au moins 3 exclusions/);
  });

  test('rejette une source inconnue en la nommant', () => {
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core', { sources: ['monster'] }), alert('B', 'adjacent'), alert('C', 'exploratory')],
    }))).toThrow(/source inconnue « monster »/);
  });

  test('rejette un filtre IA non conforme', () => {
    expect(() => validateAlertPortfolio(portfolio({
      alerts: [
        alert('A', 'core', { aiFilter: { version: '0.1', name: 'x' } }),
        alert('B', 'adjacent'),
        alert('C', 'exploratory'),
      ],
    }))).toThrow(/filtre IA invalide/);
  });
});

describe('validateAlertPortfolio — avertissements', () => {
  test('signale un recouvrement d\'intitulés sans rejeter', () => {
    const jumeau = alert('Jumeau', 'adjacent');
    jumeau.searchProfile.jobTitles = ['Cœur A', 'Cœur B'];
    const { warnings } = validateAlertPortfolio(portfolio({
      alerts: [alert('Cœur', 'core'), jumeau, alert('Ouverture', 'exploratory')],
    }));
    expect(warnings.some(w => w.includes('partagent 2 intitulés'))).toBe(true);
  });

  test('signale une piste sans source', () => {
    const { warnings } = validateAlertPortfolio(portfolio({
      alerts: [alert('A', 'core', { sources: [] }), alert('B', 'adjacent'), alert('C', 'exploratory')],
    }));
    expect(warnings.some(w => w.includes('aucune source'))).toBe(true);
  });

  test('signale un portefeuille sans angle mort déclaré', () => {
    const { warnings } = validateAlertPortfolio(portfolio({ blindSpots: [] }));
    expect(warnings.some(w => w.includes('aucun angle mort'))).toBe(true);
  });
});

describe('extractJson', () => {
  test('accepte une réponse encadrée par un bloc Markdown', () => {
    expect(extractJson('Voici :\n```json\n{"a":1}\n```\nVoilà.')).toEqual({ a: 1 });
  });

  test('accepte un JSON nu', () => {
    expect(extractJson('  {"a":2}  ')).toEqual({ a: 2 });
  });
});

describe('buildPortfolioImportPreview', () => {
  const { portfolio: parsed } = validateAlertPortfolio(portfolio());

  test('sans portefeuille existant, tout est création', () => {
    const preview = buildPortfolioImportPreview(parsed, []);
    expect(preview.creations).toHaveLength(3);
    expect(preview.replacements).toHaveLength(0);
  });

  test('une piste de même nom est remplacée, pas dupliquée', () => {
    const preview = buildPortfolioImportPreview(parsed, [{ id: 'x', name: 'cœur' }]);
    expect(preview.replacements).toHaveLength(1);
    expect(preview.replacements[0].existingAlertId).toBe('x');
    expect(preview.creations).toHaveLength(2);
  });

  test('avertit si le portefeuille final dépasse la limite', () => {
    const existing = [
      { id: '1', name: 'Autre 1' },
      { id: '2', name: 'Autre 2' },
    ];
    const preview = buildPortfolioImportPreview(parsed, existing);
    expect(preview.warnings.some(w => w.includes('au-delà de la limite'))).toBe(true);
  });
});

describe('toSearchProfile', () => {
  test('complète les champs absents avec les valeurs par défaut', () => {
    const { portfolio: parsed } = validateAlertPortfolio(portfolio());
    const profile = toSearchProfile(parsed.alerts[0]);
    expect(profile.name).toBe('Cœur');
    expect(profile.jobTitles).toEqual(['Cœur A', 'Cœur B']);
    expect(profile.location.inseeCode).toBe('');
    expect(profile.apecFonctions).toEqual(DEFAULT_SEARCH_PROFILE.apecFonctions);
  });
});

describe('buildPortfolioStrategyPrompt', () => {
  const input = {
    profileTitle: 'Responsable recrutement',
    skills: ['ATS', 'sourcing'],
    experiences: [{ title: 'Recruteur', company: 'Acme' }],
    education: ['Master RH'],
    intent: 'Je veux ouvrir vers la tech',
    constraints: {
      locationLabel: 'Paris (75)', radiusKm: 30, mobility: 'Île-de-France',
      contractTypes: ['CDI'], salaryMin: 40000, salaryTarget: 50000,
    },
    currentPortfolio: [],
  };

  test('embarque le profil, l\'intention et les contraintes', () => {
    const prompt = buildPortfolioStrategyPrompt(input);
    expect(prompt).toContain('Responsable recrutement');
    expect(prompt).toContain('Je veux ouvrir vers la tech');
    expect(prompt).toContain('Paris (75)');
    expect(prompt).toContain('40000');
  });

  test('impose les contraintes de non-recouvrement', () => {
    const prompt = buildPortfolioStrategyPrompt(input);
    expect(prompt).toContain("ne partagent pas plus d'UN terme");
    expect(prompt).toContain('exactement une');
    expect(prompt).toContain('blindSpots');
  });

  test('n\'expose que les sources réellement supportées', () => {
    const prompt = buildPortfolioStrategyPrompt(input);
    expect(prompt).toContain('"apec"');
    expect(prompt).toContain('"emploi_territorial"');
    expect(prompt).not.toContain('"monster"');
  });

  test('rappelle le portefeuille existant pour qu\'il soit ajusté, pas refait', () => {
    const prompt = buildPortfolioStrategyPrompt({
      ...input,
      currentPortfolio: [{ name: 'Piste RH', kind: 'core', jobTitles: ['Recruteur'] }],
    });
    expect(prompt).toContain('Piste RH');
    expect(prompt).not.toContain('portefeuille à créer de zéro');
  });
});

describe('buildPortfolioReviewPrompt', () => {
  const alerts = [{
    name: 'Piste RH',
    kind: 'core' as AlertKind,
    searchProfile: { ...DEFAULT_SEARCH_PROFILE, jobTitles: ['Recruteur'] },
    sources: ['apec' as const],
  }];
  const metrics = {
    windowDays: 30,
    perAlert: [{
      alertId: 'a', name: 'Piste RH', total: 40, exclusive: 12,
      readRate: 20, kanbanRate: 0, quickArchiveRate: 55, medianScore: 38,
    }],
    overlaps: [],
  };

  test('embarque les définitions et les métriques calculées', () => {
    const prompt = buildPortfolioReviewPrompt(alerts, metrics);
    expect(prompt).toContain('Piste RH');
    expect(prompt).toContain('40 offres (12 exclusives)');
    expect(prompt).toContain('archivées sans lecture 55 %');
    expect(prompt).toContain('aucun recouvrement mesurable');
  });

  test('protège explicitement la piste d\'ouverture', () => {
    const prompt = buildPortfolioReviewPrompt(alerts, metrics);
    expect(prompt).toContain("Une piste d'ouverture a le droit d'avoir un taux de conversion faible");
  });
});

describe('validatePortfolioReview', () => {
  const review = {
    version: AI_REVIEW_SCHEMA_VERSION,
    overlaps: [{ alertA: 'A', alertB: 'B', sharedPercent: 70, recommendation: 'Différencier B' }],
    perAlert: [{ alertName: 'A', verdict: 'tune', why: 'trop large', suggestedChanges: { addExcludeTitles: ['stage'], addSources: ['wttj'] } }],
    blindSpots: [{ label: 'Secteur public', why: 'non couvert' }],
  };

  test('accepte une revue conforme', () => {
    const parsed = validatePortfolioReview(review);
    expect(parsed.perAlert[0].verdict).toBe('tune');
    expect(parsed.perAlert[0].suggestedChanges?.addSources).toEqual(['wttj']);
    expect(parsed.blindSpots).toHaveLength(1);
  });

  test('rejette un verdict inconnu', () => {
    expect(() => validatePortfolioReview({
      ...review,
      perAlert: [{ alertName: 'A', verdict: 'supprimer-tout' }],
    })).toThrow(/verdict inconnu/);
  });

  test('ignore une source suggérée qui n\'existe pas', () => {
    const parsed = validatePortfolioReview({
      ...review,
      perAlert: [{ alertName: 'A', verdict: 'tune', suggestedChanges: { addSources: ['monster', 'wttj'] } }],
    });
    expect(parsed.perAlert[0].suggestedChanges?.addSources).toEqual(['wttj']);
  });

  test('rejette une version inconnue', () => {
    expect(() => validatePortfolioReview({ ...review, version: '2.0' })).toThrow(/Version de schéma inconnue/);
  });
});
