import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Circle, Clock, Eye, Info, Target, TrendingUp, Wrench, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import { analyzeFeedback, getKeywordSuggestions, isProtectedTerm, protectedTokensOf, LearningResult } from '@/lib/watcher/learning-engine';
import { generatePerformanceOptimizationPrompt, generateDiagnosticPrompt } from '@/lib/prompt-templates';
import { getDb } from '@/lib/db';
import { dedupeOffers } from '@/lib/watcher/offer-dedup';
import { useScoreRecalcStore } from '@/stores/scoreRecalcStore';
import { ThresholdPanel } from './ThresholdPanel';
import { BlacklistSuggestions } from './BlacklistSuggestions';
import { findNearDuplicateAlert } from '@/lib/watcher/alert-similarity';
import { SCORER_VERSION } from '@/lib/watcher/scorer';
import { PortfolioReviewPanel } from './PortfolioReviewPanel';
import type { JobSource, FetchLog } from '@/types/job-watch';
import {
  adviceFor, FAILING_STATUSES, legacyToSourceStatus, SOURCE_STATUS_LABELS, type SourceStatus,
} from '@/lib/watcher/source-status';

// ── Constants ─────────────────────────────────────────────────────────────────

import { RECOMMENDED_SOURCES, SOURCE_LABELS, SOURCE_SETUP_HINTS } from '@/lib/watcher/sources';
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
  /** Action alternative — sert à choisir la portée d'une blacklist. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onDismiss: () => void;
}

function SuggestionAlert({
  type, message, actionLabel, onAction, secondaryActionLabel, onSecondaryAction, onDismiss,
}: SuggestionAlertProps) {
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
        {secondaryActionLabel && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className={`font-semibold underline underline-offset-2 ${actionCls}`}
          >
            {secondaryActionLabel}
          </button>
        )}
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

const STATUS_STYLE: Record<SourceStatus, { cls: string; icon: React.ReactNode }> = {
  ok:                  { cls: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
  vide:                { cls: 'text-amber-600 dark:text-amber-400',     icon: <Circle className="w-3 h-3" /> },
  bloquee:             { cls: 'text-red-600 dark:text-red-400',         icon: <XCircle className="w-3 h-3" /> },
  introuvable:         { cls: 'text-red-600 dark:text-red-400',         icon: <XCircle className="w-3 h-3" /> },
  erreur_reseau:       { cls: 'text-red-600 dark:text-red-400',         icon: <XCircle className="w-3 h-3" /> },
  reponse_invalide:    { cls: 'text-red-600 dark:text-red-400',         icon: <XCircle className="w-3 h-3" /> },
  intitules_inadaptes: { cls: 'text-amber-600 dark:text-amber-400',     icon: <AlertTriangle className="w-3 h-3" /> },
  non_configuree:      { cls: 'text-gray-400 dark:text-gray-500',       icon: <Circle className="w-3 h-3" /> },
  en_attente:          { cls: 'text-blue-500 dark:text-blue-400',       icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: SourceStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${style.cls}`}>
      {style.icon}
      {SOURCE_STATUS_LABELS[status]}
    </span>
  );
}

/** Info-bulle : code HTTP, URL (sans secret), heure et action conseillée. */
function statusTooltip(status: SourceStatus, source: JobSource, log: FetchLog | undefined): string {
  const lines: string[] = [adviceFor(status, source)];
  if (log) {
    if (log.httpStatus) lines.push(`Code HTTP : ${log.httpStatus}`);
    if (log.errorUrl) lines.push(`URL : ${log.errorUrl}`);
    lines.push(`Heure : ${new Date(log.fetchedAt).toLocaleString('fr-FR')}`);
    if (log.errorMessage) lines.push(`Détail : ${log.errorMessage}`);
  }
  return lines.join('\n');
}

const FAILING: ReadonlySet<SourceStatus> = FAILING_STATUSES;

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
  const { offers, configs, fetchLogs, loadFetchLogs, selectorDebugInfo, selectorOverrides,
          alerts, activeAlert, setActiveAlert, activeSearchProfile, updateSearchProfile } = useJobWatchStore();

  // Piste analysée : celle sélectionnée, à défaut la première du portefeuille.
  const currentAlert = activeAlert() ?? alerts[0] ?? null;
  const { profile, entries } = useProfileStore();

  // Le profil de recherche appartient à la piste courante, plus aux réglages.
  const searchProfile = activeSearchProfile();

  const [analysis, setAnalysis]   = useState<LearningResult | null>(null);
  const [expanded, setExpanded]   = useState(alwaysExpanded);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedSource, setExpandedSource] = useState<JobSource | null>(null);
  const [debugSource, setDebugSource] = useState<JobSource | null>(null);
  const recalc = useScoreRecalcStore();
  /** Vue portefeuille : compare les pistes entre elles au lieu d'en analyser une. */
  const [portfolioMode, setPortfolioMode] = useState(false);

  useEffect(() => {
    // Suggestions et réputation entreprise sont propres à la piste : celles
    // d'une exploration ne doivent pas être dictées par les rejets d'une autre.
    analyzeFeedback(currentAlert?.id ?? null)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));

    loadFetchLogs();
  }, [currentAlert, loadFetchLogs]);

  // ── Metrics ───────────────────────────────────────────────────────────────────

  const weekCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  // Offres de la piste analysée, une fois chacune : une offre liée à deux pistes
  // ou republiée sous une autre adresse ne gonfle pas les compteurs.
  const scopedOffers = useMemo(
    () => dedupeOffers(
      currentAlert ? offers.filter(o => o.alerts.some(l => l.alertId === currentAlert.id)) : offers,
    ),
    [offers, currentAlert],
  );

  const { volume, volumeAlert, pertinence, conversion, conversionAlert, kanbanCount } = useMemo(() => {
    const volume = scopedOffers.filter(o => o.fetchedAt >= weekCutoff).length;
    const active  = scopedOffers.filter(o => o.isArchived === 0);
    const total   = active.length;
    const read    = active.filter(o => o.isRead === 1).length;
    const kanban  = active.filter(o => o.kanbanId !== null).length;
    return {
      volume,
      volumeAlert:     volume < 10,
      pertinence:      total > 0 ? Math.round((read   / total) * 100) : null,
      conversion:      total > 0 ? Math.round((kanban / total) * 100) : null,
      conversionAlert: total > 0 && kanban / total < 0.05,
      kanbanCount:     kanban,
    };
  }, [scopedOffers, weekCutoff]);

  // ── Fetch log helpers ─────────────────────────────────────────────────────────

  // Les sources et les collectes appartiennent à la piste analysée : afficher
  // la dernière collecte d'une autre piste ferait lire un statut qui n'est pas le sien.
  const alertLogs = useMemo(
    () => currentAlert
      ? fetchLogs.filter(l => !l.alertId || l.alertId === currentAlert.id)
      : fetchLogs,
    [fetchLogs, currentAlert],
  );

  const configuredSources = useMemo(
    () => new Set(
      configs
        .filter(c => c.enabled === 1 && (!currentAlert || c.alertId === currentAlert.id))
        .map(c => c.source),
    ),
    [configs, currentAlert],
  );

  // Last log per source
  const lastLogBySource = useMemo(() => {
    const map = new Map<JobSource, FetchLog>();
    for (const log of alertLogs) {
      if (!map.has(log.source)) map.set(log.source, log);
    }
    return map;
  }, [alertLogs]);

  // 10 most recent logs per source for history expand
  const historyBySource = useMemo(() => {
    const map = new Map<JobSource, FetchLog[]>();
    for (const log of alertLogs) {
      const arr = map.get(log.source) ?? [];
      if (arr.length < 10) {
        arr.push(log);
        map.set(log.source, arr);
      }
    }
    return map;
  }, [alertLogs]);

  // Explique une conversion faible plutôt que d'accuser systématiquement le score :
  // si une large part des offres récupérées tombe sous le score minimum, le seuil
  // est sans doute trop haut ; sinon, c'est simplement qu'aucune offre n'a encore
  // été glissée dans le Kanban (signal d'usage, pas de scoring).
  const conversionAlertMessage = useMemo(() => {
    if (!conversionAlert) return null;
    let fetched = 0;
    let filtered = 0;
    for (const log of lastLogBySource.values()) {
      fetched  += log.offersFetched;
      filtered += log.offersFiltered;
    }
    const filterRate = fetched > 0 ? filtered / fetched : 0;
    if (filterRate >= 0.5) {
      return `Score minimum trop élevé ? ${Math.round(filterRate * 100)} % des offres filtrées`;
    }
    if (kanbanCount === 0) return 'Aucune offre importée dans le Kanban';
    return 'Peu d\'offres importées dans le Kanban';
  }, [conversionAlert, kanbanCount, lastLogBySource]);

  // ── Learning suggestions ──────────────────────────────────────────────────────

  const suggestExclude = useMemo(() => {
    if (!analysis) return [];
    const already = new Set([
      ...searchProfile.excludeTitles.map(k => k.toLowerCase()),
      ...searchProfile.excludeDomains.map(k => k.toLowerCase()),
    ]);
    // Pas de suggestion d'exclure un terme des intitulés, skills ou domaines de la piste.
    const protectedTokens = protectedTokensOf(searchProfile);
    return analysis.suggestedExclusions
      .filter(t => !already.has(t) && !dismissed.has(`excl:${t}`) && !isProtectedTerm(t, protectedTokens))
      .slice(0, 5);
  }, [analysis, searchProfile, dismissed]);

  const suggestBonus = useMemo(() => {
    if (!analysis) return [];
    const already = new Set([
      ...searchProfile.jobTitles.map(k => k.toLowerCase()),
      ...searchProfile.domains.map(k => k.toLowerCase()),
    ]);
    return analysis.suggestedBonusTerms
      .filter(t => !already.has(t) && !dismissed.has(`bonus:${t}`))
      .slice(0, 5);
  }, [analysis, searchProfile, dismissed]);

  const hasAlerts =
    volumeAlert || conversionAlert || suggestExclude.length > 0 || suggestBonus.length > 0;

  const noJobTitles = searchProfile.jobTitles.length === 0;
  const nearDuplicate = currentAlert ? findNearDuplicateAlert(currentAlert, alerts) : null;

  useEffect(() => {
    if (hasAlerts) setExpanded(true);
  }, [hasAlerts]);

  // Contexte du portefeuille : empêche chaque diagnostic de pousser sa piste
  // vers le centre, ce qui ferait converger toutes les pistes à la longue.
  const portfolioContext = currentAlert
    ? {
        alertName: currentAlert.name,
        otherAlerts: alerts
          .filter(a => a.id !== currentAlert.id)
          .sort((a, b) => a.position - b.position)
          .map(a => ({ name: a.name, jobTitles: a.searchProfile.jobTitles })),
      }
    : undefined;

  // ── Action handlers ────────────────────────────────────────────────────────────

  const dismiss = (key: string) =>
    setDismissed(prev => new Set([...prev, key]));

  const handleExcludeTerm = async (term: string) => {
    await updateSearchProfile({
      ...searchProfile,
      excludeTitles: [...searchProfile.excludeTitles, term],
    });
    dismiss(`excl:${term}`);
  };

  const handleAddBonus = async (term: string) => {
    await updateSearchProfile({
      ...searchProfile,
      domains: [...searchProfile.domains, term],
    });
    dismiss(`bonus:${term}`);
  };

  const handlePerformancePrompt = async () => {
    // Le dictionnaire appris appartient à la piste analysée.
    const suggestions = getKeywordSuggestions(
      currentAlert?.learnedDict ?? { positive: {}, negative: {} },
      3,
    );
    const prompt = generatePerformanceOptimizationPrompt(
      profile, entries, searchProfile,
      {
        volumePerWeek: volume,
        pertinencePercent: pertinence,
        conversionPercent: conversion,
        learnedPositive: suggestions.positive.slice(0, 5),
        learnedNegative: suggestions.negative.slice(0, 5),
      },
      portfolioContext,
    );
    await navigator.clipboard.writeText(prompt);
    toast.success("Prompt d'optimisation copié ! Collez-le dans votre IA.");
  };

  const handleDiagnosticPrompt = async () => {
    const db = await getDb();
    // Offres de la piste analysée : diagnostiquer une piste sur les offres
    // d'une autre produirait des recommandations à contresens.
    // Dernier retour de l'utilisateur par sous-requête : une jointure sur les
    // retours répétait l'offre une fois par action (aimée puis importée…).
    type DiagRow = {
      id: string; source: string; title: string; company: string | null; location: string | null;
      score: number; score_version: number | null; action: string | null;
    };
    const lastAction = `(SELECT f.action FROM job_offer_feedback f WHERE f.offer_id = o.id
                          ORDER BY f.created_at DESC LIMIT 1)`;
    const raw = currentAlert
      ? await db.select<DiagRow[]>(`
          SELECT o.id, o.source, o.title, o.company, o.location, l.score, l.score_version, ${lastAction} AS action
          FROM job_offer_alerts l
          JOIN job_offers o ON o.id = l.offer_id
          WHERE l.alert_id = ?1
          ORDER BY o.fetched_at DESC
          LIMIT 60
        `, [currentAlert.id])
      : await db.select<DiagRow[]>(`
          SELECT o.id, o.source, o.title, o.company, o.location, o.score, o.score_version, ${lastAction} AS action
          FROM job_offers o
          ORDER BY o.fetched_at DESC
          LIMIT 60
        `);
    // Une annonce n'est analysée qu'une fois, et seulement avec un score de la
    // version courante : mêler deux échelles fausserait le diagnostic.
    const rows = dedupeOffers(
      raw
        .filter(r => (r.score_version ?? 1) >= SCORER_VERSION)
        .map(r => ({
          id: r.id, source: r.source, title: r.title, company: r.company, location: r.location,
          score: r.score, isArchived: 0, kanbanId: null, alerts: [], action: r.action,
        })),
    ).slice(0, 20).map(r => ({ title: r.title, score: r.score, action: r.action }));
    const prompt = generateDiagnosticPrompt(searchProfile, rows, portfolioContext);
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

          {/* Portée de l'analyse : une piste, ou le portefeuille dans son ensemble.
              Sans ce choix, les indicateurs mélangeraient des explorations qui
              n'ont ni le même but ni les mêmes attentes de conversion. */}
          {alerts.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                Analyser
                <select
                  value={portfolioMode ? '__portfolio__' : (currentAlert?.id ?? '')}
                  onChange={e => {
                    if (e.target.value === '__portfolio__') {
                      setPortfolioMode(true);
                    } else {
                      setPortfolioMode(false);
                      setActiveAlert(e.target.value);
                    }
                  }}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-xs"
                >
                  {[...alerts].sort((a, b) => a.position - b.position).map(a => (
                    <option key={a.id} value={a.id}>la piste « {a.name} »</option>
                  ))}
                  <option value="__portfolio__">tout le portefeuille</option>
                </select>
              </label>
            </div>
          )}

          {portfolioMode && <PortfolioReviewPanel />}

          {/* Warning: no jobTitles configured */}
          {!portfolioMode && noJobTitles && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Aucun titre de poste cible configuré — tous les scores démarreront à 50 (mode permissif).
                Configurez des intitulés dans votre profil de recherche pour des résultats plus pertinents.
              </span>
            </div>
          )}

          {/* Piste quasi identique à une autre : mêmes offres, comparaisons faussées */}
          {!portfolioMode && nearDuplicate && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Cette piste est quasi identique à « {nearDuplicate.otherName} » ({Math.round(nearDuplicate.similarity * 100)} % d'intitulés communs) :
                elles ramènent les mêmes offres. Différenciez ses intitulés ou désactivez l'une des deux.
              </span>
            </div>
          )}

          {/* Version du scoring : recalcul en cours, ou bilan du dernier recalcul */}
          {!portfolioMode && (recalc.running || (recalc.recalculatedCount !== null && !recalc.bannerDismissed) || recalc.error) && (
            <div className="px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {recalc.running
                      ? `Scoring mis à jour : recalcul en cours (${recalc.done} / ${recalc.total} offres)`
                      : recalc.error
                        ? `Recalcul des scores interrompu : ${recalc.error}`
                        : `Scoring mis à jour : ${recalc.recalculatedCount} offre${(recalc.recalculatedCount ?? 0) > 1 ? 's' : ''} recalculée${(recalc.recalculatedCount ?? 0) > 1 ? 's' : ''}`}
                  </span>
                </div>
                {!recalc.running && (
                  <button
                    onClick={recalc.dismissBanner}
                    aria-label="Fermer"
                    className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {recalc.running && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={recalc.total}
                  aria-valuenow={recalc.done}
                  className="h-1.5 rounded bg-blue-100 dark:bg-blue-900/40 overflow-hidden"
                >
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${recalc.total > 0 ? Math.round((recalc.done / recalc.total) * 100) : 0}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 3 metric tiles */}
          {!portfolioMode && (
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
              alert={conversionAlertMessage}
            />
          </div>
          )}

          {/* Seuil de score : visible quand la conversion est faible ou des offres sont masquées */}
          {!portfolioMode && conversionAlert && <ThresholdPanel offers={scopedOffers} />}

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
                    const status: SourceStatus = log
                      ? (log.sourceStatus ?? legacyToSourceStatus(log.status))
                      : isConfigured ? 'en_attente' : 'non_configuree';
                    const setupHint = status === 'non_configuree' ? SOURCE_SETUP_HINTS[source] : undefined;
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
                            <span title={statusTooltip(status, source, log)}>
                              <StatusBadge status={status} />
                            </span>
                            {setupHint && (
                              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 max-w-xs whitespace-normal">
                                {setupHint.explanation}{' '}
                                <button
                                  onClick={() => window.dispatchEvent(new CustomEvent('jobwatch:open-config', { detail: { source, target: setupHint.target } }))}
                                  className="font-semibold underline underline-offset-2 text-indigo-500 hover:text-indigo-700"
                                >
                                  {setupHint.actionLabel}
                                </button>
                              </p>
                            )}
                            {FAILING.has(status) && (
                              <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 max-w-xs whitespace-normal">
                                {adviceFor(status, source)}
                              </p>
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
                                          <StatusBadge status={h.sourceStatus ?? legacyToSourceStatus(h.status)} />
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
          {!portfolioMode && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handlePerformancePrompt}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
            >
              <Bot className="w-3 h-3" />
              Optimiser ma recherche (prompt IA)
            </button>
            <button
              onClick={() => void recalc.run({ force: true })}
              disabled={recalc.running}
              title="Recalcule les scores des offres des 60 derniers jours avec le scorer actuel"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors"
            >
              <Wrench className="w-3 h-3" />
              Recalculer les scores
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
          )}

          {/* Actionable learning suggestions */}
          {!portfolioMode && (suggestExclude.length > 0 || suggestBonus.length > 0) && (
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
            </div>
          )}

          {/* Suggestions de blacklist : titres rejetés visibles, portée entreprise ou type de poste */}
          {!portfolioMode && currentAlert && (
            <BlacklistSuggestions alert={currentAlert} offers={offers} />
          )}
        </div>
      )}
    </div>
  );
}
