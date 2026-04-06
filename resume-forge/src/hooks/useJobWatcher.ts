/**
 * Hook React gérant le cycle de collecte automatique des offres.
 *
 * - Déclenche une collecte au montage si la dernière collecte remonte à plus de N heures
 * - Relance automatiquement toutes les N heures (configurable)
 * - Expose `triggerFetch` pour une collecte manuelle
 */

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { runFetch, FetchResult } from '@/lib/watcher/fetcher';
import { sendDigestEmail } from '@/lib/watcher/email-digest';
import { decayLearnedDict, LearnedDictionary } from '@/lib/watcher/learning-engine';
import { getDb } from '@/lib/db';
import type { JobSource, JobOffer } from '@/types/job-watch';

export function useJobWatcher() {
  const {
    configs,
    settings,
    isFetching,
    setFetching,
    setError,
    fetchOffers,
    updateLastFetchedAt,
    lastFetchedAt,
  } = useJobWatchStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerFetch = useCallback(async (silent = false) => {
    if (isFetching) return;
    if (!configs.some(c => c.enabled === 1)) {
      if (!silent) toast.info('Aucune source active — configurez la Veille');
      return;
    }

    setFetching(true);
    setError(null);

    // Apply time-decay to learned dictionary before scoring
    try {
      const db = await getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        `SELECT key, value FROM job_watch_settings WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'learned_dict_decayed_at')`
      );
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;

      const dict: LearnedDictionary = {
        positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
        negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
      };
      const { dict: decayed, decayedAt } = decayLearnedDict(dict, map['learned_dict_decayed_at'] ?? null);
      if (decayedAt !== map['learned_dict_decayed_at']) {
        await db.execute(
          `INSERT INTO job_watch_settings (key, value) VALUES ('learned_dict_positive', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`,
          [JSON.stringify(decayed.positive)]
        );
        await db.execute(
          `INSERT INTO job_watch_settings (key, value) VALUES ('learned_dict_negative', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`,
          [JSON.stringify(decayed.negative)]
        );
        await db.execute(
          `INSERT INTO job_watch_settings (key, value) VALUES ('learned_dict_decayed_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`,
          [decayedAt]
        );
      }
    } catch { /* non-critical — decay can be skipped */ }

    try {
      const onProgress = (source: JobSource, status: string) => {
        console.debug(`[watcher] ${source}: ${status}`);
      };

      const results: FetchResult[] = await runFetch(configs, settings, onProgress);

      // Update last_fetched_at for each config
      for (const config of configs.filter(c => c.enabled === 1)) {
        await updateLastFetchedAt(config.id);
      }

      await fetchOffers();

      const totalNew  = results.reduce((acc, r) => acc + r.newOffers, 0);
      const hasErrors = results.some(r => r.errors.length > 0);

      if (!silent) {
        if (totalNew > 0) {
          toast.success(`${totalNew} nouvelle${totalNew > 1 ? 's' : ''} offre${totalNew > 1 ? 's' : ''} détectée${totalNew > 1 ? 's' : ''}`);
        } else {
          toast.info('Aucune nouvelle offre détectée');
        }
      }

      if (hasErrors) {
        const errorSources = results
          .filter(r => r.errors.length > 0)
          .map(r => r.source)
          .join(', ');
        toast.warning(`Erreurs sur : ${errorSources}`);
      }

      // Send email digest if new offers detected and digest enabled
      if (totalNew > 0 && settings.emailDigestEnabled && settings.emailTo) {
        // Get today's ISO date to check if digest already sent
        const todayKey = new Date().toISOString().slice(0, 10);
        const digestSentKey = `resumeforge_digest_sent_${todayKey}`;
        if (!sessionStorage.getItem(digestSentKey)) {
          try {
            const { useJobWatchStore: store } = await import('@/stores/jobWatchStore');
            const newOffersList: JobOffer[] = store.getState().offers
              .filter(o => o.isRead === 0 && o.isArchived === 0)
              .slice(0, 50);
            await sendDigestEmail(newOffersList, settings);
            sessionStorage.setItem(digestSentKey, '1');
          } catch (err) {
            console.error('[useJobWatcher] Erreur envoi digest:', err);
            toast.error(`Digest email : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      if (!silent) toast.error(`Erreur collecte : ${msg}`);
      console.error('[useJobWatcher] Erreur:', err);
    } finally {
      setFetching(false);
    }
  }, [configs, settings, isFetching, setFetching, setError, fetchOffers, updateLastFetchedAt]);

  // Auto-trigger on mount if data is stale
  useEffect(() => {
    if (configs.length === 0) return;

    const intervalMs = settings.fetchIntervalHours * 60 * 60 * 1000;
    const now        = Date.now();
    const lastMs     = lastFetchedAt ? new Date(lastFetchedAt).getTime() : 0;
    const staleness  = now - lastMs;

    if (staleness >= intervalMs) {
      // Delay 3s after app start to avoid fetch during initialization
      const timeout = setTimeout(() => triggerFetch(true), 3_000);
      return () => clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs.length, settings.fetchIntervalHours]);

  // Periodic scheduler
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const intervalMs = settings.fetchIntervalHours * 60 * 60 * 1000;
    intervalRef.current = setInterval(() => {
      triggerFetch(true);
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings.fetchIntervalHours, triggerFetch]);

  return { triggerFetch, isFetching };
}
