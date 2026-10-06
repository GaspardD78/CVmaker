/**
 * Revue de portefeuille — recouvrement, angles morts, verdicts par piste.
 *
 * Le recouvrement est mesuré et affiché **sans IA** : c'est un fait, pas une
 * opinion. Deux pistes qui ramènent les mêmes offres consomment du budget de
 * collecte pour rien tout en donnant l'illusion d'une recherche large, et
 * l'application doit pouvoir le dire seule.
 *
 * L'assistant n'intervient qu'ensuite, pour interpréter ces chiffres. Ses
 * recommandations sont affichées, jamais appliquées automatiquement : une
 * suggestion structurée s'applique piste par piste, sur décision explicite.
 */

import { dedupeOffers } from '@/lib/watcher/offer-dedup';
import { SCORER_VERSION } from '@/lib/watcher/scorer';
import { buildSourceCoverage, renderCoverageSection } from '@/lib/watcher/source-coverage';
import type { FetchLog, JobSource } from '@/types/job-watch';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useAuthStore } from '@/stores/authStore';
import {
  buildPortfolioReviewPrompt,
  extractJson,
  validatePortfolioReview,
  type PortfolioReview,
} from '@/lib/watcher/ai-portfolio';
import {
  computePortfolioMetrics,
  OVERLAP_WARNING_THRESHOLD,
  type PortfolioMetrics,
} from '@/lib/watcher/portfolio-metrics';

const VERDICT_LABELS: Record<string, string> = {
  keep:  'Conserver',
  tune:  'Ajuster',
  merge: 'Fusionner',
  drop:  'Abandonner',
};

const VERDICT_CLASSES: Record<string, string> = {
  keep:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  tune:  'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  merge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  drop:  'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

export function PortfolioReviewPanel() {
  const alerts = useJobWatchStore(s => s.alerts);
  const updateAlert = useJobWatchStore(s => s.updateAlert);
  const currentUserId = useAuthStore(s => s.currentUserId);

  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [review, setReview] = useState<PortfolioReview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    computePortfolioMetrics(alerts, currentUserId)
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, [alerts, currentUserId]);

  useEffect(load, [load]);

  const copyPrompt = async () => {
    if (!metrics) return;
    // Couverture par source de chaque piste : l'IA ne doit pas régler une source en panne.
    const { fetchLogs, configs, offers } = useJobWatchStore.getState();
    const coverages = alerts.map(alert => {
      const lastLogBySource = new Map<JobSource, FetchLog>();
      for (const log of fetchLogs) {
        if (log.alertId && log.alertId !== alert.id) continue;
        if (!lastLogBySource.has(log.source)) lastLogBySource.set(log.source, log);
      }
      const scoped = dedupeOffers(offers.filter(o => o.alerts.some(l => l.alertId === alert.id)));
      return {
        alertName: alert.name,
        section: renderCoverageSection(buildSourceCoverage({
          lastLogBySource,
          configuredSources: new Set(configs.filter(c => c.enabled === 1 && c.alertId === alert.id).map(c => c.source)),
          sampleSources: scoped.filter(o => (o.scoreVersion ?? 1) >= SCORER_VERSION).map(o => o.source),
        })),
      };
    });
    const prompt = buildPortfolioReviewPrompt(alerts, metrics, coverages);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Prompt de revue copié — collez-le dans votre assistant');
    } catch {
      toast.error('Copie impossible — sélectionnez le texte manuellement');
    }
  };

  const handleParse = () => {
    setParseError(null);
    setReview(null);
    try {
      setReview(validatePortfolioReview(extractJson(jsonInput)));
      setApplied(new Set());
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  /** Applique une suggestion structurée à la piste nommée, sur décision explicite. */
  const applySuggestion = async (item: PortfolioReview['perAlert'][number]) => {
    const target = alerts.find(a => a.name.trim().toLowerCase() === item.alertName.trim().toLowerCase());
    if (!target) {
      toast.error(`Piste « ${item.alertName} » introuvable`);
      return;
    }
    const changes = item.suggestedChanges;
    if (!changes) return;

    const dedupe = (values: string[]) => [...new Set(values.map(v => v.trim()).filter(Boolean))];
    const without = (values: string[], removed: string[] = []) => {
      const lower = new Set(removed.map(v => v.trim().toLowerCase()));
      return values.filter(v => !lower.has(v.trim().toLowerCase()));
    };

    const profile = target.searchProfile;
    await updateAlert(target.id, {
      searchProfile: {
        ...profile,
        jobTitles: dedupe([
          ...without(profile.jobTitles, changes.removeJobTitles),
          ...(changes.addJobTitles ?? []),
        ]),
        excludeTitles: dedupe([
          ...without(profile.excludeTitles, changes.removeExcludeTitles),
          ...(changes.addExcludeTitles ?? []),
        ]),
        scoring: changes.scoringMode ? { mode: changes.scoringMode } : profile.scoring,
      },
    });
    setApplied(prev => new Set([...prev, item.alertName]));
    toast.success(`Piste « ${target.name} » ajustée`);
  };

  if (alerts.length < 2) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        La revue de portefeuille compare les pistes entre elles : elle demande au moins deux pistes.
      </p>
    );
  }

  const strongOverlaps = (metrics?.overlaps ?? []).filter(o => o.sharedPercent >= OVERLAP_WARNING_THRESHOLD);

  return (
    <div className="space-y-3">
      {/* ── Mesures locales, sans IA ── */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Performance sur {metrics?.windowDays ?? 30} jours
        </p>
        <button
          type="button"
          onClick={load}
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label="Recalculer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {metrics && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <thead className="text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-1 pr-3 font-medium">Piste</th>
                <th className="py-1 pr-3 font-medium">Offres</th>
                <th className="py-1 pr-3 font-medium">Exclusives</th>
                <th className="py-1 pr-3 font-medium">Lues</th>
                <th className="py-1 pr-3 font-medium">Kanban</th>
                <th className="py-1 pr-3 font-medium">Archivées sans lecture</th>
                <th className="py-1 font-medium">Score médian</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-200">
              {metrics.perAlert.map(m => (
                <tr key={m.alertId} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1.5 pr-3 font-medium">{m.name}</td>
                  <td className="py-1.5 pr-3">{m.total}</td>
                  <td className="py-1.5 pr-3">{m.exclusive}</td>
                  <td className="py-1.5 pr-3">{m.readRate} %</td>
                  <td className="py-1.5 pr-3">{m.kanbanRate} %</td>
                  <td className="py-1.5 pr-3">{m.quickArchiveRate} %</td>
                  <td className="py-1.5">{m.medianScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {strongOverlaps.map(o => (
        <p
          key={`${o.alertIdA}-${o.alertIdB}`}
          className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5"
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            « {o.nameA} » et « {o.nameB} » partagent <strong>{o.sharedPercent} %</strong> de leurs
            offres ({o.shared} en commun) : l'une des deux n'élargit pas réellement votre recherche.
          </span>
        </p>
      ))}

      {/* ── Interprétation par l'assistant ── */}
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <button
          type="button"
          onClick={copyPrompt}
          disabled={!metrics}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Générer le prompt de revue
        </button>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Réponse de l'assistant (JSON)
          </span>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            rows={3}
            placeholder='{ "version": "1.0", "perAlert": [ … ] }'
            className="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono text-gray-800 dark:text-gray-100"
          />
        </label>

        <button
          type="button"
          onClick={handleParse}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Lire les recommandations
        </button>

        {parseError && (
          <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
            {parseError}
          </p>
        )}

        {review && (
          <div className="space-y-2">
            {review.perAlert.map(item => (
              <div key={item.alertName} className="rounded border border-gray-200 dark:border-gray-700 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${VERDICT_CLASSES[item.verdict]}`}>
                    {VERDICT_LABELS[item.verdict]}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.alertName}</span>
                </div>
                {item.why && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{item.why}</p>}

                {item.suggestedChanges && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {[
                        item.suggestedChanges.addJobTitles?.length ? `+${item.suggestedChanges.addJobTitles.length} intitulé(s)` : null,
                        item.suggestedChanges.removeJobTitles?.length ? `−${item.suggestedChanges.removeJobTitles.length} intitulé(s)` : null,
                        item.suggestedChanges.addExcludeTitles?.length ? `+${item.suggestedChanges.addExcludeTitles.length} exclusion(s)` : null,
                        item.suggestedChanges.scoringMode ? `scoring « ${item.suggestedChanges.scoringMode} »` : null,
                      ].filter(Boolean).join(' · ') || 'aucun changement structuré'}
                    </span>
                    <button
                      type="button"
                      disabled={applied.has(item.alertName)}
                      onClick={() => applySuggestion(item)}
                      className="px-2 py-1 rounded text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                    >
                      {applied.has(item.alertName) ? 'Appliqué' : 'Appliquer à cette piste'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {review.overlaps.length > 0 && (
              <div className="rounded border border-gray-200 dark:border-gray-700 p-2.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Redondances signalées</p>
                <ul className="mt-1 space-y-1">
                  {review.overlaps.map(o => (
                    <li key={`${o.alertA}-${o.alertB}`} className="text-xs text-gray-600 dark:text-gray-300">
                      <strong>{o.alertA} ↔ {o.alertB}</strong> ({o.sharedPercent} %) — {o.recommendation}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.blindSpots.length > 0 && (
              <div className="rounded border border-gray-200 dark:border-gray-700 p-2.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Angles morts</p>
                <ul className="mt-1 space-y-1">
                  {review.blindSpots.map(b => (
                    <li key={b.label} className="text-xs text-gray-600 dark:text-gray-300">
                      <strong>{b.label}</strong> — {b.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Ces recommandations ne sont jamais appliquées automatiquement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
