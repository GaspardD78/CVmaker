import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Eye, Target, TrendingUp, X } from 'lucide-react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { analyzeFeedback, LearningResult } from '@/lib/watcher/learning-engine';

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

  const [analysis, setAnalysis]   = useState<LearningResult | null>(null);
  const [expanded, setExpanded]   = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Run DB analysis asynchronously after mount — never blocks render
  useEffect(() => {
    analyzeFeedback()
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
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
      ...settings.searchIntent.role.mustExclude.map(k => k.toLowerCase()),
      ...settings.searchIntent.domain.excluded.map(k => k.toLowerCase()),
    ]);
    return analysis.suggestedExclusions
      .filter(t => !already.has(t) && !dismissed.has(`excl:${t}`))
      .slice(0, 5);
  }, [analysis, settings, dismissed]);

  const suggestBonus = useMemo(() => {
    if (!analysis) return [];
    const already = new Set([
      ...settings.searchIntent.role.primary.map(k => k.toLowerCase()),
      ...settings.searchIntent.domain.preferred.map(k => k.toLowerCase()),
    ]);
    return analysis.suggestedBonusTerms
      .filter(t => !already.has(t) && !dismissed.has(`bonus:${t}`))
      .slice(0, 5);
  }, [analysis, settings, dismissed]);

  const hasAlerts =
    volumeAlert || conversionAlert || suggestExclude.length > 0 || suggestBonus.length > 0;

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
      searchIntent: {
        ...settings.searchIntent,
        role: {
          ...settings.searchIntent.role,
          mustExclude: [...settings.searchIntent.role.mustExclude, term],
        },
      },
    });
    dismiss(`excl:${term}`);
  };

  const handleAddBonus = async (term: string) => {
    await saveSettings({
      ...settings,
      searchIntent: {
        ...settings.searchIntent,
        domain: {
          ...settings.searchIntent.domain,
          preferred: [...settings.searchIntent.domain.preferred, term],
        },
      },
    });
    dismiss(`bonus:${term}`);
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
