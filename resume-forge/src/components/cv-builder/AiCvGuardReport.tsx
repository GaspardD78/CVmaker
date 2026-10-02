import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, OctagonAlert } from 'lucide-react';
import type { GuardReport } from '@/lib/ai-cv-guard';

interface AiCvGuardReportProps {
  report: GuardReport;
}

/**
 * Rapport compact du garde-fou post-LLM : score de couverture des mots-clés,
 * écarts signalés par l'IA, points bloquants (chiffres absents de la source),
 * avertissements (repliés) et questions de l'IA. L'écran appelant adapte son
 * bouton (« Appliquer quand même ») quand `report.errors` n'est pas vide.
 */
export function AiCvGuardReport({ report }: AiCvGuardReportProps) {
  const [open, setOpen] = useState(false);
  const { keywordCoverage: cov, ecarts, estimatedLines, budgetLines, pageBudget, visibleBullets, overflow } = report.metrics;
  const hasErrors = report.errors.length > 0;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 text-xs ${
        hasErrors
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
          : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
      }`}
      data-testid="ai-cv-guard-report"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold text-gray-700 dark:text-gray-200">
        {hasErrors ? <OctagonAlert className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        <span>{hasErrors ? 'À vérifier avant d\'appliquer' : 'Contrôles passés'}</span>
        {cov.pct !== null && (
          <span title={cov.missing.length > 0 ? `Manquants : ${cov.missing.join(', ')}` : 'Tous les indispensables sont couverts'}>
            Mots-clés : {cov.found}/{cov.total} ({cov.pct} %)
          </span>
        )}
        <span title={`Capacité estimée : ${budgetLines} lignes`}>
          Volume : ≈ {estimatedLines} lignes, {visibleBullets} puces ({pageBudget} page{pageBudget > 1 ? 's' : ''} visée{pageBudget > 1 ? 's' : ''})
        </span>
      </div>

      {report.errors.length > 0 && (
        <ul className="space-y-1 text-red-700 dark:text-red-300">
          {report.errors.map((e, i) => (
            <li key={i} className="flex gap-1.5"><OctagonAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e.message}</li>
          ))}
        </ul>
      )}

      {overflow.exceedsTarget && (
        <div className="text-amber-800 dark:text-amber-200" data-testid="ai-cv-overflow">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Dépasse probablement {pageBudget} page{pageBudget > 1 ? 's' : ''} (≈ {overflow.excessLines} ligne{overflow.excessLines > 1 ? 's' : ''} en trop)
          </p>
          {overflow.removalCandidates.length > 0 && (
            <>
              <p className="mt-0.5">À retirer en priorité :</p>
              <ol className="list-decimal pl-5 space-y-0.5">
                {overflow.removalCandidates.map((c, i) => (
                  <li key={i}>{c.label} <span className="opacity-75">({c.reason}, ≈ {c.savedLines} l.)</span></li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {cov.missing.length > 0 && (
        <p className="text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Mots-clés absents du CV :</span> {cov.missing.join(', ')}
        </p>
      )}

      {ecarts.length > 0 && (
        <p className="text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Écarts avec l'annonce (non comblés) :</span> {ecarts.join(', ')}
        </p>
      )}

      {report.aiWarnings.length > 0 && (
        <ul className="space-y-1 text-sky-700 dark:text-sky-300">
          {report.aiWarnings.map((w, i) => (
            <li key={i} className="flex gap-1.5"><HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}</li>
          ))}
        </ul>
      )}

      {report.warnings.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <AlertTriangle className="w-3.5 h-3.5" />
            {report.warnings.length} avertissement{report.warnings.length > 1 ? 's' : ''}
          </button>
          {open && (
            <ul className="mt-1 space-y-1 pl-5 list-disc text-gray-600 dark:text-gray-300">
              {report.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
