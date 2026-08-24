/**
 * Tests du pipeline de collecte multi-pistes.
 *
 * Deux niveaux :
 *   - `buildFetchPlan` / `estimateFetchLoad` : fonctions pures qui décident de
 *     la charge réseau du cycle ;
 *   - `runFetch` : le pipeline complet, sur une base et des parsers simulés.
 *     C'est là que se jouent les règles délicates — seuil de sauvegarde sur le
 *     meilleur score, rattachement piste par piste, offre préexistante captée
 *     par une nouvelle piste, statut lu préservé.
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import type { JobWatchAlert, JobWatchConfig, JobWatchSettings, RawJobOffer } from '@/types/job-watch';
import { DEFAULT_JOB_WATCH_SETTINGS, DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';

// ── Base simulée ─────────────────────────────────────────────────────────────

interface OfferRow { id: string; hash: string; score: number; is_read: number; profile_id: string | null }
interface LinkRow { offer_id: string; alert_id: string; score: number; matched_at: string }

const dbState = {
  offers: [] as OfferRow[],
  links: [] as LinkRow[],
  logs: [] as Array<{ source: string; alert_id: string; offers_new: number }>,
  nextId: 1,
};

const fakeDb = {
  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    if (sql.includes('SELECT id, hash, score FROM job_offers')) {
      const pid = sql.includes('profile_id = ?1') ? (params[0] as string) : null;
      return dbState.offers
        .filter(o => o.profile_id === pid)
        .map(o => ({ id: o.id, hash: o.hash, score: o.score })) as T;
    }
    if (sql.includes('SELECT offer_id, alert_id, score, matched_at FROM job_offer_alerts')) {
      const ids = new Set(params as string[]);
      return dbState.links.filter(l => ids.has(l.offer_id)) as T;
    }
    if (sql.includes('SELECT offer_id, alert_id FROM job_offer_alerts')) {
      return dbState.links.map(l => ({ offer_id: l.offer_id, alert_id: l.alert_id })) as T;
    }
    if (sql.includes('SELECT id FROM job_offers WHERE hash')) {
      const found = dbState.offers.find(o => o.hash === params[0]);
      return (found ? [{ id: found.id }] : []) as T;
    }
    return [] as T;
  },
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes('INSERT OR IGNORE INTO job_offers')) {
      const hash = params[2] as string;
      if (dbState.offers.some(o => o.hash === hash)) return;
      dbState.offers.push({
        id: `o${dbState.nextId++}`, hash, score: params[11] as number,
        is_read: 0, profile_id: (params[17] as string | null) ?? null,
      });
      return;
    }
    if (sql.includes('INSERT OR IGNORE INTO job_offer_alerts')) {
      const [offerId, alertId, score] = params as [string, string, number];
      if (dbState.links.some(l => l.offer_id === offerId && l.alert_id === alertId)) return;
      dbState.links.push({ offer_id: offerId, alert_id: alertId, score, matched_at: 'NOW' });
      return;
    }
    if (sql.includes('UPDATE job_offer_alerts SET score')) {
      const [score, offerId, alertId] = params as [number, string, string];
      const link = dbState.links.find(l => l.offer_id === offerId && l.alert_id === alertId);
      if (link) link.score = score;
      return;
    }
    if (sql.includes('UPDATE job_offers SET score')) {
      const [score, offerId] = params as [number, string];
      const offer = dbState.offers.find(o => o.id === offerId);
      if (offer && offer.score < score) offer.score = score;
      return;
    }
    if (sql.includes('INSERT INTO job_watch_fetch_log')) {
      dbState.logs.push({
        source: params[0] as string, alert_id: params[1] as string, offers_new: params[3] as number,
      });
      return;
    }
  },
};

// ── Doublures ────────────────────────────────────────────────────────────────

/** Offres renvoyées par chaque source, injectées par les tests. */
const parserOutput: Record<string, RawJobOffer[]> = {};
/** Appels de parser du cycle courant — sert à vérifier la mutualisation. */
let parserCalls: string[] = [];
/** Sources qui échouent lors du cycle courant. */
let failingSources = new Set<string>();
/** Score attribué : titre de l'offre → nom de la piste → score. */
let scoreTable: Record<string, Record<string, number>> = {};

mock.module('@/lib/db', () => ({ getDb: async () => fakeDb }));
mock.module('@/lib/platform', () => ({ isAndroid: () => false }));
mock.module('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => false,
  requestPermission: async () => 'denied',
  sendNotification: () => {},
}));
mock.module('@/stores/jobWatchStore', () => ({
  useJobWatchStore: { getState: () => ({ settings: {}, saveSettings: async () => {} }) },
}));

import { buildFetchPlan, estimateFetchLoad, runFetch, type FetchDependencies } from './fetcher';

/**
 * Dépendances injectées : parsers, scoring, géo et trajet sont simulés ici et
 * non remplacés globalement — un mock de module fuirait vers les autres
 * fichiers de test du même processus.
 */
const deps: FetchDependencies = {
  runParser: async (config) => {
    parserCalls.push(config.source);
    if (failingSources.has(config.source)) {
      // Message au format réellement produit par le parser APEC : reconnu
      // comme panne opérationnelle, donc journalisé sans bruit d'erreur.
      throw new Error(`${config.source.toUpperCase()} HTTP 503 : service indisponible`);
    }
    return parserOutput[config.source] ?? [];
  },
  computeScore: (offer, profile) => scoreTable[offer.title]?.[profile.name] ?? 0,
  resolveProfileGeo: async () => null,
  classifyOfferZone: () => 'unknown',
  getCommuteMinutes: async () => ({ status: 'ok', minutes: 30 }),
  getCommuteMinutesByCoords: async () => ({ status: 'ok', minutes: 30 }),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

function alert(name: string, overrides: Partial<JobWatchAlert> = {}): JobWatchAlert {
  return {
    id: name, name, color: '#000', kind: 'core', position: 0, enabled: 1,
    // `name` porte l'identité de la piste jusque dans le scorer simulé.
    searchProfile: { ...DEFAULT_SEARCH_PROFILE, name, jobTitles: [name] },
    aiFilterRule: null,
    learnedDict: { positive: {}, negative: {} },
    companyReputation: {},
    learnedDecayedAt: null, lastFetchedAt: null, createdAt: '', sources: [],
    ...overrides,
  };
}

function config(alertId: string, source: JobWatchConfig['source']): JobWatchConfig {
  return {
    id: `${alertId}-${source}`, alertId, source, rssUrl: null,
    enabled: 1, lastFetchedAt: null, createdAt: '',
  };
}

function offer(title: string, source = 'apec', url = `https://x.test/${title}`): RawJobOffer {
  return {
    source, url, title, company: title, location: 'Paris',
    locationLat: null, locationLon: null, contractType: 'CDI',
    descriptionSnippet: '', publishedAt: null,
    salaryMin: null, salaryMax: null, salaryRaw: null,
  } as RawJobOffer;
}

const settings: JobWatchSettings = {
  ...DEFAULT_JOB_WATCH_SETTINGS,
  minSaveScore: 20,
  navitiaApiKey: '',
  commuteOriginAddress: '',
};

beforeEach(() => {
  dbState.offers = [];
  dbState.links = [];
  dbState.logs = [];
  dbState.nextId = 1;
  parserCalls = [];
  failingSources = new Set();
  scoreTable = {};
  for (const key of Object.keys(parserOutput)) delete parserOutput[key];
});

// ── Plan de collecte ─────────────────────────────────────────────────────────

describe('buildFetchPlan', () => {
  test('deux pistes au profil identique partagent une seule requête', () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile } });
    const plan = buildFetchPlan([a, b], [config('A', 'apec'), config('B', 'apec')]);
    expect(plan).toHaveLength(1);
    expect(plan[0].alerts.map(x => x.id)).toEqual(['A', 'B']);
  });

  test('deux pistes aux mots-clés distincts émettent deux requêtes', () => {
    const plan = buildFetchPlan([alert('A'), alert('B', { id: 'B' })], [config('A', 'apec'), config('B', 'apec')]);
    expect(plan).toHaveLength(2);
  });

  test('une piste désactivée est ignorée', () => {
    const plan = buildFetchPlan(
      [alert('A'), alert('B', { id: 'B', enabled: 0 })],
      [config('A', 'apec'), config('B', 'apec')],
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].alerts[0].id).toBe('A');
  });

  test('une source désactivée est ignorée', () => {
    const plan = buildFetchPlan([alert('A')], [{ ...config('A', 'apec'), enabled: 0 }]);
    expect(plan).toHaveLength(0);
  });

  test('une source orpheline (sans piste) est ignorée', () => {
    const plan = buildFetchPlan([alert('A')], [{ ...config('A', 'apec'), alertId: null }]);
    expect(plan).toHaveLength(0);
  });

  test('les sources incompatibles sont écartées', () => {
    const plan = buildFetchPlan(
      [alert('A')],
      [config('A', 'apec'), config('A', 'linkedin')],
      new Set(['linkedin'] as const),
    );
    expect(plan.map(g => g.source)).toEqual(['apec']);
  });
});

describe('estimateFetchLoad', () => {
  test('compte les tâches, les requêtes réelles et les mutualisations', () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile } });
    const c = alert('C', { id: 'C' });
    const load = estimateFetchLoad(
      [a, b, c],
      [config('A', 'apec'), config('B', 'apec'), config('C', 'apec'), config('C', 'wttj')],
    );
    expect(load.tasks).toBe(4);
    // A et B partagent leur requête APEC ; C en a une propre, plus WTTJ.
    expect(load.requests).toBe(3);
    expect(load.mutualised).toBe(1);
    // Deux requêtes APEC successives → un délai d'attente compté.
    expect(load.throttleMs).toBeGreaterThan(0);
  });
});

// ── Pipeline complet ─────────────────────────────────────────────────────────

describe('runFetch', () => {
  test('mutualise la requête et rattache l\'offre aux deux pistes', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80, B: 60 };

    const { results } = await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);

    expect(parserCalls).toEqual(['apec']);
    expect(dbState.offers).toHaveLength(1);
    expect(dbState.links.map(l => l.alert_id).sort()).toEqual(['A', 'B']);
    // Le score stocké sur l'offre est le meilleur ; celui de la liaison est propre à la piste.
    expect(dbState.offers[0].score).toBe(80);
    expect(dbState.links.find(l => l.alert_id === 'B')?.score).toBe(60);
    expect(results.filter(r => r.newOffers === 1)).toHaveLength(2);
  });

  test('sauvegarde sur le meilleur score, rattache seulement les pistes au-dessus du seuil', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    // Sous le seuil pour A (12), largement au-dessus pour B (71).
    scoreTable.poste = { A: 12, B: 71 };

    const { results } = await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);

    expect(dbState.offers).toHaveLength(1);
    expect(dbState.links.map(l => l.alert_id)).toEqual(['B']);
    expect(results.find(r => r.alertId === 'A')?.offersFiltered).toBe(1);
    expect(results.find(r => r.alertId === 'A')?.newOffers).toBe(0);
    expect(results.find(r => r.alertId === 'B')?.newOffers).toBe(1);
  });

  test('une piste qui disqualifie l\'offre n\'est jamais rattachée', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 0, B: 55 };

    await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);
    expect(dbState.links.map(l => l.alert_id)).toEqual(['B']);
  });

  test('aucune piste au-dessus du seuil : rien n\'est sauvegardé', async () => {
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 5 };
    const { results } = await runFetch([alert('A')], [config('A', 'apec')], settings, undefined, null, deps);
    expect(dbState.offers).toHaveLength(0);
    expect(results[0].offersFiltered).toBe(1);
  });

  test('une offre déjà en base captée par une nouvelle piste reçoit la liaison manquante', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80, B: 45 };

    // Cycle 1 : seule la piste A existe.
    await runFetch([a], [config('A', 'apec')], settings, undefined, null, deps);
    expect(dbState.offers).toHaveLength(1);
    dbState.offers[0].is_read = 1; // l'utilisateur l'a lue

    // Cycle 2 : la piste B est créée et capte la même offre.
    parserCalls = [];
    const { results } = await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);

    expect(dbState.offers).toHaveLength(1);            // aucune duplication
    expect(dbState.offers[0].is_read).toBe(1);         // statut préservé
    expect(dbState.links.map(l => l.alert_id).sort()).toEqual(['A', 'B']);
    const bResult = results.find(r => r.alertId === 'B');
    expect(bResult?.offersLinked).toBe(1);             // rattachée, pas insérée
    expect(bResult?.newOffers).toBe(0);
    // Pour A, l'offre est un simple doublon.
    expect(results.find(r => r.alertId === 'A')?.offersDuplicate).toBe(1);
  });

  test('une offre déjà rattachée à toutes ses pistes est un doublon', async () => {
    const a = alert('A');
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80 };

    await runFetch([a], [config('A', 'apec')], settings, undefined, null, deps);
    const { results } = await runFetch([a], [config('A', 'apec')], settings, undefined, null, deps);

    expect(dbState.offers).toHaveLength(1);
    expect(dbState.links).toHaveLength(1);
    expect(results[0].offersDuplicate).toBe(1);
    expect(results[0].newOffers).toBe(0);
  });

  test('un score de piste plus élevé au cycle suivant relève la liaison', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80 };
    await runFetch([a], [config('A', 'apec')], settings, undefined, null, deps);

    // B capte l'offre avec un score supérieur au meilleur connu.
    scoreTable.poste = { A: 80, B: 95 };
    await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);

    expect(dbState.offers[0].score).toBe(95);
    expect(dbState.links.find(l => l.alert_id === 'B')?.score).toBe(95);
  });

  test('une erreur de source n\'interrompt pas les autres tâches', async () => {
    const a = alert('A');
    parserOutput.wttj = [offer('poste', 'wttj', 'https://x.test/w')];
    scoreTable.poste = { A: 70 };
    failingSources.add('apec');

    const { results } = await runFetch([a], [config('A', 'apec'), config('A', 'wttj')], settings, undefined, null, deps);

    expect(results.find(r => r.source === 'apec')?.status).toBe('error');
    expect(results.find(r => r.source === 'wttj')?.newOffers).toBe(1);
    // La collecte est journalisée pour les deux sources de la piste.
    expect(dbState.logs).toHaveLength(2);
  });

  test('une offre captée par plusieurs pistes ne compte qu\'une nouvelle offre', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    const c = alert('C', { id: 'C', searchProfile: { ...a.searchProfile, name: 'C' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80, B: 70, C: 60 };

    const outcome = await runFetch(
      [a, b, c],
      [config('A', 'apec'), config('B', 'apec'), config('C', 'apec')],
      settings, undefined, null, deps,
    );

    // Trois rattachements, mais une seule offre : l'annoncer trois fois serait mensonger.
    expect(dbState.links).toHaveLength(3);
    expect(outcome.newOffers).toBe(1);
    expect(outcome.linkedOffers).toBe(0);
  });

  test('le bilan distingue les insertions des rattachements', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 80, B: 45 };

    await runFetch([a], [config('A', 'apec')], settings, undefined, null, deps);
    const outcome = await runFetch(
      [a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps,
    );

    expect(outcome.newOffers).toBe(0);
    expect(outcome.linkedOffers).toBe(1);
  });

  test('la collecte est journalisée par couple (piste, source)', async () => {
    const a = alert('A');
    const b = alert('B', { id: 'B', searchProfile: { ...a.searchProfile, name: 'B' } });
    parserOutput.apec = [offer('poste')];
    scoreTable.poste = { A: 70, B: 70 };

    await runFetch([a, b], [config('A', 'apec'), config('B', 'apec')], settings, undefined, null, deps);

    expect(dbState.logs).toHaveLength(2);
    expect(dbState.logs.map(l => l.alert_id).sort()).toEqual(['A', 'B']);
  });
});
