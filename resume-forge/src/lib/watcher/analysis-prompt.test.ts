import { describe, expect, test } from 'bun:test';
import { buildWatchAnalysisContext, type WatchAnalysisInput, type WatchAnalysisOfferInput } from './analysis-context';
import { generateWatchAnalysisPrompt, WATCH_ANALYSIS_SCHEMA } from './analysis-prompt';
import { SCORING_WEIGHTS as W } from './scorer';
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';

const NOW = new Date('2026-06-15T12:00:00Z');
let seq = 0;
const sp = (over: Partial<SearchProfile> = {}): SearchProfile => ({ ...DEFAULT_SEARCH_PROFILE, contractTypes: [], ...over });
const offer = (over: Partial<WatchAnalysisOfferInput> = {}): WatchAnalysisOfferInput => {
  seq += 1;
  return {
    id: `o${seq}`, source: 'apec', title: `Responsable cybersécurité ${seq}`, company: `Soc ${seq}`, location: 'Paris',
    contractType: 'CDI', salaryMin: null, salaryMax: null, salaryRaw: null, publishedAt: NOW.toISOString(),
    fetchedAt: NOW.toISOString(), storedScore: 50, snippet: 'Poste de RSSI.', isRead: false, kanban: false, actions: [], ...over,
  };
};
const input = (over: Partial<WatchAnalysisInput> = {}): WatchAnalysisInput => ({
  now: NOW,
  alert: { id: 'a', name: 'Cœur', searchProfile: sp({ jobTitles: ['RSSI'], skills: ['ISO 27001'], domains: ['banque'] }), learnedDict: { positive: {}, negative: {} } },
  otherAlerts: [], candidate: { title: 'RSSI', mainSkills: ['ISO 27001'], city: 'Paris', experienceYears: 12 },
  offers: [offer()], ...over,
});
const prompt = (over: Partial<WatchAnalysisInput> = {}, mode: 'performance' | 'diagnostic' = 'diagnostic') =>
  generateWatchAnalysisPrompt(buildWatchAnalysisContext(input(over)), mode);

describe('prompt unifié', () => {
  test('libellés identiques dans les deux modes', () => {
    for (const mode of ['performance', 'diagnostic'] as const) {
      const p = prompt({}, mode);
      for (const label of ['Intitulés visés', 'Exclusions (portée)', 'Mots-clés bonus', 'Domaines bonus', 'Domaines obligatoires']) {
        expect(p).toContain(label);
      }
      expect(p).not.toContain('Domaine requis');
      expect(p).not.toContain('Domaine préféré');
    }
  });
  test('seule la mission diffère entre les modes', () => {
    const ctx = buildWatchAnalysisContext(input());
    const strip = (p: string) => p.replace(/## Ta mission[\s\S]*?\nDistingue/, 'Distingue');
    expect(strip(generateWatchAnalysisPrompt(ctx, 'performance'))).toBe(strip(generateWatchAnalysisPrompt(ctx, 'diagnostic')));
  });
  test('règles du moteur générées depuis les constantes, veto titre OU description', () => {
    const p = prompt();
    for (const n of [W.titleHigh, W.titleOther, W.salaryBelowMin, W.balancedCap]) expect(p).toContain(String(n));
    expect(p).toContain("Un terme exclu élimine toute offre qui le contient dans son titre OU sa description");
    expect(p).toContain("Ne propose une exclusion que pour un terme qui n'apparaît pas dans la description d'offres pertinentes");
  });
  test('nombre d\'offres réel, jamais « 20 » en dur', () => {
    const p = prompt({ offers: Array.from({ length: 17 }, () => offer()) });
    expect(p).toContain('17 offres');
    expect(p).not.toContain('20 dernières');
  });
  test('au-delà de 30 offres : « les 30 plus récentes sur N »', () => {
    expect(prompt({ offers: Array.from({ length: 41 }, () => offer()) })).toContain('les 30 plus récentes sur 41');
  });
  test('offres dédoublonnées et décomposition du score présente', () => {
    const dup = { company: null, title: 'RSSI Groupe', location: 'Lyon' };
    const p = prompt({ offers: [offer(dup), offer(dup), offer({ title: 'RSSI Banque', company: 'ACME', salaryMin: 30000 })] });
    expect(p.match(/RSSI Groupe/g)).toHaveLength(1);
    expect(p).toMatch(/Score \d+[^=]*= Titre \+\d+, Mots-clés \+\d+, Domaine \+\d+, Salaire [+-]\d+, Ancienneté [+-]?\d+/);
    expect(p).not.toMatch(/\d+\.\d{3}/);
  });
  test('zéro action : signalé, tri prioritaire, pas de rejets inventés', () => {
    const p = prompt({ offers: Array.from({ length: 5 }, () => offer()) });
    expect(p).toContain('AUCUNE ACTION sur les 5 offres');
    expect(p).toContain('trier les 5 offres sans action');
    expect(p).toContain('n\'invente aucun rejet');
  });
  test('avec des actions : pas d\'avertissement de zéro action', () => {
    const p = prompt({ offers: [offer({ actions: ['thumbs_down'] }), offer()] });
    expect(p).not.toContain('AUCUNE ACTION');
  });
  test('conflit appris/profil signalé (cas « cybersécurité »)', () => {
    const p = prompt({
      alert: {
        id: 'a', name: 'Cœur', searchProfile: sp({ jobTitles: ['Responsable cybersécurité'] }),
        learnedDict: { positive: {}, negative: { 'cybersécurité': 8 } },
      },
    });
    expect(p).toContain('« cybersécurité » : rejeté, compteur 8');
    expect(p).toContain('EN CONFLIT');
    expect(p).toContain('TITRES des offres triées uniquement');
  });
  test('pistes identiques et distinctes', () => {
    const p = prompt({
      alert: { id: 'a', name: 'Cœur', searchProfile: sp({ jobTitles: ['RSSI', 'DSI'] }), learnedDict: { positive: {}, negative: {} } },
      otherAlerts: [
        { id: 'b', name: 'Copie', searchProfile: sp({ jobTitles: ['rssi', 'dsi'] }) },
        { id: 'c', name: 'Ailleurs', searchProfile: sp({ jobTitles: ['DPO'] }) },
      ],
    });
    expect(p).toContain('Piste quasi identique à « Copie » (recouvrement 100 %');
    expect(p).not.toContain('quasi identique à « Ailleurs »');
    expect(p).toContain("N'élargis pas cette piste");
  });
  test('incohérence de salaire APEC et profil candidat', () => {
    const p = prompt({
      alert: { id: 'a', name: 'Cœur', searchProfile: sp({ jobTitles: ['RSSI'], salary: { min: null, target: 50000 }, apecSalaires: ['40-50k€'] }), learnedDict: { positive: {}, negative: {} } },
    });
    expect(p).toContain('hors des tranches APEC');
    expect(p).toContain('environ 12 ans');
    expect(p).toContain('ISO 27001');
  });
  test('métriques avec dénominateur et période', () => {
    const p = prompt({ offers: [offer({ isRead: true }), offer(), offer(), offer()] });
    expect(p).toContain('25 % de 4 offres (1/4)');
    expect(p).toContain('30 jours');
  });
  test('format de sortie : schéma JSON et libellés APEC autorisés', () => {
    const p = prompt();
    expect(p).toContain(`"schema": "${WATCH_ANALYSIS_SCHEMA}"`);
    expect(p).toContain('learned_to_forget');
    expect(p).toContain('40-50k€');
    expect(p).toContain('5 lignes de synthèse');
  });
  test('quatre causes distinguées', () => {
    const p = prompt();
    for (const cause of ['requete', 'scoring', 'comportement', 'marche']) expect(p).toContain(cause);
  });
});
