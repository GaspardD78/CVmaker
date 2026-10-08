import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { SearchProfile, JobWatchSettings, JobWatchConfig } from '@/types/job-watch';

interface Call { url: string }
const calls: Call[] = [];
let total = 0;
let makeOffer: (i: number) => Record<string, unknown>;

// Stub au niveau de la feuille (comme jobicy.test.ts) : `../http` délègue à ce plugin.
mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async (url: string) => {
    if (url.includes('access_token')) {
      return new Response(JSON.stringify({ access_token: 't', expires_in: 1500 }), { status: 200 });
    }
    calls.push({ url });
    const range = new URL(url).searchParams.get('range')!;
    const [start, end] = range.split('-').map(Number);
    const resultats = [];
    for (let i = start; i <= Math.min(end, total - 1); i++) resultats.push(makeOffer(i));
    return new Response(JSON.stringify({ resultats }), {
      status: 206,
      headers: { 'Content-Range': `offres ${start}-${start + resultats.length - 1}/${total}` },
    });
  },
}));

const { parseFranceTravail, consumeFranceTravailMetrics } = await import('./france-travail');

const profile = {
  name: 'T', jobTitles: ['Chargé de recrutement'], skills: [], domains: [], excludeTitles: [], excludeDomains: [],
  location: { label: 'Paris (75)', city: 'Paris', inseeCode: '75056', departmentCodes: ['75'], radiusKm: 10 },
  contractTypes: [], salary: { min: null, target: null }, scoring: { mode: 'balanced' },
} as unknown as SearchProfile;
const settings = { ftClientId: 'id', ftClientSecret: 'secret' } as JobWatchSettings;
const config = {} as JobWatchConfig;

beforeEach(() => { calls.length = 0; });

describe('collecte France Travail', () => {
  it('n\'impose pas origineOffre (partenaires inclus), pagine jusqu\'à 3 appels, filtre les titres, journalise par partenaire', async () => {
    total = 1000;
    makeOffer = i => ({
      id: `o${i}`,
      intitule: i % 2 === 0 ? 'Chargé de recrutement IT' : 'Chargé de logistique',
      origineOffre: i % 3 === 0
        ? { origine: '2', partenaires: [{ nom: 'Talentplug' }], urlOrigine: `https://x/${i}` }
        : { origine: '1' },
    });
    const out = await parseFranceTravail(config, settings, profile);

    expect(calls.length).toBe(3);
    for (const c of calls) expect(new URL(c.url).searchParams.has('origineOffre')).toBe(false);
    expect(out.every(o => /recrutement/.test(o.title))).toBe(true);
    expect(out.length).toBe(225); // 450 reçues, une sur deux porte l'intitulé

    const m = consumeFranceTravailMetrics()!;
    expect(m.listed).toBe(450);
    expect(m.retained).toBe(225);
    expect(m.listPages).toBe(3);
    expect(m.byPartner!.Talentplug.received).toBe(150);
    expect(m.byPartner!['France Travail'].received).toBe(300);
    expect(consumeFranceTravailMetrics()).toBeNull();
  });

  it('s\'arrête dès que Content-Range indique que tout est ramené', async () => {
    total = 40;
    makeOffer = i => ({ id: `p${i}`, intitule: 'Chargé de recrutement', origineOffre: { origine: '1' } });
    const out = await parseFranceTravail(config, settings, profile);
    expect(calls.length).toBe(1);
    expect(out.length).toBe(40);
  });
});
