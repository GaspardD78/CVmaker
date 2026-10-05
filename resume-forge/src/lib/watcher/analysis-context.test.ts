import { describe, expect, test } from 'bun:test';
import {
  apecSalaryBand, buildCandidateInput, buildWatchAnalysisContext, computeExperienceYears,
  type WatchAnalysisInput, type WatchAnalysisOfferInput,
} from './analysis-context';
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';
import type { MasterEntry } from '@/types/profile';

const NOW = new Date('2026-06-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function sp(over: Partial<SearchProfile> = {}): SearchProfile {
  return { ...DEFAULT_SEARCH_PROFILE, contractTypes: [], ...over };
}

let seq = 0;
function offer(over: Partial<WatchAnalysisOfferInput> = {}): WatchAnalysisOfferInput {
  seq += 1;
  return {
    id: `o${seq}`, source: 'apec', title: `Responsable cybersécurité ${seq}`, company: `Société ${seq}`,
    location: 'Paris', contractType: 'CDI', salaryMin: null, salaryMax: null, salaryRaw: null,
    publishedAt: daysAgo(2), fetchedAt: daysAgo(2), storedScore: 50, snippet: 'Description du poste.',
    isRead: false, kanban: false, actions: [], ...over,
  };
}

function input(over: Partial<WatchAnalysisInput> = {}): WatchAnalysisInput {
  return {
    now: NOW,
    alert: {
      id: 'a1', name: 'Cœur', searchProfile: sp({ jobTitles: ['Responsable cybersécurité', 'RSSI'] }),
      learnedDict: { positive: {}, negative: {} },
    },
    otherAlerts: [],
    candidate: { title: 'RSSI', mainSkills: ['ISO 27001'], city: 'Paris', experienceYears: 12 },
    offers: [],
    ...over,
  };
}

describe('métriques et période (défauts 4, 13)', () => {
  test('nombre réel d\'offres, dénominateurs et période', () => {
    const offers = [
      ...Array.from({ length: 10 }, () => offer({ isRead: true })),
      ...Array.from({ length: 6 }, () => offer()),
      offer({ kanban: true, isRead: true }),
      offer({ fetchedAt: daysAgo(90), publishedAt: daysAgo(90) }), // hors période
    ];
    const ctx = buildWatchAnalysisContext(input({ offers }));
    expect(ctx.metrics.offers).toBe(17);
    expect(ctx.offers.total).toBe(17);
    expect(ctx.offers.shown).toBe(17);
    expect(ctx.metrics.periodDays).toBe(30);
    expect(ctx.metrics.pertinence).toEqual({ numerator: 11, denominator: 17, percent: 65 });
    expect(ctx.metrics.conversion).toEqual({ numerator: 1, denominator: 17, percent: 6 });
  });

  test('30 offres au plus dans le prompt, total conservé', () => {
    const ctx = buildWatchAnalysisContext(input({ offers: Array.from({ length: 45 }, () => offer()) }));
    expect(ctx.offers.shown).toBe(30);
    expect(ctx.offers.total).toBe(45);
  });
});

describe('dédoublonnage (défaut 5)', () => {
  test('même offre à plusieurs feedbacks, et doublons sans entreprise : actions fusionnées', () => {
    const a = offer({ id: 'x', company: null, title: 'RSSI', location: 'Lyon', actions: ['thumbs_up'] });
    const aBis = offer({ id: 'x', company: null, title: 'RSSI', location: 'Lyon', actions: ['kanban_import'] });
    const repost = offer({ id: 'y', company: null, title: 'rssi', location: 'LYON', fetchedAt: daysAgo(3) });
    const ctx = buildWatchAnalysisContext(input({ offers: [a, aBis, repost, offer(), offer()] }));
    expect(ctx.metrics.offers).toBe(3);
    const rssi = ctx.offers.items.find(o => o.title === 'RSSI')!;
    expect(rssi.action).toBe('importée dans le Kanban');
  });
});

describe('zéro action (défaut 7)', () => {
  test('aucune offre triée : zeroAction vrai', () => {
    const ctx = buildWatchAnalysisContext(input({ offers: [offer(), offer({ isRead: true })] }));
    expect(ctx.metrics.zeroAction).toBe(true);
    expect(ctx.metrics.untreated).toBe(2);
  });
  test('une offre triée : faux', () => {
    const ctx = buildWatchAnalysisContext(input({ offers: [offer(), offer({ actions: ['thumbs_down'] })] }));
    expect(ctx.metrics.zeroAction).toBe(false);
    expect(ctx.metrics.rejected).toBe(1);
  });
});

describe('décomposition du score (défaut 3)', () => {
  test('score entier recalculé et décomposition titre/mots-clés/domaine/salaire/ancienneté', () => {
    const profile = sp({ jobTitles: ['RSSI'], skills: ['ISO'], salary: { min: 60000, target: null } });
    const o = offer({ title: 'RSSI ISO', salaryMin: 45000, publishedAt: daysAgo(4), storedScore: 45.575 });
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: profile, learnedDict: { positive: {}, negative: {} } },
      offers: [o],
    }));
    const item = ctx.offers.items[0];
    expect(Number.isInteger(item.score)).toBe(true);
    const labels = item.breakdown.map(b => b.label);
    expect(labels).toEqual(['Titre', 'Mots-clés', 'Domaine', 'Salaire', 'Ancienneté']);
    expect(item.breakdown.find(b => b.label === 'Salaire')!.points).toBe(-30);
    expect(item.breakdown.find(b => b.label === 'Ancienneté')!.points).toBe(-8);
    expect(item.breakdown[0]).toEqual({ label: 'Titre', points: 40 }); // titre « high » rejoué
    expect(item.score).toBe(8); // 40 + 6 - 30 - 8
    expect(item.storedScore).toBe(46);
  });
  test('offre écartée par une exclusion : raison indiquée', () => {
    const profile = sp({ jobTitles: ['RSSI'], excludeTitles: ['stage'] });
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: profile, learnedDict: { positive: {}, negative: {} } },
      offers: [offer({ title: 'Stage RSSI' })],
    }));
    expect(ctx.offers.items[0].disqualified).toContain('stage');
    expect(ctx.metrics.scoreDistribution.disqualified).toBe(1);
  });
});

describe('enrichissement des offres (défaut 6)', () => {
  test('entreprise, lieu, source, contrat, salaire, télétravail, âge, extrait de 200 caractères', () => {
    const o = offer({
      company: 'ACME', location: 'Lyon', source: 'wttj', contractType: 'CDI',
      salaryMin: 55000, salaryMax: 65000, publishedAt: daysAgo(5),
      snippet: `Télétravail partiel possible. ${'x'.repeat(400)}`,
    });
    const item = buildWatchAnalysisContext(input({ offers: [o] })).offers.items[0];
    expect(item).toMatchObject({
      company: 'ACME', location: 'Lyon', source: 'wttj', contract: 'CDI',
      salary: '55000-65000 €/an', remote: 'partiel', ageDays: 5,
    });
    expect(item.excerpt.length).toBe(200);
  });
});

describe('pistes quasi identiques (défaut 9)', () => {
  test('Jaccard > 0,6 : drapeau', () => {
    const ctx = buildWatchAnalysisContext(input({
      otherAlerts: [
        { id: 'b', name: 'Doublon', searchProfile: sp({ jobTitles: ['RSSI', 'responsable cybersécurité'] }) },
        { id: 'c', name: 'Autre', searchProfile: sp({ jobTitles: ['DPO'] }) },
      ],
    }));
    expect(ctx.portfolio.nearIdentical.map(o => o.name)).toEqual(['Doublon']);
    expect(ctx.portfolio.others.find(o => o.name === 'Autre')!.overlap).toBe(0);
  });
});

describe('incohérences (défauts 8, 10)', () => {
  const codes = (c: ReturnType<typeof buildWatchAnalysisContext>) => c.inconsistencies.map(i => i.code);

  test('salaire cible hors tranche APEC (50 k€ vs 40-50 k€)', () => {
    const profile = sp({ jobTitles: ['RSSI'], salary: { min: null, target: 50000 }, apecSalaires: ['40-50k€'] });
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: profile, learnedDict: { positive: {}, negative: {} } },
    }));
    expect(codes(ctx)).toContain('salary_outside_apec_band');
  });
  test('salaire cible dans la tranche : pas d\'alerte', () => {
    const profile = sp({ jobTitles: ['RSSI'], salary: { min: null, target: 45000 }, apecSalaires: ['40-50k€'] });
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: profile, learnedDict: { positive: {}, negative: {} } },
    }));
    expect(codes(ctx)).not.toContain('salary_outside_apec_band');
  });
  test('terme appris rejeté présent dans les intitulés (« cybersécurité »)', () => {
    const ctx = buildWatchAnalysisContext(input({
      alert: {
        id: 'a', name: 'x', searchProfile: sp({ jobTitles: ['Responsable cybersécurité'] }),
        learnedDict: { positive: {}, negative: { 'cybersécurité': 7, btp: 5 } },
      },
    }));
    expect(codes(ctx)).toContain('learned_conflicts_profile');
    const signal = ctx.learned.signals.find(s => s.term === 'cybersécurité')!;
    expect(signal).toMatchObject({ sense: 'negative', count: 7, conflict: true });
    expect(ctx.learned.fromTitlesOnly).toBe(true);
  });
  test('exclusion « responsable » vs fonction APEC « Responsable recrutement »', () => {
    const ctx = buildWatchAnalysisContext(input({
      alert: {
        id: 'a', name: 'x',
        searchProfile: sp({ jobTitles: ['RRH'], excludeTitles: ['responsable'], apecFonctions: ['Responsable recrutement'] }),
        learnedDict: { positive: {}, negative: {} },
      },
    }));
    expect(codes(ctx)).toContain('exclusion_overlaps_profile');
  });
  test('exclusion présente dans > 30 % des offres importées (description seulement : info)', () => {
    const profile = sp({ jobTitles: ['RSSI'], excludeTitles: ['ingénieur'] });
    const offers = [
      offer({ title: 'RSSI', kanban: true, snippet: 'Vous managez des ingénieur(s)... ingénieur réseau' }),
      offer({ title: 'RSSI Groupe', kanban: true, snippet: 'ingénieur sécurité' }),
      offer({ title: 'RSSI Adjoint', kanban: true, snippet: 'équipe sécurité' }),
    ];
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: profile, learnedDict: { positive: {}, negative: {} } }, offers,
    }));
    const flag = ctx.inconsistencies.find(i => i.code === 'exclusion_hits_wanted_offers')!;
    expect(flag.severity).toBe('info');
    expect(flag.message).toContain('2 des 3');
  });
  test('piste vide', () => {
    const ctx = buildWatchAnalysisContext(input({
      alert: { id: 'a', name: 'x', searchProfile: sp(), learnedDict: { positive: {}, negative: {} } },
    }));
    expect(codes(ctx)).toEqual(['empty_track']);
    expect(ctx.track.isEmpty).toBe(true);
  });
});

describe('règles du moteur générées (défaut 1)', () => {
  test('issues des constantes et mentionnent le veto titre OU description', () => {
    const rules = buildWatchAnalysisContext(input()).engineRules.join('\n');
    expect(rules).toContain('titre OU sa description');
    expect(rules).toContain('+40');
    expect(rules).toContain('-30');
    expect(rules).toContain('-2 points par jour');
  });
});

describe('profil candidat (défaut 11)', () => {
  const exp = (start: string, end: string | null): MasterEntry => ({
    id: start, profileId: 'p', entryType: 'experience', title: 't', subtitle: null, location: null,
    startDate: start, endDate: end, isCurrent: end === null, description: null, metadata: {},
    sortOrder: 0, tags: [], createdAt: '', updatedAt: '',
  });
  test('années d\'expérience sans double compte des chevauchements', () => {
    const years = computeExperienceYears([exp('2010-01', '2015-01'), exp('2013-01', '2018-01'), exp('2020-01', null)], NOW);
    expect(years).toBe(14); // 2010→2018 (8) + 2020-01→2026-06 (≈6,4)
  });
  test('aucune expérience : null', () => {
    expect(computeExperienceYears([], NOW)).toBeNull();
    expect(buildCandidateInput(null, [], NOW)).toEqual({ title: null, city: null, mainSkills: [], experienceYears: null });
  });
});

describe('tranches APEC', () => {
  test('bornes', () => {
    expect(apecSalaryBand('Moins de 40k€')).toEqual({ min: 0, max: 40000 });
    expect(apecSalaryBand('40-50k€')).toEqual({ min: 40000, max: 50000 });
    expect(apecSalaryBand('70k€ et plus')).toEqual({ min: 70000, max: Infinity });
    expect(apecSalaryBand('inconnu')).toBeNull();
  });
});
