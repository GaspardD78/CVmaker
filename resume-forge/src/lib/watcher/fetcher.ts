/**
 * Orchestrateur de collecte des offres d'emploi.
 *
 * Pour chaque source activée :
 *  1. Appelle le parser correspondant (avec settings.searchProfile comme source de vérité)
 *  2. Calcule le hash de déduplication
 *  3. Filtre les doublons déjà en base
 *  4. Calcule le score de pertinence (scorer field-aware v2)
 *  5. Calcule le temps de trajet (si Navitia configuré)
 *  6. Sauvegarde les nouvelles offres en base
 *
 * Les erreurs par source sont loguées mais ne stoppent pas les autres sources.
 */

import { getDb } from '@/lib/db';
import { isAndroid } from '@/lib/platform';
import type { JobWatchConfig, JobWatchSettings, RawJobOffer, JobSource, FetchLog } from '@/types/job-watch';
import { ANDROID_INCOMPATIBLE } from './sources';
import { computeOfferHash, loadExistingHashes, detectCrossSourceDuplicates } from './deduplicator';
import { computeScore, LearnedSignals } from './scorer';
import { getCommuteMinutes, getCommuteMinutesByCoords, delay } from './commute';
import { parseApec } from './parsers/apec';
import { parseWttj } from './parsers/wttj';
import { parseLinkedinRss } from './parsers/linkedin-rss';
// LinkedIn passe désormais par l'API publique « jobs-guest » — cf. parsers/linkedin-xray.ts.
// Le parser WebView connecté (parsers/linkedin.ts) reste en dépôt mais n'est
// plus utilisé : scraping authentifié = violation TOS LinkedIn + risque ban.
import { parseLinkedinXray } from './parsers/linkedin-xray';
import { parseIndeed } from './parsers/indeed';
import { parseHellowork } from './parsers/hellowork';
import { parseJobicy } from './parsers/jobicy';
import { parseFranceTravail, getTokenCache } from './parsers/france-travail';
import { parseEmploiTerritorial } from './parsers/emploi-territorial';
import { parseMantiks } from './parsers/mantiks';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { 
  isPermissionGranted, 
  requestPermission, 
  sendNotification 
} from '@tauri-apps/plugin-notification';

/** Load learned dictionary, company reputation and AI filter rule for scoring, scoped to the profile. */
async function loadLearnedSignals(
  db: Awaited<ReturnType<typeof getDb>>,
  profileId: string | null,
): Promise<LearnedSignals> {
  try {
    const pid = profileId ?? '';
    const rows = await db.select<{ key: string; profile_id: string; value: string }[]>(
      `SELECT key, profile_id, value FROM job_watch_settings
       WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'company_reputation', 'ai_filter_rule')
       AND (profile_id = '' OR profile_id = ?1)`,
      [pid],
    );
    const map: Record<string, string> = {};
    for (const r of rows.filter(x => x.profile_id === '')) map[r.key] = r.value;
    for (const r of rows.filter(x => x.profile_id !== '')) map[r.key] = r.value;

    let aiFilterRule: LearnedSignals['aiFilterRule'] = null;
    if (map['ai_filter_rule']) {
      try { aiFilterRule = JSON.parse(map['ai_filter_rule']); } catch { /* ignore malformed rule */ }
    }

    return {
      learnedDict: {
        positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
        negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
      },
      companyReputation: map['company_reputation'] ? JSON.parse(map['company_reputation']) : {},
      aiFilterRule,
    };
  } catch {
    return {};
  }
}

/**
 * Persists a FetchLog entry and purges old entries keeping only the 50 most
 * recent per source. Gracefully swallows errors — logging must never crash
 * the fetch pipeline.
 */
async function writeFetchLog(
  db: Awaited<ReturnType<typeof getDb>>,
  entry: Omit<FetchLog, 'id' | 'fetchedAt'>,
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO job_watch_fetch_log
         (source, offers_fetched, offers_new, offers_duplicate, offers_filtered, status, error_message, duration_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [
        entry.source,
        entry.offersFetched,
        entry.offersNew,
        entry.offersDuplicate,
        entry.offersFiltered,
        entry.status,
        entry.errorMessage,
        entry.durationMs,
      ]
    );
    // Purge: keep only the 50 most recent logs per source
    await db.execute(
      `DELETE FROM job_watch_fetch_log
       WHERE source = ?1
         AND id NOT IN (
           SELECT id FROM job_watch_fetch_log
           WHERE source = ?1
           ORDER BY fetched_at DESC
           LIMIT 50
         )`,
      [entry.source]
    );
  } catch (err) {
    console.warn('[fetcher] writeFetchLog error (non-fatal):', err);
  }
}

export interface FetchResult {
  source: JobSource;
  /** Offres effectivement insérées en base (nouvelles et au-dessus de minSaveScore) */
  newOffers: number;
  /** Nombre total d'offres renvoyées par la source (avant tout filtrage) */
  totalFetched: number;
  /** Offres rejetées car déjà connues (hash) ou doublon cross-source */
  offersDuplicate: number;
  /** Offres rejetées par le filtre minSaveScore */
  offersFiltered: number;
  errors: string[];
  /** Durée de collecte (parsing uniquement) en ms */
  durationMs: number;
  /** Statut calculé : success si pas d'erreur et offers > 0, empty si 0 offres, error si erreur */
  status: 'success' | 'error' | 'empty';
}

/** Run a single parser — settings.searchProfile drives all query parameters */
async function runParser(
  config: JobWatchConfig,
  settings: JobWatchSettings,
  profileId?: string | null,
): Promise<RawJobOffer[]> {
  switch (config.source) {
    case 'apec':               return parseApec(config, settings);
    case 'wttj':               return parseWttj(config, settings);
    case 'linkedin_rss':       return parseLinkedinRss(config, settings);
    case 'linkedin':           return parseLinkedinXray(config, settings);
    case 'indeed':             return parseIndeed(config, settings, profileId);
    case 'hellowork':          return parseHellowork(config, settings, profileId);
    case 'jobicy':             return parseJobicy(config, settings);
    case 'france_travail':     return parseFranceTravail(config, settings);
    case 'emploi_territorial': return parseEmploiTerritorial(config, settings);
    case 'mantiks':            return parseMantiks(config, settings);
    default:
      throw new Error(`Source inconnue: ${config.source as string}`);
  }
}

/**
 * Main fetch pipeline — runs all enabled sources.
 * All search parameters (keywords, location, contract types) come from
 * settings.searchProfile — the single source of truth.
 */
export async function runFetch(
  configs:     JobWatchConfig[],
  settings:    JobWatchSettings,
  onProgress?: (source: JobSource, status: string, current?: number, total?: number) => void,
  profileId?:  string | null,
): Promise<FetchResult[]> {
  const db = await getDb();
  const existingHashes = await loadExistingHashes(db, profileId ?? null);
  const results: FetchResult[] = [];

  const learned = await loadLearnedSignals(db, profileId ?? null);


  // Sur Android, on saute silencieusement les sources de scraping (LinkedIn,
  // Indeed, HelloWork) qui ne fonctionnent pas de façon fiable sur mobile
  // (cf. ANDROID_INCOMPATIBLE). Mieux vaut les ignorer que de polluer l'UI
  // d'erreurs récurrentes.
  const onAndroid = isAndroid();
  const enabledConfigs = configs.filter(c => {
    if (c.enabled !== 1) return false;
    if (onAndroid && ANDROID_INCOMPATIBLE.has(c.source)) {
      console.info(`[fetcher] ${c.source} ignoré sur Android (non supporté).`);
      return false;
    }
    return true;
  });

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
    const result: FetchResult = {
      source: config.source,
      newOffers: 0,
      totalFetched: 0,
      offersDuplicate: 0,
      offersFiltered: 0,
      errors: [],
      durationMs: 0,
      status: 'empty',
    };
    sourceResultMap.set(config.source, result);
    onProgress?.(config.source, 'fetching');

    const sourceStartTime = Date.now();
    let rawOffers: RawJobOffer[];
    try {
      rawOffers = await runParser(config, settings, profileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Parser error: ${msg}`);
      result.durationMs = Date.now() - sourceStartTime;
      result.status = 'error';
      console.error(`[fetcher] Erreur source ${config.source}:`, err);
      results.push(result);
      await writeFetchLog(db, {
        source:          result.source,
        offersFetched:   0,
        offersNew:       0,
        offersDuplicate: 0,
        offersFiltered:  0,
        status:          'error',
        errorMessage:    msg,
        durationMs:      result.durationMs,
      });
      continue;
    }
    result.totalFetched = rawOffers.length;
    result.durationMs = Date.now() - sourceStartTime;

    const needsCommute = Boolean(settings.navitiaApiKey && settings.commuteOriginAddress);

    onProgress?.(
      config.source,
      needsCommute
        ? `${rawOffers.length} offres récupérées, calcul des trajets…`
        : `${rawOffers.length} offres récupérées, déduplication…`,
      0,
      rawOffers.length,
    );

    let commuteIdx = 0;
    for (const raw of rawOffers) {
      try {
        const hash = await computeOfferHash(raw.source, raw.url);
        if (existingHashes.has(hash)) {
          result.offersDuplicate += 1;
          continue;
        }

        // Score using the unified SearchProfile (field-aware v2)
        const score = computeScore(raw, settings.searchProfile, learned);

        let commuteMinutes: number | null = null;
        let commuteStatus: 'pending' | 'ok' | 'error' | 'not_found' = 'pending';

        if (settings.navitiaApiKey && settings.commuteOriginAddress) {
          commuteIdx++;
          // Emit commute progress every 5 offers (Navitia calls are the bottleneck)
          if (commuteIdx === 1 || commuteIdx % 5 === 0) {
            onProgress?.(config.source, `Calcul trajet…`, commuteIdx, rawOffers.length);
          }

          if (raw.locationLat != null && raw.locationLon != null) {
            const res = await getCommuteMinutesByCoords(
              settings.commuteOriginAddress, raw.locationLat, raw.locationLon,
              settings.commuteDepartureTime, settings.navitiaApiKey
            );
            commuteStatus  = res.status;
            commuteMinutes = res.minutes;
          } else if (raw.location) {
            const res = await getCommuteMinutes(
              settings.commuteOriginAddress, raw.location,
              settings.commuteDepartureTime, settings.navitiaApiKey
            );
            commuteStatus  = res.status;
            commuteMinutes = res.minutes;
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

    onProgress?.(config.source, 'traitement terminé');
  }

  // Phase 2: Cross-source deduplication
  const skipIndices = detectCrossSourceDuplicates(
    allProcessed.map(p => ({ title: p.raw.title, company: p.raw.company, source: p.raw.source, score: p.score }))
  );

  // Phase 3: Insert non-duplicate offers into DB
  for (let i = 0; i < allProcessed.length; i++) {
    const { raw, hash, score, commuteMinutes, commuteStatus } = allProcessed[i];

    if (skipIndices.has(i)) {
      const sr = sourceResultMap.get(raw.source as JobSource);
      if (sr) sr.offersDuplicate += 1;
      continue;
    }

    // Filter by minimum save score. Track explicitly so the HealthDashboard can
    // explain the gap between `totalFetched` and `newOffers` to the user.
    if (score < settings.minSaveScore) {
      const sr = sourceResultMap.get(raw.source as JobSource);
      if (sr) sr.offersFiltered += 1;
      continue;
    }

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
      sourceResultMap.get(raw.source as JobSource)?.errors.push(`Offre ${raw.url}: ${msg}`);
      console.error('[fetcher] Erreur insertion offre:', err);
    }
  }

  for (const config of enabledConfigs) {
    const result = sourceResultMap.get(config.source);
    if (result && !results.includes(result)) {
      // Compute final status
      if (result.errors.length > 0) {
        result.status = 'error';
      } else if (result.totalFetched === 0) {
        result.status = 'empty';
      } else {
        result.status = 'success';
      }
      onProgress?.(config.source, `done (${result.newOffers} nouvelles)`);
      results.push(result);

      // Persist fetch log (non-blocking — errors are swallowed in writeFetchLog)
      await writeFetchLog(db, {
        source:          result.source,
        offersFetched:   result.totalFetched,
        offersNew:       result.newOffers,
        offersDuplicate: result.offersDuplicate,
        offersFiltered:  result.offersFiltered,
        status:          result.status,
        errorMessage:    result.errors.length > 0 ? result.errors[0] : null,
        durationMs:      result.durationMs,
      });
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

  const totalNew = results.reduce((acc, r) => acc + r.newOffers, 0);
  if (totalNew > 0) {
    try {
      let permission = await isPermissionGranted();
      if (!permission) {
        permission = await requestPermission() === 'granted';
      }
      if (permission) {
        sendNotification({
          title: 'Nouvelles offres trouvées !',
          body: `${totalNew} nouvelles offres correspondent à vos critères.`,
          icon: 'ic_launcher', // Icône Android par défaut
        });
      }
    } catch (err) {
      console.warn('[fetcher] Erreur notification native:', err);
    }
  }

  return results;
}
