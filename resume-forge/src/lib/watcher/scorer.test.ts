/**
 * scorer.test.ts — Tests unitaires du scorer field-aware v3
 *
 * Runner : bun test
 * Cas obligatoires (FR-023, SC-003 à SC-005, SC-009) :
 *   1. Terme exclu (titre ou description) → score = 0
 *   2. Mode balanced, aucun match jobTitle → score ≤ 25
 *   3. jobTitle exact dans titre, high confidence → titleMatchScore ≥ 40
 *   4. jobTitles vide → score de base ≥ 50
 */

import { describe, expect, test } from 'bun:test';
import { computeScore, computeScoreWithBreakdown, SCORING_WEIGHTS } from './scorer';
import type { SearchProfile } from '@/types/job-watch';
import { DEFAULT_EXTRACTION } from '@/types/job-watch';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    name: 'Test',
    jobTitles: [],
    skills: [],
    domains: [],
    excludeTitles: [],
    excludeDomains: [],
    location: { label: '', city: '', inseeCode: '', departmentCodes: [], radiusKm: 30 },
    contractTypes: [],
    salary: { min: null, target: null },
    scoring: { mode: 'balanced' },
    blacklistedCompanies: [],
    apecFonctions: [],
    ...overrides,
  };
}

function makeOffer(overrides: {
  title?: string;
  descriptionSnippet?: string;
  titleConfidence?: 'high' | 'medium' | 'low';
  contractType?: string;
  publishedAt?: string;
} = {}) {
  return {
    title: overrides.title ?? 'Offre générique',
    descriptionSnippet: overrides.descriptionSnippet ?? null,
    publishedAt: overrides.publishedAt ?? null,
    company: null,
    salaryMin: null,
    salaryMax: null,
    contractType: overrides.contractType ?? null,
    extraction: {
      ...DEFAULT_EXTRACTION,
      titleConfidence: overrides.titleConfidence ?? 'medium',
      ...(overrides.contractType
        ? { contractSource: 'regex' as const, contractConfidence: 'low' as const }
        : {}),
    },
  };
}

// ── Cas 1 : terme exclu → score = 0 ──────────────────────────────────────────

describe('Cas 1 — Terme exclu', () => {
  test('terme exclu dans le titre → score = 0', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      excludeTitles: ['stagiaire'],
    });
    const offer = makeOffer({ title: 'Recruteur stagiaire CDI Paris' });
    expect(computeScore(offer, profile)).toBe(0);
  });

  test('excludeTitles : un terme présent seulement dans la description ne tue plus l\'offre (portée title)', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      excludeTitles: ['stage'],
    });
    const offer = makeOffer({
      title: 'Recruteur Senior',
      descriptionSnippet: 'Poste de stage en recrutement pour 6 mois.',
    });
    expect(computeScore(offer, profile)).toBeGreaterThan(0);
  });

  test('excludeTitles avec portée « anywhere » explicite : veto sur la description', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      excludeTitles: ['stage'],
      excludeScopes: { stage: 'anywhere' },
    });
    const offer = makeOffer({
      title: 'Recruteur Senior',
      descriptionSnippet: 'Poste de stage en recrutement pour 6 mois.',
    });
    expect(computeScore(offer, profile)).toBe(0);
  });

  test('excludeDomains garde le veto sur la description (aucun changement de score)', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      excludeDomains: ['BTP'],
    });
    const offer = makeOffer({
      title: 'Recruteur Senior',
      descriptionSnippet: 'Au sein d\'un groupe du BTP.',
    });
    expect(computeScore(offer, profile)).toBe(0);
  });

  test('terme exclu dans excludeDomains → score = 0', () => {
    const profile = makeProfile({
      jobTitles: ['Développeur'],
      excludeDomains: ['BTP'],
    });
    const offer = makeOffer({
      title: 'Développeur logiciel',
      descriptionSnippet: 'Société spécialisée dans le secteur BTP.',
    });
    expect(computeScore(offer, profile)).toBe(0);
  });

  test('aucun terme exclu → score > 0', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      excludeTitles: ['stagiaire'],
    });
    const offer = makeOffer({ title: 'Recruteur Senior CDI', titleConfidence: 'high' });
    expect(computeScore(offer, profile)).toBeGreaterThan(0);
  });
});

// ── Cas 2 : mode balanced, aucun match jobTitle → score ≤ 25 ─────────────────

describe('Cas 2 — Balanced no title match → cap à 25', () => {
  test('offre sans match jobTitle en balanced → score ≤ 25', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      skills: ['Excel', 'Word', 'PowerPoint', 'Outlook'],
      scoring: { mode: 'balanced' },
    });
    const offer = makeOffer({
      title: 'Commercial BtoB CDI Paris',
      descriptionSnippet: 'Excel Word PowerPoint Outlook requis.',
    });
    expect(computeScore(offer, profile)).toBeLessThanOrEqual(25);
  });

  test('cap à 25 s\'applique même avec de nombreux skills matchés', () => {
    const profile = makeProfile({
      jobTitles: ['Chef de Projet'],
      skills: ['Jira', 'Confluence', 'Agile', 'Scrum', 'Excel'],
      scoring: { mode: 'balanced' },
    });
    // Tous les skills présents mais aucun jobTitle match
    const offer = makeOffer({
      title: 'Coordinateur Jira Confluence Agile Scrum Excel',
      descriptionSnippet: 'Gestion Jira Confluence Agile Scrum Excel.',
    });
    expect(computeScore(offer, profile)).toBeLessThanOrEqual(25);
  });

  test('mode strict, aucun match jobTitle → score = 0 (disqualifié)', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      scoring: { mode: 'strict' },
    });
    const offer = makeOffer({ title: 'Commercial BtoB' });
    const result = computeScoreWithBreakdown(offer, profile);
    expect(result.total).toBe(0);
    expect(result.disqualified).toBe(true);
  });
});

// ── Cas 3 : jobTitle exact dans titre, high confidence → titleMatchScore ≥ 40 ─

describe('Cas 3 — JobTitle match high confidence', () => {
  test('match exact haute confiance → titleMatchScore = 40', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'] });
    const offer = makeOffer({ title: 'Recruteur Senior CDI Paris', titleConfidence: 'high' });
    const { titleMatchScore } = computeScoreWithBreakdown(offer, profile);
    expect(titleMatchScore).toBeGreaterThanOrEqual(40);
  });

  test('match exact confidence medium/low → titleMatchScore = 30', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'] });
    const offer = makeOffer({ title: 'Recruteur Talent', titleConfidence: 'medium' });
    const { titleMatchScore } = computeScoreWithBreakdown(offer, profile);
    expect(titleMatchScore).toBe(30);
  });

  test('match en description uniquement → titleMatchScore = 15', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'] });
    const offer = makeOffer({
      title: 'Chargé RH',
      descriptionSnippet: 'Poste de Recruteur au sein d\'une équipe RH.',
    });
    const { titleMatchScore } = computeScoreWithBreakdown(offer, profile);
    expect(titleMatchScore).toBe(15);
  });

  test('score final ≥ 40 avec match titre high confidence', () => {
    const profile = makeProfile({ jobTitles: ['Développeur React'] });
    const offer = makeOffer({
      title: 'Développeur React Senior',
      titleConfidence: 'high',
    });
    expect(computeScore(offer, profile)).toBeGreaterThanOrEqual(40);
  });
});

// ── Cas 4 : jobTitles vide → base = 50 ───────────────────────────────────────

describe('Cas 4 — jobTitles vide → base 50', () => {
  test('profil sans jobTitles → score ≥ 50', () => {
    const profile = makeProfile({ jobTitles: [] });
    const offer = makeOffer({ title: 'N\'importe quelle offre CDI' });
    expect(computeScore(offer, profile)).toBeGreaterThanOrEqual(50);
  });

  test('profil sans jobTitles → baseScore = 50 dans le breakdown', () => {
    const profile = makeProfile({ jobTitles: [] });
    const offer = makeOffer({ title: 'Offre quelconque' });
    const { baseScore } = computeScoreWithBreakdown(offer, profile);
    expect(baseScore).toBe(50);
  });

  test('profil sans jobTitles, pas de cap à 25 (pas de pénalité balanced)', () => {
    const profile = makeProfile({
      jobTitles: [],
      scoring: { mode: 'balanced' },
      skills: ['Excel'],
    });
    const offer = makeOffer({
      title: 'Offre Excel',
      descriptionSnippet: 'Excel requis.',
    });
    // base 50 + skills = well above 25
    expect(computeScore(offer, profile)).toBeGreaterThan(25);
  });

  test('profil avec jobTitles → baseScore = 0', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'] });
    const offer = makeOffer({ title: 'Recruteur', titleConfidence: 'high' });
    const { baseScore } = computeScoreWithBreakdown(offer, profile);
    expect(baseScore).toBe(0);
  });
});

// ── Tests supplémentaires — vérifications de non-régression ──────────────────

describe('Non-régression', () => {
  test('entreprise blacklistée → score = 0', () => {
    const profile = makeProfile({ blacklistedCompanies: ['Acme Corp'] });
    const offer = { ...makeOffer({ title: 'Développeur' }), company: 'Acme Corp' };
    expect(computeScore(offer, profile)).toBe(0);
  });

  test('skills titre +6, max +24', () => {
    const profile = makeProfile({
      jobTitles: ['Dev'],
      skills: ['React', 'TypeScript', 'Node', 'GraphQL', 'Jest'],
    });
    // 4 skills dans le titre = 4×6 = 24 (exactement au plafond)
    const offer = makeOffer({
      title: 'Dev React TypeScript Node GraphQL',
      titleConfidence: 'high',
    });
    const { skillsScore } = computeScoreWithBreakdown(offer, profile);
    expect(skillsScore).toBeLessThanOrEqual(24);
  });

  test('contrat mauvais en balanced → -15 (pas -20)', () => {
    const profile = makeProfile({
      jobTitles: ['Recruteur'],
      contractTypes: ['CDI'],
      scoring: { mode: 'balanced' },
    });
    const offer = makeOffer({
      title: 'Recruteur',
      titleConfidence: 'high',
      contractType: 'Stage',
    });
    const { contractMatchScore } = computeScoreWithBreakdown(offer, profile);
    expect(contractMatchScore).toBe(-15);
  });

  test('score final clampé entre 0 et 100', () => {
    // Profil très permissif avec de nombreux bonus → ne dépasse pas 100
    const profile = makeProfile({
      jobTitles: [],
      skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      contractTypes: ['CDI'],
    });
    const offer = makeOffer({
      title: 'A B C D E F G H I J',
      contractType: 'CDI',
    });
    const score = computeScore(offer, profile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── Spec 005 : domaines obligatoires, portée, poids exportés ────────────────

describe('requiredDomains (optionnel)', () => {
  const base = { jobTitles: ['Recruteur'] };
  test('vide par défaut : aucun effet', () => {
    const a = computeScoreWithBreakdown(makeOffer({ title: 'Recruteur' }), makeProfile(base));
    expect(a.requiredDomainMissing).toBe(false);
    expect(a.capApplied).toBe(false);
  });
  test('absent du titre et de la description : plafonné à 25 (balanced)', () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Recruteur', titleConfidence: 'high' }),
      makeProfile({ ...base, requiredDomains: ['cybersécurité'] }),
    );
    expect(r.requiredDomainMissing).toBe(true);
    expect(r.total).toBeLessThanOrEqual(25);
  });
  test('présent dans la description : pas de plafond', () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Recruteur', titleConfidence: 'high', descriptionSnippet: 'Équipe cybersécurité' }),
      makeProfile({ ...base, requiredDomains: ['cybersécurité'] }),
    );
    expect(r.requiredDomainMissing).toBe(false);
    expect(r.total).toBeGreaterThanOrEqual(40);
  });
  test('mode strict : domaine obligatoire absent → 0', () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Recruteur' }),
      makeProfile({ ...base, scoring: { mode: 'strict' }, requiredDomains: ['cybersécurité'] }),
    );
    expect(r.total).toBe(0);
    expect(r.disqualified).toBe(true);
  });
});

describe('SCORING_WEIGHTS', () => {
  test('les poids exportés pilotent le score', () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Recruteur', titleConfidence: 'high' }),
      makeProfile({ jobTitles: ['Recruteur'] }),
    );
    expect(r.titleMatchScore).toBe(SCORING_WEIGHTS.titleHigh);
  });
});

describe('bornes de mot Unicode', () => {
  test('un terme finissant par une lettre accentuée est reconnu', () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Responsable cybersécurité', titleConfidence: 'high' }),
      makeProfile({ jobTitles: ['cybersécurité'] }),
    );
    expect(r.titleMatchScore).toBe(SCORING_WEIGHTS.titleHigh);
  });
  test("pas de faux positif au milieu d'un mot", () => {
    const r = computeScoreWithBreakdown(
      makeOffer({ title: 'Sécuritéxyz' }),
      makeProfile({ jobTitles: ['sécurité'] }),
    );
    expect(r.titleMatchScore).toBe(0);
  });
});

describe('migration de la portée des exclusions (spec 005)', () => {
  // Référence : l'ancien comportement (veto sur titre + description pour les deux listes).
  const legacyVetoes = (terms: string[], offer: ReturnType<typeof makeOffer>): boolean => {
    const text = `${offer.title} ${offer.descriptionSnippet ?? ''}`.toLowerCase();
    return terms.some(t => new RegExp(`(?<![\\p{L}\\p{N}])${t.toLowerCase()}(?![\\p{L}\\p{N}])`, 'u').test(text));
  };
  const offers = [
    makeOffer({ title: 'Recruteur BTP' }),
    makeOffer({ title: 'Recruteur', descriptionSnippet: 'Au sein du BTP et de la restauration.' }),
    makeOffer({ title: 'Recruteur IT', descriptionSnippet: 'Équipe tech.' }),
    makeOffer({ title: 'Recruteur Restauration' }),
  ];

  test('excludeDomains : le score est inchangé (veto titre OU description conservé)', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'], excludeDomains: ['BTP', 'Restauration'] });
    for (const offer of offers) {
      const vetoed = legacyVetoes(['BTP', 'Restauration'], offer);
      expect(computeScore(offer, profile) === 0).toBe(vetoed);
    }
  });

  test('excludeTitles : seule la portée change (la description ne veto plus, le titre oui)', () => {
    const profile = makeProfile({ jobTitles: ['Recruteur'], excludeTitles: ['BTP'] });
    expect(computeScore(offers[0], profile)).toBe(0);
    expect(computeScore(offers[1], profile)).toBeGreaterThan(0);
  });

  test('un profil déjà stocké (sans excludeScopes ni requiredDomains) se lit sans erreur', () => {
    const stored = JSON.parse(JSON.stringify(makeProfile({ jobTitles: ['Recruteur'], excludeTitles: ['stage'] })));
    expect(stored.excludeScopes).toBeUndefined();
    expect(computeScore(makeOffer({ title: 'Recruteur' }), stored)).toBeGreaterThan(0);
  });
});

describe('correspondance des intitulés (logique partagée avec CSP)', () => {
  const profile = makeProfile({ jobTitles: ['Talent Acquisition Partner'] });
  const offer = (title: string) => ({
    title, company: 'ACME', url: 'https://x', source: 'wttj' as const,
    description: '', extraction: DEFAULT_EXTRACTION,
  });

  test('« Talent Acquisition Business Partner » reconnu', () => {
    const r = computeScoreWithBreakdown(offer('Talent Acquisition Business Partner') as never, profile);
    expect(r.titleMatchScore).toBeGreaterThan(0);
  });

  test('« Talent Manager Logistique » : faux positif écarté', () => {
    const r = computeScoreWithBreakdown(offer('Talent Manager Logistique') as never, profile);
    expect(r.titleMatchScore).toBe(0);
  });
});
