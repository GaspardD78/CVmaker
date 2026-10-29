import { RefreshCw } from 'lucide-react';
import { describeTarget, type ResolvedTarget } from '@/lib/cv-targets';
import type { AiTargetOutcome } from '@/lib/cv-target-snapshot';

interface TargetStatusLineProps {
  /** Ciblage utilisé pour le prompt dont le JSON est analysé. */
  retained: ResolvedTarget;
  /** Proposition de l'IA (`analyse.cible`) rapprochée du ciblage retenu ; absente sans proposition. */
  proposal?: AiTargetOutcome;
  onEdit: () => void;
  onApplyProposal: () => void;
}

const AXIS_NAMES = { type: 'type de structure', intent: 'intention', firstReader: 'premier lecteur' } as const;

/**
 * « Ciblage retenu » (et « Ciblage proposé » quand l'IA propose un axe laissé en auto), juste au-dessus
 * du rapport du garde-fou. La proposition n'est jamais appliquée sans action de l'utilisateur.
 */
export function TargetStatusLine({ retained, proposal, onEdit, onApplyProposal }: TargetStatusLineProps) {
  const canApply = (proposal?.filled.length ?? 0) > 0;
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 text-xs space-y-1.5" data-testid="target-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-gray-700 dark:text-gray-200">
          <span className="font-semibold">Ciblage retenu :</span> {describeTarget(retained)}
        </p>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 hover:underline">
          <RefreshCw className="w-3 h-3" /> Modifier et régénérer
        </button>
      </div>

      {proposal && canApply && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-2">
          <p className="text-sky-800 dark:text-sky-200">
            <span className="font-semibold">Ciblage proposé :</span> {describeTarget(proposal.target)}
            {proposal.raison && <span className="block text-[11px] text-sky-700 dark:text-sky-300">{proposal.raison}</span>}
          </p>
          <button type="button" onClick={onApplyProposal} className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium">
            Appliquer et régénérer
          </button>
        </div>
      )}

      {proposal?.contradictions.map(c => (
        <p key={c.axis} className="text-[11px] text-gray-500 dark:text-gray-400">
          L'IA proposait « {c.proposed} » pour le {AXIS_NAMES[c.axis]}, mais « {c.kept} » est conservé ({c.keptSource === 'explicit' ? 'votre choix' : 'détecté'}).
        </p>
      ))}
    </div>
  );
}
