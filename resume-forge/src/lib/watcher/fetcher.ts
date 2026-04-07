/**
 * Orchestrateur de collecte des offres d'emploi.
 *
 * Pour chaque source activée :
 *  1. Appelle le parser correspondant
 *  2. Calcule le hash de déduplication
 *  3. Filtre les doublons déjà en base
 *  4. Calcule le score de pertinence
 *  5. Calcule le temps de trajet (si Navitia configuré)
 *     → Skip Nominatim si la RawJobOffer contient déjà locationLat/locationLon (FT)
 *  6. Sauvegarde les nouvelles offres en base
 *
 * Les erreurs par source sont loguées mais ne stoppent pas les autres sources.
 */

import { getDb } from '@/lib/db';
import type { JobWatchConfig, JobWatchSettings, RawJobOffer, JobSource } from '@/types/job-watch';
import { computeOfferHash, loadExistingHashes, detectCrossSourceDuplicates } from './deduplicator';
import { computeScore, LearnedSignals } from './scorer';
import { getCommuteMinutes, getCommuteMinutesByCoords, delay } from './commute';
import { parseApec } from './parsers/apec';
import { parseIndeed } from './parsers/indeed';
import { parseWttj } from './parsers/wttj';
import { parseHellowork } from './parsers/hellowork';
import { parseLinkedinRss } from './parsers/linkedin-rss';
import { parseFranceTravail, getTokenCache } from './parsers/france-travail';
import { useJobWatchStore } from '@/stores/jobWatchStore';

/** Load learned dictionary and company reputation from DB for scoring. */
async function loadLearnedSignals(db: Awaited<ReturnType<typeof getDb>>): Promise<LearnedSignals> {
  try {
    const rows = await db.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM job_watch_settings WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'company_reputation')`
    );
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    const learnedDict = {
      positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
      negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
    };
    const companyReputation = map['company_reputation'] ? JSON.parse(map['company_reputation']) : {};

    return { learnedDict, companyReputation };
  } catch {
    return {};
  }
}

export interface FetchResult {
  source: JobSource;
  newOffers: number;
  errors: string[];
}

/** Run a single parser, catching all errors */
async function runParser(config: JobWatchConfig, settings: JobWatchSettings): Promise<RawJobOffer[]> {
  switch (config.source) {
    case 'apec':          return parseApec(config);
    case 'indeed':        return parseIndeed(config);
    case 'hellowork':     return parseHellowork(config);
    case 'wttj':          return parseWttj(config);
    case 'linkedin_rss':  return parseLinkedinRss(config);
    case 'france_travail': return parseFranceTravail(config, settings);
    default:
      throw new Error(`Source inconnue: ${config.source as string}`);
  }
}

/**
 * Main fetch pipeline — runs all enabled sources.
 * @param profileId - ID du profil courant pour isoler les données par utilisateur.
 * @returns Summary per source (new offers count, errors)
 */
export async function runFetch(
  configs:    JobWatchConfig[],
  settings:   JobWatchSettings,
  onProgress?: (source: JobSource, status: string) => void,
  profileId?: string | null,
): Promise<FetchResult[]> {
  const db = await getDb();
  const existingHashes = await loadExistingHashes(db, profileId ?? null);
  const results: FetchResult[] = [];

  // Load learned signals for scoring
  const learned = await loadLearnedSignals(db);

  const enabledConfigs = configs.filter(c => c.enabled === 1);

  // Phase 1: Fetch, dedup by hash, score, compute commute — collect all new offers
  interface ProcessedOffer {
    raw: RawJobOffer;
    hash: string;
    score: number;
    commuteMinutes: number | null;
    commuteStatus: 'pending' | 'ok' | 'error' | 'not_found';
  }
  const allProcessed: ProcessedOffer[] = [];
  const sourceResultMap = new Map<JobSource, FetchResult>();

  for (const config of enabledConfigs) {
    const result: FetchResult = { source: config.source, newOffers: 0, errors: [] };
    sourceResultMap.set(config.source, result);
    onProgress?.(config.source, 'fetching');

    let rawOffers: RawJobOffer[];
    try {
      rawOffers = await runParser(config, settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Parser error: ${msg}`);
      console.error(`[fetcher] Erreur source ${config.source}:`, err);
      results.push(result);
      continue;
    }

    onProgress?.(config.source, `${rawOffers.length} offres récupérées, déduplication…`);

    for (const raw of rawOffers) {
      try {
        const hash = await computeOfferHash(raw.source, raw.url);
        if (existingHashes.has(hash)) continue;

        const score = computeScore(raw, settings.searchIntent, settings.blacklistedCompanies, learned);

        let commuteMinutes: number | null = null;
        let commuteStatus: 'pending' | 'ok' | 'error' | 'not_found' = 'pending';

        if (settings.navitiaApiKey && settings.commuteOriginAddress) {
          if (raw.locationLat != null && raw.locationLon != null) {
            const commuteResult = await getCommuteMinutesByCoords(
              settings.commuteOriginAddress, raw.locationLat, raw.locationLon,
              settings.commuteDepartureTime, settings.navitiaApiKey
            );
            commuteStatus  = commuteResult.status;
            commuteMinutes = commuteResult.minutes;
          } else if (raw.location) {
            const commuteResult = await getCommuteMinutes(
              settings.commuteOriginAddress, raw.location,
              settings.commuteDepartureTime, settings.navitiaApiKey
            );
            commuteStatus  = commuteResult.status;
            commuteMinutes = commuteResult.minutes;
          } else {
            commuteStatus = 'not_found';
          }
          await delay(500);
        } else if (!raw.location && raw.locationLat == null) {
          commuteStatus = 'not_found';
        }

        allProcessed.push({ raw, hash, score, commuteMinutes, commuteStatus });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Offre ${raw.url}: ${msg}`);
        console.error('[fetcher] Erreur traitement offre:', err);
      }
    }

    onProgress?.(config.source, `traitement terminé`);
  }

  // Phase 2: Cross-source deduplication — remove duplicate offers from different sources
  const skipIndices = detectCrossSourceDuplicates(
    allProcessed.map(p => ({ title: p.raw.title, company: p.raw.company, source: p.raw.source, score: p.score }))
  );

  // Phase 3: Insert non-duplicate offers into DB
  for (let i = 0; i < allProcessed.length; i++) {
    if (skipIndices.has(i)) continue;
    const { raw, hash, score, commuteMinutes, commuteStatus } = allProcessed[i];

    try {
      await db.execute(
        `INSERT OR IGNORE INTO job_offers
          (source, url, hash, title, company, location, location_lat, location_lon,
           contract_type, description_snippet, published_at, score,
           commute_minutes, commute_status,
           salary_min, salary_max, salary_raw,
           is_read, is_archived, kanban_id, profile_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,0,0,NULL,?18)`,
        [
          raw.source, raw.url, hash, raw.title,
          raw.company ?? null, raw.location ?? null,
          raw.locationLat ?? null, raw.locationLon ?? null,
          raw.contractType ?? null, raw.descriptionSnippet ?? null,
          raw.publishedAt ?? null, score, commuteMinutes, commuteStatus,
          raw.salaryMin ?? null, raw.salaryMax ?? null, raw.salaryRaw ?? null,
          profileId ?? null,
        ]
      );
      existingHashes.add(hash);

      const sourceResult = sourceResultMap.get(raw.source as JobSource);
      if (sourceResult) sourceResult.newOffers++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const sourceResult = sourceResultMap.get(raw.source as JobSource);
      sourceResult?.errors.push(`Offre ${raw.url}: ${msg}`);
      console.error('[fetcher] Erreur insertion offre:', err);
    }
  }

  // Collect results for sources that weren't already pushed (due to parser error)
  for (const config of enabledConfigs) {
    const result = sourceResultMap.get(config.source);
    if (result && !results.includes(result)) {
      onProgress?.(config.source, `done (${result.newOffers} nouvelles)`);
      results.push(result);
    }
  }

  // Persist France Travail token if refreshed
  const ftCache = getTokenCache();
  if (ftCache) {
    const store = useJobWatchStore.getState();
    await store.saveSettings({
      ...store.settings,
      ftAccessToken:    ftCache.accessToken,
      ftTokenExpiresAt: String(ftCache.expiresAt),
    });
  }

  return results;
}
