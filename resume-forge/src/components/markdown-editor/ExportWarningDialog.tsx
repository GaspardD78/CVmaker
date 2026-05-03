import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ExportWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reason: 'empty' | 'template_unchanged';
}

const MESSAGES: Record<ExportWarningDialogProps['reason'], { title: string; description: string }> = {
  empty: {
    title: 'Document vide',
    description:
      'Votre document Markdown est vide. Le PDF exporté ne contiendra aucun contenu. ' +
      'Voulez-vous quand même exporter ?',
  },
  template_unchanged: {
    title: 'Modèle non modifié',
    description:
      'Votre document contient uniquement le modèle de départ sans aucune modification. ' +
      'Le PDF exporté ne représentera pas votre CV réel. ' +
      'Voulez-vous quand même exporter ?',
  },
};

export function ExportWarningDialog({ open, onConfirm, onCancel, reason }: ExportWarningDialogProps) {
  const { title, description } = MESSAGES[reason];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md h-full sm:h-auto sm:rounded-lg rounded-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-amber-500">⚠</span>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
