/**
 * Orchestrateur de collecte des offres d'emploi.
 *
 * Pour chaque source activée :
 *  1. Appelle le parser correspondant
 *  2. Calcule le hash de déduplication
 *  3. Filtre les doublons déjà en base
 *  4. Calcule le score de pertinence
 *  5. Calcule le temps de trajet (si Navitia configuré)
 *  6. Sauvegarde les nouvelles offres en base
 *
 * Les erreurs par source sont loguées mais ne stoppent pas les autres sources.
 */

import { getDb } from '@/lib/db';
import type { JobWatchConfig, JobWatchSettings, RawJobOffer, JobSource } from '@/types/job-watch';
import { computeOfferHash, loadExistingHashes } from './deduplicator';
import { computeScore } from './scorer';
import { getCommuteMinutes, delay } from './commute';
import { parseApec } from './parsers/apec';
import { parseIndeed } from './parsers/indeed';
import { parseWttj } from './parsers/wttj';
import { parseLinkedinRss } from './parsers/linkedin-rss';

export interface FetchResult {
  source: JobSource;
  newOffers: number;
  errors: string[];
}

/** Run a single parser, catching all errors */
async function runParser(config: JobWatchConfig): Promise<RawJobOffer[]> {
  switch (config.source) {
    case 'apec':         return parseApec(config);
    case 'indeed':       return parseIndeed(config);
    case 'wttj':         return parseWttj(config);
    case 'linkedin_rss': return parseLinkedinRss(config);
    default:
      throw new Error(`Source inconnue: ${config.source as string}`);
  }
}

/**
 * Main fetch pipeline — runs all enabled sources.
 * @returns Summary per source (new offers count, errors)
 */
export async function runFetch(
  configs:  JobWatchConfig[],
  settings: JobWatchSettings,
  onProgress?: (source: JobSource, status: string) => void
): Promise<FetchResult[]> {
  const db = await getDb();
  const existingHashes = await loadExistingHashes(db);
  const results: FetchResult[] = [];

  const enabledConfigs = configs.filter(c => c.enabled === 1);

  for (const config of enabledConfigs) {
    const result: FetchResult = { source: config.source, newOffers: 0, errors: [] };
    onProgress?.(config.source, 'fetching');

    let rawOffers: RawJobOffer[];
    try {
      rawOffers = await runParser(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Parser error: ${msg}`);
      console.error(`[fetcher] Erreur source ${config.source}:`, err);
      results.push(result);
      continue;
    }

    onProgress?.(config.source, `${rawOffers.length} offres récupérées, déduplication…`);

    // Process each raw offer
    for (const raw of rawOffers) {
      try {
        const hash = await computeOfferHash(raw.source, raw.url);

        // Skip if already in DB
        if (existingHashes.has(hash)) continue;

        // Score
        const score = computeScore(raw, settings.positiveKeywords, settings.negativeKeywords);

        // Commute
        let commuteMinutes: number | null = null;
        let commuteStatus: 'pending' | 'ok' | 'error' | 'not_found' = 'pending';

        if (settings.navitiaApiKey && settings.commuteOriginAddress && raw.location) {
          const commuteResult = await getCommuteMinutes(
            settings.commuteOriginAddress,
            raw.location,
            settings.commuteDepartureTime,
            settings.navitiaApiKey
          );
          commuteStatus  = commuteResult.status;
          commuteMinutes = commuteResult.minutes;
          // Respect Navitia quota: 500ms between calls
          await delay(500);
        } else if (!raw.location) {
          commuteStatus = 'not_found';
        }

        // Insert into DB
        await db.execute(
          `INSERT OR IGNORE INTO job_offers
            (source, url, hash, title, company, location, contract_type,
             description_snippet, published_at, score, commute_minutes, commute_status,
             is_read, is_archived, kanban_id)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,0,0,NULL)`,
          [
            raw.source,
            raw.url,
            hash,
            raw.title,
            raw.company    ?? null,
            raw.location   ?? null,
            raw.contractType ?? null,
            raw.descriptionSnippet ?? null,
            raw.publishedAt ?? null,
            score,
            commuteMinutes,
            commuteStatus,
          ]
        );

        existingHashes.add(hash);
        result.newOffers++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Offre ${raw.url}: ${msg}`);
        console.error('[fetcher] Erreur insertion offre:', err);
      }
    }

    onProgress?.(config.source, `done (${result.newOffers} nouvelles)`);
    results.push(result);
  }

  return results;
}
