import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, ChevronDown, ChevronUp, Eye, Target, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import { analyzeFeedback, getBlacklistSuggestions, getKeywordSuggestions, LearningResult } from '@/lib/watcher/learning-engine';
import { generatePerformanceOptimizationPrompt, generateDiagnosticPrompt } from '@/lib/prompt-templates';
import { getDb } from '@/lib/db';

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

// ── Main component ────────────────────────────────────────────────────────────

export function HealthDashboard() {
  const { offers, settings, saveSettings } = useJobWatchStore();
  const { profile, entries } = useProfileStore();

  const [analysis, setAnalysis]   = useState<LearningResult | null>(null);
  const [expanded, setExpanded]   = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);

  // Run DB analysis asynchronously after mount — never blocks render
  useEffect(() => {
    analyzeFeedback()
      .then(setAnalysis)
      .catch(() => setAnalysis(null));

    // Load company reputation suggestions
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

  // ── Metrics (computed from in-memory store — zero additional I/O) ──────────

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
      volumeAlert:      volume < 10,
      pertinence:       total > 0 ? Math.round((read   / total) * 100) : null,
      conversion:       total > 0 ? Math.round((kanban / total) * 100) : null,
      conversionAlert:  total > 0 && kanban / total < 0.05,
    };
  }, [offers, weekCutoff]);

  // ── Learning suggestions (filtered against current config + dismissed) ──────

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

  // Auto-expand when actionable alerts are present
  useEffect(() => {
    if (hasAlerts) setExpanded(true);
  }, [hasAlerts]);

  // ── Action handlers ────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      {/* Toggle header */}
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

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3">
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
          {(suggestExclude.length > 0 || suggestBonus.length > 0) && (
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
