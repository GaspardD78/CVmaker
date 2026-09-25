import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { PrintOverflow } from '@/lib/print-overflow';

interface OverflowConfirmDialogProps {
  overflow: PrintOverflow | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Extrait lisible d'une ligne de texte pour le message. */
function excerpt(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Confirmation avant un export PDF desktop qui couperait du contenu :
 * l'export n'imprime qu'une page A4, le surplus est perdu.
 */
export function OverflowConfirmDialog({ overflow, onConfirm, onCancel }: OverflowConfirmDialogProps) {
  const lines = overflow?.hiddenLines ?? 0;
  const last = overflow?.lastVisibleLine;
  const cut = overflow?.firstCutLine;

  return (
    <Dialog open={overflow !== null} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md h-full sm:h-auto sm:rounded-lg rounded-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-amber-500">⚠</span>
            Le CV dépasse une page
          </DialogTitle>
          <DialogDescription>
            Le CV dépasse la page A4 de {overflow?.overflowMm.toLocaleString('fr-FR')} mm
            ({lines} ligne{lines > 1 ? 's' : ''} de texte). L'export PDF ne contient qu'une page :
            {last
              ? <> le contenu après la ligne « {excerpt(last.text)} » sera coupé.</>
              : <> tout le contenu sera coupé.</>}
          </DialogDescription>
        </DialogHeader>
        {cut && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Première ligne coupée{cut.section ? <> (section « {cut.section} »)</> : null} : « {excerpt(cut.text)} »
          </p>
        )}
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Exporter quand même ?</p>
        <DialogFooter className="gap-2 sm:flex-row flex-col mt-auto sm:mt-0">
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg active:bg-gray-50 transition-colors min-h-[44px]"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg active:bg-amber-600 transition-colors min-h-[44px]"
          >
            Exporter quand même
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
