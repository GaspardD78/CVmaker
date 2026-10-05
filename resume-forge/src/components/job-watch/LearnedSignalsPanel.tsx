import { useMemo } from 'react';
import { AlertTriangle, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import type { JobWatchAlert } from '@/types/job-watch';
import { forgetLearnedTerms, listLearnedSignals } from '@/lib/watcher/learning-engine';

/**
 * Signaux appris par la piste (titres des offres triées), avec leur compteur.
 * « Oublier » retire le terme du dictionnaire : utile pour un signal qui contredit
 * le profil (ex. « cybersécurité » appris comme rejeté alors que c'est la cible).
 */
export function LearnedSignalsPanel({ alert }: { alert: JobWatchAlert }) {
  const { updateAlert } = useJobWatchStore();
  const signals = useMemo(
    () => listLearnedSignals(alert.learnedDict, alert.searchProfile, { minCount: 3, limit: 8 }),
    [alert.learnedDict, alert.searchProfile],
  );
  if (signals.length === 0) return null;

  const forget = async (term: string) => {
    try {
      await updateAlert(alert.id, { learnedDict: forgetLearnedTerms(alert.learnedDict, [term]) });
      toast.success(`« ${term} » oublié.`);
    } catch (err) {
      toast.error(`Impossible d'oublier ce terme : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
      <p className="text-[10px] uppercase tracking-wide font-medium text-gray-400 dark:text-gray-500 mb-1.5">
        Signaux appris (titres des offres triées)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {signals.map(s => (
          <span
            key={`${s.sense}:${s.term}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
              s.conflict
                ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : s.sense === 'positive'
                  ? 'border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
            }`}
            title={s.conflict ? 'Ce terme figure dans le profil de la piste : signal probablement trompeur' : undefined}
          >
            {s.conflict && <AlertTriangle className="w-3 h-3" />}
            {s.sense === 'positive' ? '+' : '−'} {s.term} <span className="opacity-70">×{s.count}</span>
            <button onClick={() => forget(s.term)} aria-label={`Oublier ${s.term}`} className="opacity-60 hover:opacity-100">
              <Eraser className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
