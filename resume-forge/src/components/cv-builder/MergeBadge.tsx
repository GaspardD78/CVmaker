import { Merge, Undo2 } from 'lucide-react';
import { isMergedMember, mergedCount } from '@/lib/merged-entries';
import type { CVBlock } from '@/types/cv';

interface MergeBadgeProps {
  block: Pick<CVBlock, 'overrideData'>;
  /** Défait la fusion portée par ce bloc (visibilité et surcharges rétablies). */
  onUnmerge: () => void;
}

/**
 * Fusion d'expériences dans le CV builder : « Fusion de N postes » avec un bouton pour la défaire en un clic
 * sur le bloc porteur ; « Fusionné » sur les blocs masqués par une fusion.
 */
export function MergeBadge({ block, onUnmerge }: MergeBadgeProps) {
  const count = mergedCount(block);
  if (count >= 2) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          <Merge className="w-3 h-3" /> Fusion de {count} postes
        </span>
        <button
          type="button"
          onClick={onUnmerge}
          title="Défaire la fusion : les postes redeviennent visibles séparément"
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
        >
          <Undo2 className="w-3 h-3" /> Défaire
        </button>
      </span>
    );
  }
  if (isMergedMember(block)) {
    return (
      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300" title="Cette entrée est regroupée dans une ligne fusionnée">
        Fusionné
      </span>
    );
  }
  return null;
}
