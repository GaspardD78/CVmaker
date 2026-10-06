import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { useAuthStore } from '@/stores/authStore';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { countOffersToRecalc, recalculateScores } from '@/lib/watcher/score-recalc';
import { SCORER_VERSION } from '@/lib/watcher/scorer';

const SUMMARY_KEY = 'watch_recalc_summary';
const DISMISSED_KEY = 'watch_recalc_dismissed';

interface Summary { version: number; count: number }

function readSummary(): Summary | null {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as Summary) : null;
  } catch {
    return null;
  }
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === String(SCORER_VERSION);
  } catch {
    return false;
  }
}

interface ScoreRecalcState {
  running: boolean;
  done: number;
  total: number;
  /** Offres recalculées lors du dernier passage de la version courante. */
  recalculatedCount: number | null;
  bannerDismissed: boolean;
  error: string | null;
  /** Lance le recalcul (automatique au démarrage, ou forcé par le bouton). */
  run: (opts?: { force?: boolean }) => Promise<void>;
  dismissBanner: () => void;
}

export const useScoreRecalcStore = create<ScoreRecalcState>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  recalculatedCount: readSummary()?.version === SCORER_VERSION ? readSummary()!.count : null,
  bannerDismissed: readDismissed(),
  error: null,

  run: async (opts) => {
    if (get().running) return;
    const alerts = useJobWatchStore.getState().alerts;
    if (alerts.length === 0) return;

    const force = opts?.force ?? false;
    try {
      const db = await getDb();
      const profileId = useAuthStore.getState().currentUserId ?? null;
      if (!force && (await countOffersToRecalc(db, profileId)) === 0) return;

      set({ running: true, done: 0, total: 0, error: null, bannerDismissed: false });
      try { localStorage.removeItem(DISMISSED_KEY); } catch { /* préférence facultative */ }

      const result = await recalculateScores({
        alerts, profileId, db, force,
        onProgress: ({ done, total }) => set({ done, total }),
      });

      try {
        localStorage.setItem(SUMMARY_KEY, JSON.stringify({ version: SCORER_VERSION, count: result.recalculated }));
      } catch { /* préférence facultative */ }
      set({ running: false, recalculatedCount: result.recalculated });
      await useJobWatchStore.getState().fetchOffers();
    } catch (err) {
      console.warn('[score-recalc] recalcul interrompu (non bloquant):', err);
      set({ running: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  dismissBanner: () => {
    try { localStorage.setItem(DISMISSED_KEY, String(SCORER_VERSION)); } catch { /* préférence facultative */ }
    set({ bannerDismissed: true });
  },
}));
