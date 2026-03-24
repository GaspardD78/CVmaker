import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { ArrowLeft, Download, FileText, Loader2, Check } from 'lucide-react';
import { exportToDocx } from '@/lib/export-docx';
import { exportNativePdf } from '@/lib/export-pdf';
import { getTemplate } from '@/templates';
import { toast } from 'sonner';
import { useSaveIndicator } from '@/hooks/useSaveIndicator';
import { TemplatePickerPopover } from './TemplatePickerPopover';

const PANEL_WIDTH_KEY = 'resumeforge_panel_width';
const MIN_PANEL = 280;
const MAX_PANEL = 520;
const DEFAULT_PANEL = 380;

export function CVBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCv, currentCvBlocks, fetchCvById, fetchCvBlocks, updateCv } = useCvStore();
  const { profile, entries, fetchProfile } = useProfileStore();
  const [isExporting, setIsExporting] = useState(false);
  const { status: saveStatus, notifySave } = useSaveIndicator();

  // Onglet actif sur mobile : 'edit' | 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Détection mobile via matchMedia (évite d'appliquer panelWidth sur petit écran)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  // Splitter state (desktop uniquement)
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_WIDTH_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        if (n >= MIN_PANEL && n <= MAX_PANEL) return n;
      }
    } catch { /* ignore */ }
    return DEFAULT_PANEL;
  });
  const isDraggingRef = useRef(false);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(MAX_PANEL, Math.max(MIN_PANEL, startWidth + ev.clientX - startX));
      setPanelWidth(newWidth);
    };

    const onMouseUp = (ev: MouseEvent) => {
      const finalWidth = Math.min(MAX_PANEL, Math.max(MIN_PANEL, startWidth + ev.clientX - startX));
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(finalWidth)); } catch { /* ignore */ }
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  // Detect store writes (updateCv / updateCvBlock) via subscribe
  const prevCvRef = useRef(useCvStore.getState().currentCv);
  const prevBlocksRef = useRef(useCvStore.getState().currentCvBlocks);
  useEffect(() => {
    const unsub = useCvStore.subscribe((state) => {
      const cvChanged = state.currentCv !== prevCvRef.current;
      const blocksChanged = state.currentCvBlocks !== prevBlocksRef.current;
      if (cvChanged || blocksChanged) {
        prevCvRef.current = state.currentCv;
        prevBlocksRef.current = state.currentCvBlocks;
        notifySave();
      }
    });
    return unsub;
  }, [notifySave]);

  useEffect(() => {
    if (id) {
      fetchCvById(id);
      fetchCvBlocks(id);
      fetchProfile();
    }
  }, [id, fetchCvById, fetchCvBlocks, fetchProfile]);

  const handleExportDocx = async () => {
    if (!currentCv || !profile) return;
    setIsExporting(true);
    try {
      const template = getTemplate(currentCv.templateId);
      const success = await exportToDocx(currentCv, profile, currentCvBlocks, entries, template);
      if (success) {
        toast.success("Le CV a été exporté en DOCX avec succès !");
      }
    } catch (error) {
      toast.error(`Erreur lors de l'export DOCX: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    // Sur mobile, basculer sur l'onglet aperçu avant l'export pour s'assurer
    // que #printable-cv est dans le DOM
    if (isMobile && activeTab !== 'preview') {
      setActiveTab('preview');
      // Laisser React re-render puis lancer l'export
      await new Promise(r => setTimeout(r, 300));
    }
    setIsExporting(true);
    try {
      const success = await exportNativePdf();
      if (success) {
        toast.success("Le CV a été exporté en PDF avec succès !");
      }
    } catch (error) {
      toast.error(`Erreur lors de l'export PDF: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplateChange = async (newTemplateId: string) => {
    if (!currentCv) return;
    useCvStore.setState({ currentCv: { ...currentCv, templateId: newTemplateId } });
    await updateCv(currentCv.id, { templateId: newTemplateId });
  };

  if (!currentCv || !profile) {
    return <div className="p-8 text-center text-gray-500">Chargement du CV...</div>;
  }

  // Visibilité des panneaux selon le contexte (mobile = onglets, desktop = split)
  const showLeftPanel = !isMobile || activeTab === 'edit';
  const showRightPanel = isMobile ? activeTab === 'preview' : true;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-100 dark:bg-gray-900 print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Top Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 overflow-x-auto shadow-sm print:hidden shrink-0">
        <button
          onClick={() => navigate('/cv')}
          className="text-gray-500 hover:text-gray-900 transition flex items-center shrink-0 min-h-[44px] px-1"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          <span className="hidden sm:inline">Retour</span>
        </button>
        <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1">
          CV: {currentCv.name}
        </h1>
        {saveStatus === 'saving' && (
          <span className="flex items-center text-sm text-gray-400 shrink-0">
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            <span className="hidden sm:inline">Enregistrement...</span>
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center text-sm text-green-500 shrink-0">
            <Check className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Enregistré</span>
          </span>
        )}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <TemplatePickerPopover
            currentTemplateId={currentCv.templateId}
            onSelect={handleTemplateChange}
          />
          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="bg-blue-600 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-md font-medium hover:bg-blue-700 transition flex items-center shadow-sm disabled:opacity-50 text-sm min-h-[44px]"
          >
            <FileText className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{isExporting ? 'Export...' : 'Exporter DOCX'}</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="bg-gray-800 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-md font-medium hover:bg-gray-700 transition flex items-center shadow-sm disabled:opacity-50 text-sm min-h-[44px]"
          >
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{isExporting ? 'Export...' : 'Exporter PDF'}</span>
          </button>
        </div>
      </div>

      {/* Onglets mobile — masqués sur desktop */}
      <div className="sm:hidden flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 print:hidden shrink-0">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'edit'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          Éditer
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'preview'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          Aperçu
        </button>
      </div>

      {/* Zone principale */}
      <div className="flex flex-1 overflow-hidden print:overflow-visible print:block print:h-auto">
        {/* Panneau gauche – édition */}
        {showLeftPanel && (
          <>
            <div
              style={!isMobile ? { width: panelWidth } : undefined}
              className="w-full sm:w-auto bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden print:hidden flex-shrink-0"
            >
              <LeftPanel cvId={id!} />
            </div>
            {/* Splitter draggable — desktop uniquement */}
            {!isMobile && (
              <div
                onMouseDown={handleSplitterMouseDown}
                className="w-1 hover:w-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors print:hidden"
              />
            )}
          </>
        )}

        {/* Panneau droit – aperçu */}
        {showRightPanel && (
          <div className="flex-1 h-full overflow-auto bg-gray-50 dark:bg-gray-900 p-2 sm:p-8 sm:flex sm:justify-center print:p-0 print:bg-white print:overflow-visible print:block print:h-auto">
            <div className="print:w-full print:max-w-none print:shadow-none print:m-0 print:border-none print:overflow-visible">
              <RightPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
