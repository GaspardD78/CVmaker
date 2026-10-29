import { Sparkles } from 'lucide-react';
import type { AiCvSuggestedEntry } from '@/lib/ai-cv-response';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  experience: 'Expérience', education: 'Formation', skill: 'Compétence', certification: 'Certification',
  language: 'Langue', interest: 'Intérêt', project: 'Projet', volunteer: 'Bénévolat',
};

interface SuggestedEntriesReviewProps {
  suggestions: readonly AiCvSuggestedEntry[];
  accepted: ReadonlySet<number>;
  onToggle: (index: number) => void;
}

/**
 * Revue des entrées suggérées hors profil maître (opt-in) : seules les entrées cochées sont écrites dans le
 * profil et ajoutées au CV. Partagée par le générateur de la Veille et le panneau IA du CV builder.
 */
export function SuggestedEntriesReview({ suggestions, accepted, onToggle }: SuggestedEntriesReviewProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3 space-y-2" data-testid="suggested-entries-review">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
          <strong>Entrées suggérées hors profil maître.</strong> Coche celles à ajouter : elles seront enregistrées dans ton profil <em>et</em> incluses dans ce CV. Non cochées : ignorées (rien n'est écrit).
        </p>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((s, i) => (
          <label
            key={i}
            className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
              accepted.has(i)
                ? 'border-purple-400 dark:border-purple-500 bg-white dark:bg-gray-800'
                : 'border-transparent bg-white/60 dark:bg-gray-800/40 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            <input type="checkbox" checked={accepted.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-purple-500 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{s.title}</span>
                {s.subtitle && <span className="text-[11px] text-gray-500 dark:text-gray-400">· {s.subtitle}</span>}
                <span className="text-[9px] uppercase tracking-wide bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                  {ENTRY_TYPE_LABELS[s.entryType] ?? s.entryType}
                </span>
              </div>
              {s.reason && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{s.reason}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
