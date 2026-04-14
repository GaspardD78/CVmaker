import { useEffect, useRef, useState } from 'react';
import { useCvStore } from '@/stores/cvStore';
import { MarkdownEditorPane } from './MarkdownEditorPane';
import { MarkdownPreviewPane } from './MarkdownPreviewPane';
import { DEFAULT_MARKDOWN_TEMPLATE } from '@/lib/templates/default-markdown';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';

interface MarkdownEditorPageProps {
  cvId: string;
}

export function MarkdownEditorPage({ cvId }: MarkdownEditorPageProps) {
  const { currentCv, updateMarkdownContent } = useCvStore();

  // État local brut (mis à jour à chaque frappe)
  const [rawMarkdown, setRawMarkdown] = useState<string>('');
  // Valeur anti-rebondée pour l'aperçu (300 ms)
  const [previewMarkdown, setPreviewMarkdown] = useState<string>('');
  // Indicateur d'enregistrement
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barre d'état sauvegarde */}
      <div className="flex items-center justify-end px-3 py-1 bg-white border-b border-gray-200 text-xs shrink-0 h-7">
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
    </div>
  );
}
