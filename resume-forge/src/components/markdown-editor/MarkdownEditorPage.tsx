import { useEffect, useRef, useState } from 'react';
import { useCvStore } from '@/stores/cvStore';
import { MarkdownEditorPane } from './MarkdownEditorPane';
import { MarkdownPreviewPane } from './MarkdownPreviewPane';
import { ExportWarningDialog } from './ExportWarningDialog';
import { DEFAULT_MARKDOWN_TEMPLATE } from '@/lib/templates/default-markdown';
import { exportNativePdf } from '@/lib/export-pdf';
import { toast } from 'sonner';
import { Check, Download, Loader2 } from 'lucide-react';

interface MarkdownEditorPageProps {
  cvId: string;
}

export function MarkdownEditorPage({ cvId }: MarkdownEditorPageProps) {
  const { currentCv, updateMarkdownContent, updateCv } = useCvStore();

  // État local brut (mis à jour à chaque frappe)
  const [rawMarkdown, setRawMarkdown] = useState<string>('');
  // Valeur anti-rebondée pour l'aperçu (300 ms)
  const [previewMarkdown, setPreviewMarkdown] = useState<string>('');
  // Indicateur d'enregistrement
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Export
  const [isExporting, setIsExporting] = useState(false);
  // T014 : dialogue d'avertissement avant export
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [warnReason, setWarnReason] = useState<'empty' | 'template_unchanged'>('empty');

  // T017/T018 : initialiser avec le contenu existant ou le modèle par défaut
  useEffect(() => {
    if (!currentCv) return;
    const initial = currentCv.markdownContent !== null
      ? currentCv.markdownContent
      : DEFAULT_MARKDOWN_TEMPLATE;
    setRawMarkdown(initial);
    setPreviewMarkdown(initial);

    // Sauvegarder le modèle si le document est neuf
    if (currentCv.markdownContent === null) {
      updateMarkdownContent(cvId, DEFAULT_MARKDOWN_TEMPLATE).catch(() => {
        toast.error("Impossible d'initialiser le modèle Markdown.");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvId]);

  // Anti-rebond aperçu : 300 ms
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Anti-rebond sauvegarde : 2 000 ms
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    setRawMarkdown(value);

    // Aperçu — 300 ms
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setPreviewMarkdown(value);
    }, 300);

    // Sauvegarde automatique — 2 000 ms
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('idle');
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await updateMarkdownContent(cvId, value);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
        toast.error("Échec de la sauvegarde automatique.");
      }
    }, 2000);
  };

  // Nettoyage des timers au démontage
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // T015 : effectuer l'export PDF
  const performExport = async () => {
    setIsExporting(true);
    try {
      const success = await exportNativePdf('markdown-printable');
      if (success) {
        await updateCv(cvId, { lastExported: new Date().toISOString() });
        toast.success("CV exporté en PDF avec succès !");
      }
    } catch {
      toast.error("Erreur lors de l'export PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  // T014 : détection du contenu avant export
  const handleExportPdf = () => {
    if (rawMarkdown.trim() === '') {
      setWarnReason('empty');
      setWarnDialogOpen(true);
      return;
    }
    if (rawMarkdown === DEFAULT_MARKDOWN_TEMPLATE) {
      setWarnReason('template_unchanged');
      setWarnDialogOpen(true);
      return;
    }
    performExport();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barre d'état : sauvegarde + bouton export */}
      <div className="flex items-center justify-between px-3 py-1 bg-white border-b border-gray-200 text-xs shrink-0 h-8">
        <span className="flex items-center gap-1">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Enregistrement…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-green-500">
              <Check className="w-3 h-3" />
              Enregistré
            </span>
          )}
        </span>
        <button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 text-white hover:bg-gray-700 transition disabled:opacity-50 text-xs font-medium"
        >
          <Download className="w-3 h-3" />
          {isExporting ? 'Export…' : 'Exporter PDF'}
        </button>
      </div>

      {/* Zone principale : deux volets côte à côte */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <MarkdownEditorPane value={rawMarkdown} onChange={handleChange} />
        </div>
        <div className="flex-1 overflow-hidden">
          <MarkdownPreviewPane markdown={previewMarkdown} printableId="markdown-printable" />
        </div>
      </div>

      {/* T014 : dialogue d'avertissement */}
      <ExportWarningDialog
        open={warnDialogOpen}
        reason={warnReason}
        onConfirm={() => {
          setWarnDialogOpen(false);
          performExport();
        }}
        onCancel={() => setWarnDialogOpen(false)}
      />
    </div>
  );
}
