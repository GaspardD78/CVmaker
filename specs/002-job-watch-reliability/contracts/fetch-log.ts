/**
 * Contract: fetch log — types et fonctions exposés
 *
 * Nouveaux types et nouvelles fonctions du module watcher
 * pour la fonctionnalité de journalisation des collectes.
 */

import type { JobSource } from '@/types/job-watch';

// ── Type public ───────────────────────────────────────────────────────────────

/** Log d'une collecte pour une source donnée (retourné par jobWatchStore.loadFetchLogs) */
export interface FetchLog {
  id: string;
  source: JobSource;
  fetchedAt: string;      // ISO 8601 UTC
  offersFetched: number;
  offersNew: number;
  status: 'success' | 'error' | 'empty';
  errorMessage: string | null;
  durationMs: number;
}

// ── FetchResult enrichi ───────────────────────────────────────────────────────

/** Résultat retourné par runFetch pour chaque source (enrichi v3) */
export interface FetchResult {
  source: JobSource;
  newOffers: number;
  /** Nouveau : nombre total d'offres parsées avant dédup et filtrage minSaveScore */
  totalFetched: number;
  errors: string[];
  /** Nouveau : durée de collecte de cette source en ms */
  durationMs: number;
  /** Nouveau : statut calculé persisté dans job_watch_fetch_log */
  status: 'success' | 'error' | 'empty';
}

// ── jobWatchStore — méthodes ajoutées ─────────────────────────────────────────

/**
 * Contrat des méthodes ajoutées dans jobWatchStore.ts
 *
 * loadFetchLogs() :
 *   - Charge les 10 derniers logs par source depuis job_watch_fetch_log
 *   - Popule state.fetchLogs : FetchLog[]
 *   - Appelée au montage de HealthDashboard
 *
 * purgeOffers(minScore: number) :
 *   - Supprime toutes les offres en DB dont score < minScore
 *   - Réinitialise state.offers et state.totalCount
 *   - Appelée par le bouton "Purger" dans JobOffersView
 */
export interface JobWatchStoreFetchLogMethods {
  fetchLogs: FetchLog[];
  loadFetchLogs: () => Promise<void>;
  purgeOffers: (minScore: number) => Promise<number>; // retourne count supprimé
}

// ── Contrat d'insertion du log dans fetcher.ts ─────────────────────────────────

/**
 * Après chaque source dans runFetch, insérer un log :
 *
 * writeFetchLog(db, {
 *   source,
 *   offersFetched: rawOffers.length,
 *   offersNew: result.newOffers,
 *   status: calculé depuis errors et offersFetched,
 *   errorMessage: errors[0] ?? null,
 *   durationMs: Date.now() - startTime,
 * })
 *
 * Puis purger les anciennes entrées (garder les 50 plus récentes par source).
 */
export declare function writeFetchLog(
  db: unknown,
  entry: Omit<FetchLog, 'id' | 'fetchedAt'>,
): Promise<void>;
