import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Circle, Clock, Eye, Info, Target, TrendingUp, Wrench, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import { analyzeFeedback, getBlacklistSuggestions, getKeywordSuggestions, LearningResult } from '@/lib/watcher/learning-engine';
import { generatePerformanceOptimizationPrompt, generateDiagnosticPrompt } from '@/lib/prompt-templates';
import { getDb } from '@/lib/db';
import type { JobSource, FetchLog } from '@/types/job-watch';

// ── Constants ─────────────────────────────────────────────────────────────────

import { RECOMMENDED_SOURCES, SOURCE_LABELS } from '@/lib/watcher/sources';
import { WEBVIEW_SOURCES } from '@/lib/watcher/selector-debug';
import { SelectorDebugPanel } from './SelectorDebugPanel';

// ── Sub-components ────────────────────────────────────────────────────────────

interface MetricTileProps {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  unit: string;
  subtitle?: string;
  alert?: string | null;
}

function MetricTile({ icon, label, value, unit, subtitle, alert }: MetricTileProps) {
  const hasAlert = Boolean(alert);
  return (
    <div
      className={`rounded-md p-2.5 ${
        hasAlert
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50'
          : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-xl font-bold ${
            hasAlert
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-800 dark:text-gray-100'
          }`}
        >
          {value ?? '—'}
        </span>
        {value !== null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{unit}</span>
        )}
      </div>
      {subtitle && !hasAlert && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
      )}
      {alert && (
        <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
          {alert}
        </p>
      )}
    </div>
  );
}

interface SuggestionAlertProps {
  type: 'positive' | 'negative';
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}

function SuggestionAlert({ type, message, actionLabel, onAction, onDismiss }: SuggestionAlertProps) {
  const bg =
    type === 'negative'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40 text-red-800 dark:text-red-300'
      : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/40 text-emerald-800 dark:text-emerald-300';
  const actionCls =
    type === 'negative'
      ? 'text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200'
      : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200';

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded border text-xs ${bg}`}>
      <span className="flex-1">{message}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={onAction} className={`font-semibold underline underline-offset-2 ${actionCls}`}>
          {actionLabel}
        </button>
        <button
          onClick={onDismiss}
          aria-label="Ignorer"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Fetch log status badge ────────────────────────────────────────────────────

type FetchStatus = 'success' | 'error' | 'empty' | 'unconfigured' | 'pending';

function StatusBadge({ status }: { status: FetchStatus }) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Succès
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          <XCircle className="w-3 h-3" />
          Erreur
        </span>
      );
    case 'empty':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Circle className="w-3 h-3" />
          Vide
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 dark:text-blue-400">
          <Clock className="w-3 h-3" />
          En attente
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
          <Circle className="w-3 h-3" />
          Non configurée
        </span>
      );
  }
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'à l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `il y a ${diffD} j`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function HealthDashboard({ alwaysExpanded = false }: { alwaysExpanded?: boolean }) {
  const { offers, configs, settings, fetchLogs, loadFetchLogs, saveSettings, selectorDebugInfo, selectorOverrides } = useJobWatchStore();
  const { profile, entries } = useProfileStore();

  const [analysis, setAnalysis]   = useState<LearningResult | null>(null);
  const [expanded, setExpanded]   = useState(alwaysExpanded);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
  const [expandedSource, setExpandedSource] = useState<JobSource | null>(null);
  const [debugSource, setDebugSource] = useState<JobSource | null>(null);
  const [scoringInfoDismissed, setScoringInfoDismissed] = useState(
    () => localStorage.getItem('scoring_info_dismissed') === '1'
  );

  useEffect(() => {
    analyzeFeedback()
      .then(setAnalysis)
      .catch(() => setAnalysis(null));

    loadFetchLogs();

    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ value: string }[]>(
          `SELECT value FROM job_watch_settings WHERE key = 'company_reputation'`
        );
        if (rows[0]) {
          const rep = JSON.parse(rows[0].value);
          setCompanySuggestions(getBlacklistSuggestions(rep));
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  // ── Metrics ───────────────────────────────────────────────────────────────────

  const weekCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  const { volume, volumeAlert, pertinence, conversion, conversionAlert } = useMemo(() => {
    const volume = offers.filter(o => o.fetchedAt >= weekCutoff).length;
    const active  = offers.filter(o => o.isArchived === 0);
    const total   = active.length;
    const read    = active.filter(o => o.isRead === 1).length;
    const kanban  = active.filter(o => o.kanbanId !== null).length;
    return {
      volume,
      volumeAlert:     volume < 10,
      pertinence:      total > 0 ? Math.round((read   / total) * 100) : null,
      conversion:      total > 0 ? Math.round((kanban / total) * 100) : null,
      conversionAlert: total > 0 && kanban / total < 0.05,
    };
  }, [offers, weekCutoff]);

  // ── Fetch log helpers ─────────────────────────────────────────────────────────

  const configuredSources = useMemo(
    () => new Set(configs.filter(c => c.enabled === 1).map(c => c.source)),
    [configs]
  );

  // Last log per source
  const lastLogBySource = useMemo(() => {
    const map = new Map<JobSource, FetchLog>();
    for (const log of fetchLogs) {
      if (!map.has(log.source)) map.set(log.source, log);
    }
    return map;
  }, [fetchLogs]);

  // 10 most recent logs per source for history expand
  const historyBySource = useMemo(() => {
    const map = new Map<JobSource, FetchLog[]>();
    for (const log of fetchLogs) {
      const arr = map.get(log.source) ?? [];
      if (arr.length < 10) {
        arr.push(log);
        map.set(log.source, arr);
      }
    }
    return map;
  }, [fetchLogs]);

  // ── Learning suggestions ──────────────────────────────────────────────────────

  const suggestExclude = useMemo(() => {
    if (!analysis) return [];
    const already = new Set([
      ...settings.searchProfile.excludeTitles.map(k => k.toLowerCase()),
      ...settings.searchProfile.excludeDomains.map(k => k.toLowerCase()),
    ]);
    return analysis.suggestedExclusions
      .filter(t => !already.has(t) && !dismissed.has(`excl:${t}`))
      .slice(0, 5);
  }, [analysis, settings, dismissed]);

  const suggestBonus = useMemo(() => {
    if (!analysis) return [];
    const already = new Set([
      ...settings.searchProfile.jobTitles.map(k => k.toLowerCase()),
      ...settings.searchProfile.domains.map(k => k.toLowerCase()),
    ]);
    return analysis.suggestedBonusTerms
      .filter(t => !already.has(t) && !dismissed.has(`bonus:${t}`))
      .slice(0, 5);
  }, [analysis, settings, dismissed]);

  const suggestBlacklist = useMemo(() => {
    const already = new Set(settings.searchProfile.blacklistedCompanies.map(c => c.toLowerCase()));
    return companySuggestions.filter(c => !already.has(c) && !dismissed.has(`bl:${c}`));
  }, [companySuggestions, settings.searchProfile.blacklistedCompanies, dismissed]);

  const hasAlerts =
    volumeAlert || conversionAlert || suggestExclude.length > 0 || suggestBonus.length > 0 || suggestBlacklist.length > 0;

  const noJobTitles = settings.searchProfile.jobTitles.length === 0;

  useEffect(() => {
    if (hasAlerts) setExpanded(true);
  }, [hasAlerts]);

  // ── Action handlers ────────────────────────────────────────────────────────────

  const dismiss = (key: string) =>
    setDismissed(prev => new Set([...prev, key]));

  const handleExcludeTerm = async (term: string) => {
    await saveSettings({
      ...settings,
      searchProfile: {
        ...settings.searchProfile,
        excludeTitles: [...settings.searchProfile.excludeTitles, term],
      },
    });
    dismiss(`excl:${term}`);
  };

  const handleAddBonus = async (term: string) => {
    await saveSettings({
      ...settings,
      searchProfile: {
        ...settings.searchProfile,
        domains: [...settings.searchProfile.domains, term],
      },
    });
    dismiss(`bonus:${term}`);
  };

  const handleBlacklistCompany = async (company: string) => {
    await saveSettings({
      ...settings,
      searchProfile: {
        ...settings.searchProfile,
        blacklistedCompanies: [...settings.searchProfile.blacklistedCompanies, company],
      },
    });
    dismiss(`bl:${company}`);
  };

  const handleDismissScoringInfo = () => {
    localStorage.setItem('scoring_info_dismissed', '1');
    setScoringInfoDismissed(true);
  };

  const handlePerformancePrompt = async () => {
    const db = await getDb();
    const posRaw = await db.select<{ value: string }[]>(
      `SELECT value FROM job_watch_settings WHERE key = 'learned_dict_positive'`
    );
    const negRaw = await db.select<{ value: string }[]>(
      `SELECT value FROM job_watch_settings WHERE key = 'learned_dict_negative'`
    );
    const dict = {
      positive: posRaw[0] ? JSON.parse(posRaw[0].value) : {},
      negative: negRaw[0] ? JSON.parse(negRaw[0].value) : {},
    };
    const suggestions = getKeywordSuggestions(dict, 3);
    const prompt = generatePerformanceOptimizationPrompt(
      profile, entries, settings.searchProfile,
      {
        volumePerWeek: volume,
        pertinencePercent: pertinence,
        conversionPercent: conversion,
        learnedPositive: suggestions.positive.slice(0, 5),
        learnedNegative: suggestions.negative.slice(0, 5),
      },
    );
    await navigator.clipboard.writeText(prompt);
    toast.success("Prompt d'optimisation copié ! Collez-le dans votre IA.");
  };

  const handleDiagnosticPrompt = async () => {
    const db = await getDb();
    const rows = await db.select<{ title: string; score: number; action: string | null }[]>(`
      SELECT o.title, o.score, f.action
      FROM job_offers o
      LEFT JOIN job_offer_feedback f ON f.offer_id = o.id
      ORDER BY o.fetched_at DESC
      LIMIT 20
    `);
    const prompt = generateDiagnosticPrompt(settings.searchProfile, rows);
    await navigator.clipboard.writeText(prompt);
    toast.success('Prompt diagnostic copié ! Collez-le dans votre IA.');
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className={`${
      alwaysExpanded
        ? '' // no card wrapper in drawer mode
        : 'mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden'
    }`}>
      {/* Toggle header — hidden in drawer mode */}
      {!alwaysExpanded && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Santé de la recherche
            </span>
            {hasAlerts && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                aria-label="Alertes actives"
              />
            )}
          </div>
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
      )}

      {/* Body */}
      {(expanded || alwaysExpanded) && (
        <div className={alwaysExpanded ? 'space-y-3' : 'border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3'}>

          {/* Warning: no jobTitles configured */}
          {noJobTitles && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Aucun titre de poste cible configuré — tous les scores démarreront à 50 (mode permissif).
                Configurez des intitulés dans votre profil de recherche pour des résultats plus pertinents.
              </span>
            </div>
          )}

          {/* Scoring update info banner */}
          {!scoringInfoDismissed && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 text-xs text-blue-700 dark:text-blue-300">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Le scoring a été mis à jour. Les offres précédentes conservent leur score d'origine.</span>
              </div>
              <button
                onClick={handleDismissScoringInfo}
                aria-label="Fermer"
                className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 3 metric tiles */}
          <div className="grid grid-cols-3 gap-3">
            <MetricTile
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Volume / semaine"
              value={volume}
              unit="offres"
              alert={volumeAlert ? 'Trop peu — élargir le domaine ?' : null}
            />
            <MetricTile
              icon={<Eye className="w-3.5 h-3.5" />}
              label="Pertinence"
              value={pertinence}
              unit="%"
              subtitle="offres ouvertes"
            />
            <MetricTile
              icon={<Target className="w-3.5 h-3.5" />}
              label="Conversion"
              value={conversion}
              unit="%"
              subtitle="importées Kanban"
              alert={conversionAlert ? 'Score minimum trop élevé ?' : null}
            />
          </div>

          {/* Dernières collectes table */}
          <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 dark:text-gray-500 mb-1.5">
              Dernières collectes
            </p>
            <div className="rounded-md border border-gray-100 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <th className="px-3 py-1.5 text-left font-medium">Source</th>
                    <th className="px-3 py-1.5 text-left font-medium">Statut</th>
                    <th className="px-2 py-1.5 text-right font-medium">Récup.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Nouvelles</th>
                    <th className="px-3 py-1.5 text-right font-medium">Date</th>
                    <th className="px-2 py-1.5 w-6" />
                    <th className="px-2 py-1.5 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {RECOMMENDED_SOURCES.map(source => {
                    const log = lastLogBySource.get(source);
                    const isConfigured = configuredSources.has(source);
                    const status: FetchStatus = log
                      ? log.status
                      : isConfigured ? 'pending' : 'unconfigured';
                    const history = historyBySource.get(source) ?? [];
                    const isExpanded = expandedSource === source;

                    const hasDebugInfo = WEBVIEW_SOURCES.has(source) && Boolean(selectorDebugInfo[source]);
                    const hasOverride  = Boolean(selectorOverrides[source]);
                    const isDebugExpanded = debugSource === source;

                    return (
                      <Fragment key={source}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                            {SOURCE_LABELS[source]}
                          </td>
                          <td className="px-3 py-2">
                            {log?.errorMessage ? (
                              <span title={log.errorMessage}>
                                <StatusBadge status={status} />
                              </span>
                            ) : (
                              <StatusBadge status={status} />
                            )}
                          </td>
                          <td
                            className="px-2 py-2 text-right text-gray-500 dark:text-gray-400"
                            title={log
                              ? `Source → ${log.offersFetched} offres\n` +
                                `${log.offersDuplicate} doublons déjà connus\n` +
                                `${log.offersFiltered} sous le score minimum\n` +
                                `${log.offersNew} enregistrées`
                              : undefined}
                          >
                            {log ? log.offersFetched : '—'}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">
                            {log ? log.offersNew : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {log ? formatRelativeTime(log.fetchedAt) : '—'}
                          </td>
                          <td className="px-2 py-2">
                            {history.length > 1 && (
                              <button
                                onClick={() => setExpandedSource(isExpanded ? null : source)}
                                aria-label={isExpanded ? 'Masquer l\'historique' : 'Voir l\'historique'}
                                className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                              >
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5" />
                                  : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </td>
                          {/* Debug selector button — WebView sources only */}
                          <td className="px-2 py-2">
                            {WEBVIEW_SOURCES.has(source) && (
                              <button
                                onClick={() => setDebugSource(isDebugExpanded ? null : source)}
                                aria-label={isDebugExpanded ? 'Masquer le débogage' : 'Déboguer les sélecteurs'}
                                title={hasOverride ? 'Correction active' : hasDebugInfo ? 'HTML capturé — débogage disponible' : 'Débogage sélecteurs CSS'}
                                className={`transition-colors ${
                                  hasOverride
                                    ? 'text-green-500 dark:text-green-400'
                                    : hasDebugInfo
                                      ? 'text-amber-500 dark:text-amber-400 animate-pulse'
                                      : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'
                                }`}
                              >
                                <Wrench className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Debug panel expand */}
                        {isDebugExpanded && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-amber-50/40 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-800/30">
                              <SelectorDebugPanel source={source} />
                            </td>
                          </tr>
                        )}

                        {/* History expand */}
                        {isExpanded && history.length > 0 && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0 bg-gray-50 dark:bg-gray-700/20">
                              <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/30">
                                  {history.map(h => {
                                    const breakdownParts: string[] = [];
                                    if (h.offersDuplicate > 0) breakdownParts.push(`${h.offersDuplicate} doublons`);
                                    if (h.offersFiltered > 0)  breakdownParts.push(`${h.offersFiltered} sous score min`);
                                    const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
                                    return (
                                      <tr key={h.id} className="text-gray-500 dark:text-gray-400">
                                        <td className="pl-8 pr-3 py-1.5 w-1/6">
                                          <StatusBadge status={h.status} />
                                        </td>
                                        <td className="px-2 py-1.5 text-right">{h.offersFetched} récup.</td>
                                        <td className="px-2 py-1.5 text-right">{h.offersNew} nouvelles{breakdown}</td>
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                          {formatRelativeTime(h.fetchedAt)}
                                        </td>
                                        <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500 truncate max-w-xs">
                                          {h.errorMessage ?? ''}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Prompt generation buttons */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handlePerformancePrompt}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
            >
              <Bot className="w-3 h-3" />
              Optimiser ma recherche (prompt IA)
            </button>
            {(volumeAlert || conversionAlert) && (
              <button
                onClick={handleDiagnosticPrompt}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <AlertTriangle className="w-3 h-3" />
                Diagnostic (prompt IA)
              </button>
            )}
          </div>

          {/* Actionable learning suggestions */}
          {(suggestExclude.length > 0 || suggestBonus.length > 0 || suggestBlacklist.length > 0) && (
            <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
              {suggestExclude.map(term => (
                <SuggestionAlert
                  key={`excl:${term}`}
                  type="negative"
                  message={`Vous rejetez souvent les offres contenant "${term}".`}
                  actionLabel="Exclure ce terme"
                  onAction={() => handleExcludeTerm(term)}
                  onDismiss={() => dismiss(`excl:${term}`)}
                />
              ))}
              {suggestBonus.map(term => (
                <SuggestionAlert
                  key={`bonus:${term}`}
                  type="positive"
                  message={`Vous importez souvent les offres contenant "${term}".`}
                  actionLabel="Ajouter en préférence"
                  onAction={() => handleAddBonus(term)}
                  onDismiss={() => dismiss(`bonus:${term}`)}
                />
              ))}
              {suggestBlacklist.map(company => (
                <SuggestionAlert
                  key={`bl:${company}`}
                  type="negative"
                  message={`Vous rejetez souvent les offres de "${company}".`}
                  actionLabel="Blacklister"
                  onAction={() => handleBlacklistCompany(company)}
                  onDismiss={() => dismiss(`bl:${company}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
