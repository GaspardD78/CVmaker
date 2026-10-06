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
import { runFetch, type FetchProgressEvent } from '@/lib/watcher/fetcher';
import { buildDigestSections, sendDigestEmail } from '@/lib/watcher/email-digest';
import { decayLearnedDict } from '@/lib/watcher/learning-engine';
import { getCapturedDebugHtml, WEBVIEW_SOURCES } from '@/lib/watcher/selector-debug';
import { useScoreRecalcStore } from '@/stores/scoreRecalcStore';

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
    settingsLoaded,
    isFetching,
    setFetching,
    setFetchProgress,
    setError,
    fetchOffers,
    loadFetchLogs,
    updateLastFetchedAt,
    updateAlert,
    setSelectorDebugInfo,
    purgeExpiredOffers,
  } = useJobWatchStore();

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
    // Read ALL state live from the stores, never from the render closure.
    // Le timer d'auto-déclenchement (effet ci-dessous) peut se déclencher avec
    // une version de ce callback créée quand les configs étaient chargées mais
    // pas encore les alertes : la closure portait un profil de recherche vide
    // et la collecte partait sans mots-clés ni lieux — l'APEC renvoyait alors
    // les dernières offres génériques de toute la France.
    const { isFetching, configs, settings, alerts } = useJobWatchStore.getState();
    const profileId = useAuthStore.getState().currentUserId;
    if (isFetching) return;
    if (!configs.some(c => c.enabled === 1)) {
      if (!silent) toast.info('Aucune source active — configurez la Veille');
      return;
    }
    const activeAlerts = alerts.filter(a => a.enabled === 1);
    if (activeAlerts.length === 0) {
      if (!silent) toast.info('Aucune piste active — configurez la Veille');
      return;
    }

    setFetching(true);
    setError(null);

    // Décroissance temporelle du dictionnaire appris, piste par piste : chaque
    // exploration oublie à son propre rythme, sans que le volume d'une piste
    // dominante n'accélère l'oubli des autres.
    try {
      for (const alert of activeAlerts) {
        const { dict: decayed, decayedAt } = decayLearnedDict(alert.learnedDict, alert.learnedDecayedAt);
        if (decayedAt !== alert.learnedDecayedAt) {
          await updateAlert(alert.id, { learnedDict: decayed, learnedDecayedAt: decayedAt });
        }
      }
    } catch { /* non-critical — decay can be skipped */ }

    try {
      const onProgress = (event: FetchProgressEvent) => {
        const scope = event.alertName ? ` [${event.alertName}]` : '';
        console.debug(
          `[watcher] ${event.source}${scope}: ${event.status}`,
          event.current !== undefined ? `${event.current}/${event.total}` : '',
        );
        setFetchProgress(event);
      };

      const { results, newOffers, linkedOffers } = await runFetch(
        activeAlerts,
        configs,
        settings,
        onProgress,
        profileId,
      );

      // Push any captured debug HTML to the store so the UI can surface it
      for (const result of results) {
        if (WEBVIEW_SOURCES.has(result.source) && result.totalFetched === 0) {
          const capture = getCapturedDebugHtml(result.source);
          if (capture) setSelectorDebugInfo(result.source, capture);
        }
      }

      // Update last_fetched_at for each config, then for each alert
      for (const config of configs.filter(c => c.enabled === 1)) {
        await updateLastFetchedAt(config.id);
      }
      const collectedAt = new Date().toISOString();
      for (const alert of activeAlerts) {
        await updateAlert(alert.id, { lastFetchedAt: collectedAt });
      }

      // Nettoyage des offres périmées (plus anciennes que le seuil configuré) —
      // non bloquant. S'appuie sur published_at (sinon fetched_at) et conserve
      // les offres déjà importées dans le Kanban.
      if (settings.autoCleanExpiredEnabled) {
        try {
          await purgeExpiredOffers(settings.expiredMaxAgeDays);
        } catch (e) {
          console.warn('[useJobWatcher] nettoyage des offres périmées ignoré (non bloquant)', e);
        }
      }

      await fetchOffers();
      // Rafraîchit les logs de collecte pour que la table « Dernières collectes »
      // du HealthDashboard reflète ce run. Le dashboard vit dans un drawer
      // toujours monté qui ne charge les logs qu'au mount : sans ceci, il
      // continuerait d'afficher le statut du run précédent (p. ex. une erreur
      // APEC périmée après une collecte réussie).
      await loadFetchLogs();

      const hasErrors = results.some(r => r.errors.length > 0);

      if (!silent) {
        if (newOffers > 0) {
          const plural = newOffers > 1 ? 's' : '';
          // `linkedOffers` : offres déjà en base qu'une piste vient de capter —
          // rien n'a été inséré, mais elles apparaissent dans sa liste.
          const linked = linkedOffers > 0 ? ` (+ ${linkedOffers} rattachée${linkedOffers > 1 ? 's' : ''} à une piste)` : '';
          toast.success(`${newOffers} nouvelle${plural} offre${plural} détectée${plural}${linked}`);
        } else if (linkedOffers > 0) {
          toast.success(`${linkedOffers} offre${linkedOffers > 1 ? 's' : ''} déjà en base rattachée${linkedOffers > 1 ? 's' : ''} à une piste`);
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
      if (newOffers > 0 && settings.emailDigestEnabled && settings.emailTo) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const digestSentKey = `resumeforge_digest_sent_${todayKey}`;
        if (!localStorage.getItem(digestSentKey)) {
          try {
            const { useJobWatchStore: store } = await import('@/stores/jobWatchStore');
            const state = store.getState();
            const unread = state.offers
              .filter(o => o.isRead === 0 && o.isArchived === 0)
              .slice(0, 50);
            // Une section par piste : le digest se lit piste par piste, et une
            // offre captée par plusieurs d'entre elles n'y figure qu'une fois.
            await sendDigestEmail(buildDigestSections(unread, state.alerts), settings);
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
  }, [setFetching, setFetchProgress, setError, fetchOffers, loadFetchLogs, updateLastFetchedAt, updateAlert, setSelectorDebugInfo, purgeExpiredOffers]);

  // Recalcul des scores en tâche de fond quand la version du scorer a changé
  // (offres des 60 derniers jours) — une seule instance, comme le scheduler.
  const alertCount = useJobWatchStore(s => s.alerts.length);
  useEffect(() => {
    if (!isScheduler.current || !settingsLoaded || alertCount === 0) return;
    const timeout = setTimeout(() => { void useScoreRecalcStore.getState().run(); }, 5_000);
    return () => clearTimeout(timeout);
  }, [settingsLoaded, alertCount]);

  // Auto-trigger on mount if data is stale — only the scheduler instance runs this.
  useEffect(() => {
    if (!isScheduler.current) return;
    // Ne rien programmer tant que les settings ne sont pas chargés : sinon la
    // collecte partirait avec le profil de recherche par défaut (vide).
    if (!settingsLoaded) return;
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
  }, [configs.length, settings.fetchIntervalHours, settingsLoaded]);

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
