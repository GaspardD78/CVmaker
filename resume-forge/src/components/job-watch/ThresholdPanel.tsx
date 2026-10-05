import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { getDb } from '@/lib/db';
import {
  APPRECIATION_WINDOW_DAYS, hiddenByThreshold, suggestThreshold, type ThresholdOffer,
} from '@/lib/watcher/threshold-analysis';

interface Props {
  /** Offres de la piste analysée, déjà dédoublonnées. */
  offers: ThresholdOffer[];
}

/**
 * Seuil de score : valeurs actuelles, offres masquées, seuil suggéré (spec 006, phase 8).
 *
 * Les offres écartées à la collecte ne sont pas conservées : seules celles que
 * le seuil d'affichage masque peuvent être listées.
 */
export function ThresholdPanel({ offers }: Props) {
  const { settings, saveSettings, filters, setFilters } = useJobWatchStore();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ offer_id: string }[]>(
          `SELECT DISTINCT offer_id FROM job_offer_feedback
           WHERE action IN ('thumbs_up', 'kanban_import')
             AND substr(created_at, 1, 10) >= ?1`,
          [new Date(Date.now() - APPRECIATION_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)],
        );
        if (!cancelled) setLikedIds(new Set(rows.map(r => r.offer_id)));
      } catch {
        // Table absente avant migration : la suggestion se base alors sur le Kanban seul.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const displayMin = filters.minScore;
  const saveMin = settings.minSaveScore;
  const effectiveMin = Math.max(displayMin, saveMin);

  const hidden = useMemo(() => hiddenByThreshold(offers, effectiveMin), [offers, effectiveMin]);
  const suggestion = useMemo(
    () => suggestThreshold(offers, likedIds, effectiveMin),
    [offers, likedIds, effectiveMin],
  );

  const applyDisplay = () => {
    if (!suggestion) return;
    setFilters({ minScore: suggestion.threshold });
    toast.success(`Seuil d'affichage réglé à ${suggestion.threshold} pts (réversible dans les filtres)`);
  };

  const applyCollect = async () => {
    if (!suggestion) return;
    await saveSettings({ ...settings, minSaveScore: suggestion.threshold });
    toast.success(`Seuil de sauvegarde réglé à ${suggestion.threshold} pts`);
  };

  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs space-y-1.5 text-amber-900 dark:text-amber-200">
      <p>
        Seuil actuel : <strong>{saveMin} pts</strong> à la collecte (offres en dessous non conservées) ·
        {' '}<strong>{displayMin} pts</strong> à l'affichage.
        {' '}<strong>{hidden.length}</strong> offre{hidden.length > 1 ? 's' : ''} masquée{hidden.length > 1 ? 's' : ''} parmi celles déjà enregistrées.
      </p>

      {hidden.length > 0 && (
        <button
          onClick={() => setShowHidden(v => !v)}
          className="font-semibold underline underline-offset-2"
        >
          {showHidden ? 'Masquer la liste' : 'Voir les offres masquées'}
        </button>
      )}

      {showHidden && (
        <ul className="max-h-40 overflow-y-auto divide-y divide-amber-200/60 dark:divide-amber-700/30 rounded border border-amber-200/60 dark:border-amber-700/30 bg-white/60 dark:bg-gray-900/30">
          {hidden.slice(0, 50).map(o => (
            <li key={o.id} className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="truncate">{o.title}{o.company ? ` — ${o.company}` : ''}</span>
              <span className="font-semibold tabular-nums">{Math.round(o.score)}</span>
            </li>
          ))}
        </ul>
      )}

      {suggestion ? (
        <div className="space-y-1">
          <p>
            Seuil suggéré : <strong>{suggestion.threshold} pts</strong>, qui garde les {suggestion.appreciated} offre{suggestion.appreciated > 1 ? 's' : ''}
            {' '}importée{suggestion.appreciated > 1 ? 's' : ''} ou aimée{suggestion.appreciated > 1 ? 's' : ''} des {APPRECIATION_WINDOW_DAYS} derniers jours.
            {' '}Aperçu : {suggestion.visibleAfter} offre{suggestion.visibleAfter > 1 ? 's' : ''} visible{suggestion.visibleAfter > 1 ? 's' : ''} (au lieu de {suggestion.visibleNow}).
          </p>
          <div className="flex gap-3">
            <button onClick={applyDisplay} className="font-semibold underline underline-offset-2">Appliquer à l'affichage</button>
            <button onClick={() => void applyCollect()} className="font-semibold underline underline-offset-2">Appliquer à la collecte</button>
          </div>
        </div>
      ) : (
        <p className="text-amber-700/80 dark:text-amber-300/80">
          Pas assez d'offres importées ou aimées récemment pour suggérer un seuil.
        </p>
      )}
    </div>
  );
}
