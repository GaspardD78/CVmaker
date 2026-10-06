import { describe, expect, test, mock } from 'bun:test';
import { DEFAULT_SEARCH_PROFILE, type JobWatchAlert } from '@/types/job-watch';

mock.module('@/lib/db', () => ({ getDb: async () => ({}) }));
mock.module('@/lib/platform', () => ({ isAndroid: () => false }));
mock.module('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => false, requestPermission: async () => 'denied', sendNotification: () => {},
}));
mock.module('@/stores/jobWatchStore', () => ({ useJobWatchStore: { getState: () => ({}) } }));

import { countOffersToRecalc, recalculateScores } from './score-recalc';
import { SCORER_VERSION } from './scorer';

interface Offer { id: string; title: string; score: number; score_version: number; fetched_at: string }
interface Link { offer_id: string; alert_id: string; score: number; score_version: number }

function makeDb(offers: Offer[], links: Link[]) {
  return {
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      if (sql.includes('COUNT(*)')) {
        const since = params[1] as string;
        const n = offers.filter(o => o.score_version < (params[0] as number) && o.fetched_at.slice(0, 10) >= since
          && links.some(l => l.offer_id === o.id)).length;
        return [{ n }] as T;
      }
      if (sql.includes('FROM job_offers')) {
        const since = params[1] as string;
        const lastId = params[params.length - 1] as string;
        return offers
          .filter(o => o.score_version < (params[0] as number) && o.fetched_at.slice(0, 10) >= since && o.id > lastId
            && links.some(l => l.offer_id === o.id))
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(o => ({
            id: o.id, title: o.title, company: 'X', description_snippet: '', published_at: null,
            salary_min: null, salary_max: null, contract_type: null,
          })) as T;
      }
      if (sql.includes('SELECT alert_id FROM job_offer_alerts')) {
        return links.filter(l => l.offer_id === params[0]).map(l => ({ alert_id: l.alert_id })) as T;
      }
      return [] as T;
    },
    async execute(sql: string, params: unknown[] = []) {
      if (sql.startsWith('UPDATE job_offer_alerts')) {
        const link = links.find(l => l.offer_id === params[2] && l.alert_id === params[3]);
        if (link) { link.score = params[0] as number; link.score_version = params[1] as number; }
      } else if (sql.startsWith('UPDATE job_offers')) {
        const o = offers.find(x => x.id === params[2]);
        if (o) { o.score = params[0] as number; o.score_version = params[1] as number; }
      }
    },
  };
}

const alertOf = (id: string): JobWatchAlert => ({
  id, name: id, color: '#000', kind: 'core', position: 0, enabled: 1,
  searchProfile: { ...DEFAULT_SEARCH_PROFILE, name: id },
  aiFilterRule: null, learnedDict: { positive: {}, negative: {} }, companyReputation: {},
  learnedDecayedAt: null, lastFetchedAt: null, createdAt: '', sources: [],
});

const today = new Date().toISOString();
const longAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();

describe('recalcul des scores', () => {
  test('recalcule les offres récentes d\'une ancienne version, piste par piste', async () => {
    const offers: Offer[] = [
      { id: 'a', title: 'A', score: 86.667, score_version: 1, fetched_at: today },
      { id: 'b', title: 'B', score: 40.123, score_version: 1, fetched_at: today },
    ];
    const links: Link[] = [
      { offer_id: 'a', alert_id: 'P1', score: 86.667, score_version: 1 },
      { offer_id: 'a', alert_id: 'P2', score: 70.5, score_version: 1 },
      { offer_id: 'b', alert_id: 'P1', score: 40.123, score_version: 1 },
    ];
    const db = makeDb(offers, links);
    const progress: number[] = [];
    const result = await recalculateScores({
      alerts: [alertOf('P1'), alertOf('P2')], profileId: null, db,
      score: (_o, profile) => (profile.name === 'P1' ? 80 : 60),
      onProgress: p => progress.push(p.done),
    });

    expect(result.recalculated).toBe(2);
    expect(offers.every(o => o.score_version === SCORER_VERSION)).toBe(true);
    expect(offers.find(o => o.id === 'a')!.score).toBe(80); // meilleur score de ses pistes
    expect(links.find(l => l.offer_id === 'a' && l.alert_id === 'P2')!.score).toBe(60);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(2);
  });

  test('les offres de plus de 60 jours et celles déjà à jour ne sont pas touchées', async () => {
    const offers: Offer[] = [
      { id: 'old', title: 'O', score: 55.5, score_version: 1, fetched_at: longAgo },
      { id: 'ok', title: 'K', score: 70, score_version: SCORER_VERSION, fetched_at: today },
    ];
    const links: Link[] = [
      { offer_id: 'old', alert_id: 'P1', score: 55.5, score_version: 1 },
      { offer_id: 'ok', alert_id: 'P1', score: 70, score_version: SCORER_VERSION },
    ];
    const db = makeDb(offers, links);
    expect(await countOffersToRecalc(db, null)).toBe(0);
    await recalculateScores({ alerts: [alertOf('P1')], profileId: null, db, score: () => 10 });
    expect(offers.find(o => o.id === 'old')!.score).toBe(55.5);
    expect(offers.find(o => o.id === 'ok')!.score).toBe(70);
  });

  test('« Recalculer les scores » (force) reprend aussi les offres déjà à jour', async () => {
    const offers: Offer[] = [{ id: 'a', title: 'A', score: 70, score_version: SCORER_VERSION, fetched_at: today }];
    const links: Link[] = [{ offer_id: 'a', alert_id: 'P1', score: 70, score_version: SCORER_VERSION }];
    const db = makeDb(offers, links);
    const result = await recalculateScores({ alerts: [alertOf('P1')], profileId: null, db, force: true, score: () => 64 });
    expect(result.recalculated).toBe(1);
    expect(offers[0].score).toBe(64);
  });

  test('idempotent : un second passage ne recalcule plus rien', async () => {
    const offers: Offer[] = [{ id: 'a', title: 'A', score: 50.25, score_version: 1, fetched_at: today }];
    const links: Link[] = [{ offer_id: 'a', alert_id: 'P1', score: 50.25, score_version: 1 }];
    const db = makeDb(offers, links);
    await recalculateScores({ alerts: [alertOf('P1')], profileId: null, db, score: () => 51 });
    const second = await recalculateScores({ alerts: [alertOf('P1')], profileId: null, db, score: () => 99 });
    expect(second.recalculated).toBe(0);
    expect(offers[0].score).toBe(51);
  });

  test('piste supprimée : l\'offre est laissée telle quelle, sans boucle infinie', async () => {
    const offers: Offer[] = [{ id: 'a', title: 'A', score: 33.3, score_version: 1, fetched_at: today }];
    const links: Link[] = [{ offer_id: 'a', alert_id: 'GONE', score: 33.3, score_version: 1 }];
    const result = await recalculateScores({ alerts: [alertOf('P1')], profileId: null, db: makeDb(offers, links), score: () => 1 });
    expect(result).toEqual({ recalculated: 0, skipped: 1 });
    expect(offers[0].score).toBe(33.3);
  });
});
