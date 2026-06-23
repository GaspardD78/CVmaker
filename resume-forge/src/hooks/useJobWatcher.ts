/**
 * Hook React gérant le cycle de collecte automatique des offres.
 *
 * - Déclenche une collecte au montage si la dernière collecte remonte à plus de N heures
 * - Relance automatiquement toutes les N heures (configurable)
 * - Expose `triggerFetch` pour une collecte manuelle
 *
 * Le hook peut être appelé depuis plusieurs composants (App + JobOffersView).
 * Seule la première instance montée reçoit la responsabilité du scheduler
 * (auto-trigger + intervalle périodique). Les autres instances partagent
 * `triggerFetch` mais n'ajoutent pas de minuteries supplémentaires.
 */

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useAuthStore } from '@/stores/authStore';
import { runFetch, FetchResult } from '@/lib/watcher/fetcher';
import { sendDigestEmail } from '@/lib/watcher/email-digest';
import { decayLearnedDict, LearnedDictionary } from '@/lib/watcher/learning-engine';
import { getCapturedDebugHtml, WEBVIEW_SOURCES } from '@/lib/watcher/selector-debug';
import { getDb } from '@/lib/db';
import type { JobSource, JobOffer } from '@/types/job-watch';

// Only one mounted instance owns the auto-trigger + periodic scheduler.
let schedulerOwned = false;

/** Remove digest dedup keys older than 7 days to keep localStorage tidy. */
function pruneOldDigestKeys(todayKey: string): void {
  const cutoff = new Date(todayKey);
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('resumeforge_digest_sent_')) {
      const dateStr = key.slice('resumeforge_digest_sent_'.length);
      if (dateStr < cutoffKey) localStorage.removeItem(key);
    }
  }
}

export function useJobWatcher() {
  const {
    configs,
    settings,
    isFetching,
    setFetching,
    setFetchProgress,
    setError,
    fetchOffers,
    loadFetchLogs,
    updateLastFetchedAt,
    setSelectorDebugInfo,
  } = useJobWatchStore();

  const profileId = useAuthStore(s => s.currentUserId);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // True only for the instance that claimed the scheduler slot
  const isScheduler = useRef(false);

  // Claim the scheduler slot on mount; release on unmount.
  useEffect(() => {
    if (!schedulerOwned) {
      schedulerOwned = true;
      isScheduler.current = true;
    }
    return () => {
      if (isScheduler.current) {
        schedulerOwned = false;
        isScheduler.current = false;
      }
    };
  }, []);

  const triggerFetch = useCallback(async (silent = false) => {
    // Read isFetching from the store live to avoid stale-closure race when
    // the hook is mounted in multiple components simultaneously.
    if (useJobWatchStore.getState().isFetching) return;
    if (!configs.some(c => c.enabled === 1)) {
      if (!silent) toast.info('Aucune source active — configurez la Veille');
      return;
    }

    setFetching(true);
    setError(null);

    // Apply time-decay to learned dictionary before scoring (scoped to profile)
    try {
      const db = await getDb();
      const pid = profileId ?? '';
      const rows = await db.select<{ key: string; profile_id: string; value: string }[]>(
        `SELECT key, profile_id, value FROM job_watch_settings
         WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'learned_dict_decayed_at')
         AND (profile_id = '' OR profile_id = ?1)`,
        [pid],
      );
      const map: Record<string, string> = {};
      for (const r of rows.filter(x => x.profile_id === '')) map[r.key] = r.value;
      for (const r of rows.filter(x => x.profile_id !== '')) map[r.key] = r.value;

      const dict: LearnedDictionary = {
        positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
        negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
      };
      const { dict: decayed, decayedAt } = decayLearnedDict(dict, map['learned_dict_decayed_at'] ?? null);
      if (decayedAt !== map['learned_dict_decayed_at']) {
        await db.execute(
          `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('learned_dict_positive', ?1, ?2)
           ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
          [pid, JSON.stringify(decayed.positive)]
        );
        await db.execute(
          `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('learned_dict_negative', ?1, ?2)
           ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
          [pid, JSON.stringify(decayed.negative)]
        );
        await db.execute(
          `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('learned_dict_decayed_at', ?1, ?2)
           ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
          [pid, decayedAt]
        );
      }
    } catch { /* non-critical — decay can be skipped */ }

    try {
      const onProgress = (source: JobSource, status: string, current?: number, total?: number) => {
        console.debug(`[watcher] ${source}: ${status}`, current !== undefined ? `${current}/${total}` : '');
        setFetchProgress({ source, status, current, total });
      };

      const results: FetchResult[] = await runFetch(configs, settings, onProgress, profileId);

      // Push any captured debug HTML to the store so the UI can surface it
      for (const result of results) {
        if (WEBVIEW_SOURCES.has(result.source) && result.totalFetched === 0) {
          const capture = getCapturedDebugHtml(result.source);
          if (capture) setSelectorDebugInfo(result.source, capture);
        }
      }

      // Update last_fetched_at for each config
      for (const config of configs.filter(c => c.enabled === 1)) {
        await updateLastFetchedAt(config.id);
      }

      await fetchOffers();
      // Rafraîchit les logs de collecte pour que la table « Dernières collectes »
      // du HealthDashboard reflète ce run. Le dashboard vit dans un drawer
      // toujours monté qui ne charge les logs qu'au mount : sans ceci, il
      // continuerait d'afficher le statut du run précédent (p. ex. une erreur
      // APEC périmée après une collecte réussie).
      await loadFetchLogs();

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

      // Send email digest if new offers detected and digest enabled.
      // Dedup key lives in localStorage so multiple windows/tabs share it
      // and it survives restarts (sessionStorage reset across tabs caused
      // duplicate digests — see https://…integrate-first2apply C3).
      if (totalNew > 0 && settings.emailDigestEnabled && settings.emailTo) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const digestSentKey = `resumeforge_digest_sent_${todayKey}`;
        if (!localStorage.getItem(digestSentKey)) {
          try {
            const { useJobWatchStore: store } = await import('@/stores/jobWatchStore');
            const newOffersList: JobOffer[] = store.getState().offers
              .filter(o => o.isRead === 0 && o.isArchived === 0)
              .slice(0, 50);
            await sendDigestEmail(newOffersList, settings);
            localStorage.setItem(digestSentKey, '1');
            pruneOldDigestKeys(todayKey);
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
  }, [configs, settings, setFetching, setFetchProgress, setError, fetchOffers, loadFetchLogs, updateLastFetchedAt, setSelectorDebugInfo, profileId]);

  // Auto-trigger on mount if data is stale — only the scheduler instance runs this.
  useEffect(() => {
    if (!isScheduler.current) return;
    if (configs.length === 0) return;

    const intervalMs = settings.fetchIntervalHours * 60 * 60 * 1000;
    const now        = Date.now();
    // Read lastFetchedAt from the store directly to avoid the stale-closure
    // problem when configs.length changes after a fetch (e.g. user adds a source).
    const stored     = useJobWatchStore.getState().lastFetchedAt;
    const lastMs     = stored ? new Date(stored).getTime() : 0;
    const staleness  = now - lastMs;

    if (staleness >= intervalMs) {
      // Delay 3s after app start to avoid fetch during initialization
      const timeout = setTimeout(() => triggerFetch(true), 3_000);
      return () => clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs.length, settings.fetchIntervalHours]);

  // Periodic scheduler — only the scheduler instance runs this.
  useEffect(() => {
    if (!isScheduler.current) return;

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
