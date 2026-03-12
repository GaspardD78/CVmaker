import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useCvStore } from '@/stores/cvStore';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SectionItem } from './SectionItem';
import { EntrySelector } from './EntrySelector';

import { Settings, Palette, FileText } from 'lucide-react';

export function LeftPanel({ cvId }: { cvId: string }) {
  const { currentCv, currentCvBlocks, reorderCvBlocks, createCvBlock, updateCv } = useCvStore();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Local state for CV settings
  const [targetJob, setTargetJob] = useState(currentCv?.targetJob || '');
  const [targetCompany, setTargetCompany] = useState(currentCv?.targetCompany || '');
  const [customSummary, setCustomSummary] = useState(currentCv?.customSummary || '');

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cvSettings = (currentCv?.settings || {}) as Record<string, string>;
  const [isDesignOpen, setIsDesignOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [fontFamily, setFontFamily] = useState(cvSettings.fontFamily || 'Calibri');
  const [fontSize, setFontSize] = useState(cvSettings.fontSize || '11px');
  const [primaryColor, setPrimaryColor] = useState(cvSettings.primaryColor || '');

  const [headerFontSize, setHeaderFontSize]           = useState(cvSettings.headerFontSize      || '');
  const [headerFontFamily, setHeaderFontFamily]       = useState(cvSettings.headerFontFamily    || '');
  const [headerFontWeight, setHeaderFontWeight]       = useState(cvSettings.headerFontWeight    || '');
  const [headerTextTransform, setHeaderTextTransform] = useState(cvSettings.headerTextTransform || '');
  const [headerTextAlign, setHeaderTextAlign]         = useState(cvSettings.headerTextAlign     || '');
  const [subtitleFontSize, setSubtitleFontSize]       = useState(cvSettings.subtitleFontSize    || '');
  const [subtitleFontFamily, setSubtitleFontFamily]   = useState(cvSettings.subtitleFontFamily  || '');
  const [subtitleFontStyle, setSubtitleFontStyle]     = useState(cvSettings.subtitleFontStyle   || '');
  const [subtitleFontWeight, setSubtitleFontWeight]   = useState(cvSettings.subtitleFontWeight  || '');
  const [bodyFontFamily, setBodyFontFamily]           = useState(cvSettings.bodyFontFamily      || '');
  const [bodyFontSize, setBodyFontSize]               = useState(cvSettings.bodyFontSize        || '');
  const [bodyTextAlign, setBodyTextAlign]             = useState(cvSettings.bodyTextAlign       || '');
  const [bodyLineHeight, setBodyLineHeight]           = useState(cvSettings.bodyLineHeight      || '');
  const [entrySpacing, setEntrySpacing]               = useState(cvSettings.entrySpacing        || '');
  const [sectionHeaderGap, setSectionHeaderGap]       = useState(cvSettings.sectionHeaderGap    || '');
  const [entryTitleGap, setEntryTitleGap]             = useState(cvSettings.entryTitleGap       || '');
  const [pageMargin, setPageMargin]                   = useState(cvSettings.pageMargin          || '');
  const [sectionBorderStyle, setSectionBorderStyle]   = useState(cvSettings.sectionBorderStyle  || '');
  const [summaryFontFamily, setSummaryFontFamily]     = useState(cvSettings.summaryFontFamily   || '');
  const [summaryFontSize, setSummaryFontSize]         = useState(cvSettings.summaryFontSize     || '');
  const [summaryFontStyle, setSummaryFontStyle]       = useState(cvSettings.summaryFontStyle    || '');
  const [summaryFontWeight, setSummaryFontWeight]     = useState(cvSettings.summaryFontWeight   || '');
  const [summaryTextAlign, setSummaryTextAlign]       = useState(cvSettings.summaryTextAlign    || '');
  const [summaryLineHeight, setSummaryLineHeight]     = useState(cvSettings.summaryLineHeight   || '');
  const [photoShape, setPhotoShape]                   = useState(cvSettings.photoShape          || '');
  const [photoSize, setPhotoSize]                     = useState(cvSettings.photoSize            || '');
  const [photoZoom, setPhotoZoom]                     = useState(cvSettings.photoZoom            || '');
  const [photoPositionX, setPhotoPositionX]           = useState(cvSettings.photoPositionX      || '');
  const [photoPositionY, setPhotoPositionY]           = useState(cvSettings.photoPositionY      || '');
  const [photoBorder, setPhotoBorder]                 = useState(cvSettings.photoBorder          || '');
  const [headerStyle, setHeaderStyle]                 = useState(cvSettings.headerStyle          || '');
  const [nameFontSize, setNameFontSize]               = useState(cvSettings.nameFontSize         || '');
  const [nameFontWeight, setNameFontWeight]           = useState(cvSettings.nameFontWeight       || '');
  const [nameTextTransform, setNameTextTransform]     = useState(cvSettings.nameTextTransform    || '');
  const [nameLineBreak, setNameLineBreak]             = useState(cvSettings.nameLineBreak        || '');
  const [titleFontSize, setTitleFontSize]             = useState(cvSettings.titleFontSize        || '');
  const [titleFontStyle, setTitleFontStyle]           = useState(cvSettings.titleFontStyle       || '');
  const [contactFontSize, setContactFontSize]         = useState(cvSettings.contactFontSize      || '');

  const designSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Skip initial render or if currentCv is missing
    if (!currentCv) return;

    if (
      targetJob !== (currentCv.targetJob || '') ||
      targetCompany !== (currentCv.targetCompany || '') ||
      customSummary !== (currentCv.customSummary || '')
    ) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        updateCv(cvId, {
          targetJob,
          targetCompany,
          customSummary,
        });
      }, 2000); // 2 seconds debounce
    }

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [targetJob, targetCompany, customSummary, cvId, updateCv, currentCv]);

  // When the template changes, re-sync local design state from the store
  // so that old overrides don't persist and conflict with the new template.
  const lastTemplateId = useRef(currentCv?.templateId);
  useEffect(() => {
    if (!currentCv) return;
    if (lastTemplateId.current && currentCv.templateId !== lastTemplateId.current) {
      const freshSettings = (currentCv.settings || {}) as Record<string, string>;
      setFontFamily(freshSettings.fontFamily || 'Calibri');
      setFontSize(freshSettings.fontSize || '11px');
      setPrimaryColor(freshSettings.primaryColor || '');
      setHeaderFontSize(freshSettings.headerFontSize || '');
      setHeaderFontFamily(freshSettings.headerFontFamily || '');
      setHeaderFontWeight(freshSettings.headerFontWeight || '');
      setHeaderTextTransform(freshSettings.headerTextTransform || '');
      setHeaderTextAlign(freshSettings.headerTextAlign || '');
      setSubtitleFontSize(freshSettings.subtitleFontSize || '');
      setSubtitleFontFamily(freshSettings.subtitleFontFamily || '');
      setSubtitleFontStyle(freshSettings.subtitleFontStyle || '');
      setSubtitleFontWeight(freshSettings.subtitleFontWeight || '');
      setBodyFontFamily(freshSettings.bodyFontFamily || '');
      setBodyFontSize(freshSettings.bodyFontSize || '');
      setBodyTextAlign(freshSettings.bodyTextAlign || '');
      setBodyLineHeight(freshSettings.bodyLineHeight || '');
      setEntrySpacing(freshSettings.entrySpacing || '');
      setSectionHeaderGap(freshSettings.sectionHeaderGap || '');
      setEntryTitleGap(freshSettings.entryTitleGap || '');
      setPageMargin(freshSettings.pageMargin || '');
      setSectionBorderStyle(freshSettings.sectionBorderStyle || '');
      setSummaryFontFamily(freshSettings.summaryFontFamily || '');
      setSummaryFontSize(freshSettings.summaryFontSize || '');
      setSummaryFontStyle(freshSettings.summaryFontStyle || '');
      setSummaryFontWeight(freshSettings.summaryFontWeight || '');
      setSummaryTextAlign(freshSettings.summaryTextAlign || '');
      setSummaryLineHeight(freshSettings.summaryLineHeight || '');
      setPhotoShape(freshSettings.photoShape || '');
      setPhotoSize(freshSettings.photoSize || '');
      setPhotoZoom(freshSettings.photoZoom || '');
      setPhotoPositionX(freshSettings.photoPositionX || '');
      setPhotoPositionY(freshSettings.photoPositionY || '');
      setPhotoBorder(freshSettings.photoBorder || '');
      setHeaderStyle(freshSettings.headerStyle || '');
      setNameFontSize(freshSettings.nameFontSize || '');
      setNameFontWeight(freshSettings.nameFontWeight || '');
      setNameTextTransform(freshSettings.nameTextTransform || '');
      setNameLineBreak(freshSettings.nameLineBreak || '');
      setTitleFontSize(freshSettings.titleFontSize || '');
      setTitleFontStyle(freshSettings.titleFontStyle || '');
      setContactFontSize(freshSettings.contactFontSize || '');
      // Update lastSavedDesign so the save effect doesn't re-trigger from resync
      const resynced = {
        fontFamily: freshSettings.fontFamily || 'Calibri',
        fontSize: freshSettings.fontSize || '11px',
        primaryColor: freshSettings.primaryColor || '',
        headerFontSize: freshSettings.headerFontSize || '',
        headerFontFamily: freshSettings.headerFontFamily || '',
        headerFontWeight: freshSettings.headerFontWeight || '',
        headerTextTransform: freshSettings.headerTextTransform || '',
        headerTextAlign: freshSettings.headerTextAlign || '',
        subtitleFontSize: freshSettings.subtitleFontSize || '',
        subtitleFontFamily: freshSettings.subtitleFontFamily || '',
        subtitleFontStyle: freshSettings.subtitleFontStyle || '',
        subtitleFontWeight: freshSettings.subtitleFontWeight || '',
        bodyFontFamily: freshSettings.bodyFontFamily || '',
        bodyFontSize: freshSettings.bodyFontSize || '',
        bodyTextAlign: freshSettings.bodyTextAlign || '',
        bodyLineHeight: freshSettings.bodyLineHeight || '',
        entrySpacing: freshSettings.entrySpacing || '',
        sectionHeaderGap: freshSettings.sectionHeaderGap || '',
        entryTitleGap: freshSettings.entryTitleGap || '',
        pageMargin: freshSettings.pageMargin || '',
        sectionBorderStyle: freshSettings.sectionBorderStyle || '',
        summaryFontFamily: freshSettings.summaryFontFamily || '',
        summaryFontSize: freshSettings.summaryFontSize || '',
        summaryFontStyle: freshSettings.summaryFontStyle || '',
        summaryFontWeight: freshSettings.summaryFontWeight || '',
        summaryTextAlign: freshSettings.summaryTextAlign || '',
        summaryLineHeight: freshSettings.summaryLineHeight || '',
        photoShape: freshSettings.photoShape || '',
        photoSize: freshSettings.photoSize || '',
        photoZoom: freshSettings.photoZoom || '',
        photoPositionX: freshSettings.photoPositionX || '',
        photoPositionY: freshSettings.photoPositionY || '',
        photoBorder: freshSettings.photoBorder || '',
        headerStyle: freshSettings.headerStyle || '',
        nameFontSize: freshSettings.nameFontSize || '',
        nameFontWeight: freshSettings.nameFontWeight || '',
        nameTextTransform: freshSettings.nameTextTransform || '',
        nameLineBreak: freshSettings.nameLineBreak || '',
        titleFontSize: freshSettings.titleFontSize || '',
        titleFontStyle: freshSettings.titleFontStyle || '',
        contactFontSize: freshSettings.contactFontSize || '',
      };
      lastSavedDesign.current = resynced;
    }
    lastTemplateId.current = currentCv.templateId;
  }, [currentCv?.templateId]);

  // Track what was last saved so we compare against local state only —
  // NOT against currentCv. This prevents the loop: updateCv → fetchCvById →
  // currentCv changes → effect re-runs → updateCv again (and the concurrent
  // write that would break template switching).
  const lastSavedDesign = useRef({
    fontFamily, fontSize, primaryColor,
    headerFontSize, headerFontFamily, headerFontWeight, headerTextTransform, headerTextAlign,
    subtitleFontSize, subtitleFontFamily, subtitleFontStyle, subtitleFontWeight,
    bodyFontFamily, bodyFontSize, bodyTextAlign, bodyLineHeight,
    entrySpacing, sectionHeaderGap, entryTitleGap,
    pageMargin, sectionBorderStyle,
    summaryFontFamily, summaryFontSize, summaryFontStyle, summaryFontWeight, summaryTextAlign, summaryLineHeight,
    photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
    headerStyle,
    nameFontSize, nameFontWeight, nameTextTransform, nameLineBreak,
    titleFontSize, titleFontStyle, contactFontSize,
  });

  useEffect(() => {
    const saved = lastSavedDesign.current;
    const current = {
      fontFamily, fontSize, primaryColor,
      headerFontSize, headerFontFamily, headerFontWeight, headerTextTransform, headerTextAlign,
      subtitleFontSize, subtitleFontFamily, subtitleFontStyle, subtitleFontWeight,
      bodyFontFamily, bodyFontSize, bodyTextAlign, bodyLineHeight,
      entrySpacing, sectionHeaderGap, entryTitleGap,
      pageMargin, sectionBorderStyle,
      summaryFontFamily, summaryFontSize, summaryFontStyle, summaryFontWeight, summaryTextAlign, summaryLineHeight,
      photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
      headerStyle,
      nameFontSize, nameFontWeight, nameTextTransform, nameLineBreak,
      titleFontSize, titleFontStyle, contactFontSize,
    };
    const hasChanged = (Object.keys(current) as (keyof typeof current)[]).some(k => current[k] !== saved[k]);
    if (hasChanged) {
      if (designSaveTimeoutRef.current) clearTimeout(designSaveTimeoutRef.current);
      designSaveTimeoutRef.current = setTimeout(() => {
        lastSavedDesign.current = { ...current };
        const currentSettings = useCvStore.getState().currentCv?.settings as Record<string, unknown> || {};
        updateCv(cvId, {
          settings: { ...currentSettings, ...current },
        });
      }, 1000);
    }
    return () => {
      if (designSaveTimeoutRef.current) clearTimeout(designSaveTimeoutRef.current);
    };
  // currentCv intentionally excluded: including it caused updateCv → fetchCvById
  // → currentCv change → re-trigger loop, breaking concurrent template changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, fontSize, primaryColor,
      headerFontSize, headerFontFamily, headerFontWeight, headerTextTransform, headerTextAlign,
      subtitleFontSize, subtitleFontFamily, subtitleFontStyle, subtitleFontWeight,
      bodyFontFamily, bodyFontSize, bodyTextAlign, bodyLineHeight,
      entrySpacing, sectionHeaderGap, entryTitleGap,
      pageMargin, sectionBorderStyle,
      summaryFontFamily, summaryFontSize, summaryFontStyle, summaryFontWeight, summaryTextAlign, summaryLineHeight,
      photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
      headerStyle,
      nameFontSize, nameFontWeight, nameTextTransform, nameLineBreak,
      titleFontSize, titleFontStyle, contactFontSize,
      cvId, updateCv]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = currentCvBlocks.findIndex((item) => item.id === active.id);
      const newIndex = currentCvBlocks.findIndex((item) => item.id === over?.id);

      let newArray = arrayMove(currentCvBlocks, oldIndex, newIndex);

      // If dragging a section_header, bring its associated entries along with it
      const draggedBlock = currentCvBlocks[oldIndex];
      if (draggedBlock.blockType === 'section_header') {
        // Collect entry IDs that belong to this section (from oldIndex+1 until next header)
        const groupEntryIds: string[] = [];
        for (let i = oldIndex + 1; i < currentCvBlocks.length; i++) {
          if (currentCvBlocks[i].blockType === 'section_header') break;
          groupEntryIds.push(currentCvBlocks[i].id);
        }

        if (groupEntryIds.length > 0) {
          // Pull them out from wherever arrayMove scattered them
          const groupEntries = groupEntryIds.map(id => newArray.find(b => b.id === id)!);
          newArray = newArray.filter(b => !groupEntryIds.includes(b.id));
          // Re-insert them right after the header in its new position
          const headerNewIdx = newArray.findIndex(b => b.id === draggedBlock.id);
          newArray.splice(headerNewIdx + 1, 0, ...groupEntries);
        }
      }

      const newOrder = newArray.map(item => item.id);

      // Optimistic update to prevent jitter
      useCvStore.setState({ currentCvBlocks: newArray });

      await reorderCvBlocks(cvId, newOrder);
    }
  };

  const handleFitToPage = () => {
    const A4_PX = Math.round(297 * 96 / 25.4); // 297 mm → px at 96 dpi
    const cvEl = () => document.getElementById('printable-cv');
    const fits = () => (cvEl()?.scrollHeight ?? 0) <= A4_PX;

    if (fits()) {
      toast.info('Le CV tient déjà sur une page !');
      return;
    }

    // Each array: candidates ordered from LARGEST → SMALLEST value.
    // We iterate forward to find the smallest reduction that still fits.
    const tryReduce = (
      candidates: string[],
      current: string,
      setter: React.Dispatch<React.SetStateAction<string>>
    ): boolean => {
      const idx = candidates.indexOf(current);
      // If current not found, try all (idx=-1 → start=0)
      // If found, start from the next smaller value (idx+1)
      const startIdx = idx < 0 ? 0 : idx + 1;
      for (let i = startIdx; i < candidates.length; i++) {
        flushSync(() => setter(candidates[i]));
        if (fits()) return true;
      }
      return false;
    };

    const spacingCandidates     = ['32px', '24px', '16px', '8px', '4px'];
    const internalGapCandidates = ['16px', '12px', '8px', '4px', '2px'];
    const lineHCandidates       = ['1.8', '1.6', '1.4', '1.2'];
    const marginCandidates      = ['56px 64px', '48px 56px', '40px 48px', '32px 36px', '24px 28px'];
    const fontCandidates        = ['12px', '11px', '10px', '9px'];

    if (tryReduce(spacingCandidates,     entrySpacing,     setEntrySpacing))     { toast.success('CV ajusté à 1 page !'); return; }
    if (tryReduce(internalGapCandidates, sectionHeaderGap, setSectionHeaderGap)) { toast.success('CV ajusté à 1 page !'); return; }
    if (tryReduce(internalGapCandidates, entryTitleGap,    setEntryTitleGap))    { toast.success('CV ajusté à 1 page !'); return; }
    if (tryReduce(lineHCandidates,       bodyLineHeight,   setBodyLineHeight))   { toast.success('CV ajusté à 1 page !'); return; }
    if (tryReduce(marginCandidates,      pageMargin,       setPageMargin))       { toast.success('CV ajusté à 1 page !'); return; }
    // Réduire d'abord la taille du corps spécifique, puis la taille globale
    if (bodyFontSize && tryReduce(fontCandidates, bodyFontSize, setBodyFontSize)) { toast.success('CV ajusté à 1 page !'); return; }
    if (tryReduce(fontCandidates,        fontSize,         setFontSize))         { toast.success('CV ajusté à 1 page !'); return; }

    toast.warning('Le CV reste trop long, même avec les réglages minimaux.');
  };

  const handleAddCustomText = async () => {
    const maxOrder = currentCvBlocks.length > 0
      ? Math.max(...currentCvBlocks.map(b => b.sortOrder))
      : 0;

    await createCvBlock({
      cvId,
      entryId: null,
      blockType: 'custom_text',
      sectionName: null,
      customContent: 'Nouveau texte personnalisé...',
      sortOrder: maxOrder + 1,
      isVisible: true,
      overrideData: null as any,
    });
  };

  const handleAddSectionHeader = async (sectionName: string) => {
    const nameToUse = sectionName === "Nouvelle Section"
      ? window.prompt("Nom de la nouvelle section :", "Nouvelle Section")
      : sectionName;

    if (!nameToUse) return; // User canceled the prompt

    const maxOrder = currentCvBlocks.length > 0
      ? Math.max(...currentCvBlocks.map(b => b.sortOrder))
      : 0;

    await createCvBlock({
      cvId,
      entryId: null,
      blockType: 'section_header',
      sectionName: nameToUse,
      customContent: null,
      sortOrder: maxOrder + 1,
      isVisible: true,
      overrideData: null as any,
    });
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">Blocs du CV</h2>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`transition-colors p-1 rounded-full hover:bg-gray-100 ${isSettingsOpen ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'}`}
            title="Paramètres du CV"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsSummaryOpen(!isSummaryOpen)}
            className={`relative transition-colors p-1 rounded-full hover:bg-gray-100 ${isSummaryOpen ? 'text-green-600' : 'text-gray-500 hover:text-green-600'}`}
            title="Résumé / Accroche"
          >
            <FileText className="w-5 h-5" />
            {customSummary && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setIsDesignOpen(!isDesignOpen)}
            className={`transition-colors p-1 rounded-full hover:bg-gray-100 ${isDesignOpen ? 'text-purple-600' : 'text-gray-500 hover:text-purple-600'}`}
            title="Design du CV"
          >
            <Palette className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isSettingsOpen && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-sm">
          <h3 className="font-semibold text-blue-900 mb-2">Paramètres de ce CV</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Poste ciblé</label>
              <input
                type="text"
                value={targetJob}
                onChange={e => setTargetJob(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
                placeholder="Ex: Développeur React"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Entreprise ciblée</label>
              <input
                type="text"
                value={targetCompany}
                onChange={e => setTargetCompany(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
                placeholder="Ex: Google"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Résumé personnalisé</label>
              <textarea
                value={customSummary}
                onChange={e => setCustomSummary(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200 resize-y h-20"
                placeholder="Accroche spécifique à ce CV..."
              />
            </div>
          </div>
        </div>
      )}

      {isSummaryOpen && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg shadow-sm text-sm flex flex-col min-h-0 flex-shrink-0 max-h-[65vh]">
          <div className="p-3 pb-2 border-b border-green-200 flex-shrink-0">
            <h3 className="font-semibold text-green-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Résumé / Accroche
            </h3>
          </div>
          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5 leading-tight">
                Si renseigné, remplace le résumé du Profil Maître sur ce CV uniquement.
              </p>
              <textarea
                value={customSummary}
                onChange={e => setCustomSummary(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-green-200 resize-y h-20 text-xs"
                placeholder="Accroche spécifique à ce CV…"
              />
              {customSummary && (
                <button
                  type="button"
                  onClick={() => setCustomSummary('')}
                  className="mt-0.5 text-[10px] text-red-500 hover:text-red-700 underline"
                >
                  Supprimer (revenir au résumé du profil)
                </button>
              )}
            </div>

            {/* Summary formatting */}
            <p className="text-xs font-semibold text-green-800 border-t border-green-200 pt-2">Mise en forme</p>
            <div className="grid grid-cols-2 gap-1">
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Police</label>
                <select value={summaryFontFamily} onChange={e => setSummaryFontFamily(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto (globale)</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Helvetica">Helvetica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={summaryFontSize} onChange={e => setSummaryFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto</option>
                  <option value="10px">Petit (10)</option>
                  <option value="11px">Normal (11)</option>
                  <option value="12px">Grand (12)</option>
                  <option value="13px">Très grand (13)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Graisse</label>
                <select value={summaryFontWeight} onChange={e => setSummaryFontWeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="500">Moyen</option>
                  <option value="bold">Gras</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Style</label>
                <select value={summaryFontStyle} onChange={e => setSummaryFontStyle(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="italic">Italique</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Alignement</label>
                <select value={summaryTextAlign} onChange={e => setSummaryTextAlign(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto</option>
                  <option value="left">Gauche</option>
                  <option value="justify">Justifié</option>
                  <option value="center">Centré</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Interligne</label>
                <select value={summaryLineHeight} onChange={e => setSummaryLineHeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-green-200">
                  <option value="">Auto</option>
                  <option value="1.2">Serré (1.2)</option>
                  <option value="1.4">Normal (1.4)</option>
                  <option value="1.6">Aéré (1.6)</option>
                  <option value="1.8">Large (1.8)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDesignOpen && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg shadow-sm text-sm flex flex-col min-h-0 flex-shrink-0 max-h-[60vh]">
          <div className="p-3 pb-2 border-b border-purple-200 flex-shrink-0">
            <h3 className="font-semibold text-purple-900 mb-2">Design du CV</h3>
            {/* ✨ Magic fit-to-page button */}
            <button
              type="button"
              onClick={handleFitToPage}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-md transition-colors shadow-sm"
            >
              <span>✨</span> Ajuster à 1 page
            </button>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center leading-tight">
              Réduit automatiquement espacements, marges et police pour tenir sur une page, et sauvegarde les nouveaux réglages.
            </p>
          </div>
          <div className="p-3 overflow-y-auto flex-1">
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Police</label>
              <select
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-purple-200 text-sm"
              >
                <option value="Calibri">Calibri (défaut)</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Helvetica">Helvetica</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Taille du texte</label>
              <select
                value={fontSize}
                onChange={e => setFontSize(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-purple-200 text-sm"
              >
                <option value="10px">Petit (10pt)</option>
                <option value="11px">Normal (11pt)</option>
                <option value="12px">Grand (12pt)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Couleur d'accent</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={primaryColor || '#1f2937'}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border border-gray-300"
                />
                <span className="text-xs text-gray-500 font-mono">{primaryColor || 'Auto (thème)'}</span>
                {primaryColor && (
                  <button
                    type="button"
                    onClick={() => setPrimaryColor('')}
                    className="text-xs text-purple-600 hover:text-purple-800 underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Section headers */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Titres de section</p>
            <div className="grid grid-cols-2 gap-1">
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Police</label>
                <select value={headerFontFamily} onChange={e => setHeaderFontFamily(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto (globale)</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Helvetica">Helvetica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={headerFontSize} onChange={e => setHeaderFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="11px">Petit (11)</option>
                  <option value="13px">Moyen (13)</option>
                  <option value="15px">Grand (15)</option>
                  <option value="18px">Très grand (18)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Graisse</label>
                <select value={headerFontWeight} onChange={e => setHeaderFontWeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="600">Semi-gras</option>
                  <option value="bold">Gras</option>
                  <option value="800">Extra-gras</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Casse</label>
                <select value={headerTextTransform} onChange={e => setHeaderTextTransform(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="none">Normal</option>
                  <option value="uppercase">MAJUSCULES</option>
                  <option value="capitalize">Capitalize</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Alignement</label>
                <select value={headerTextAlign} onChange={e => setHeaderTextAlign(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="left">Gauche</option>
                  <option value="center">Centré</option>
                  <option value="right">Droite</option>
                </select>
              </div>
            </div>

            {/* Entry titles (Recruteur IT, Master...) */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Titres d'entrée <span className="font-normal text-gray-400">(postes, diplômes…)</span></p>
            <div className="grid grid-cols-2 gap-1">
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Police</label>
                <select value={subtitleFontFamily} onChange={e => setSubtitleFontFamily(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto (globale)</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Helvetica">Helvetica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={subtitleFontSize} onChange={e => setSubtitleFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="10px">Petit (10)</option>
                  <option value="11px">Normal (11)</option>
                  <option value="12px">Moyen (12)</option>
                  <option value="13px">Grand (13)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Graisse</label>
                <select value={subtitleFontWeight} onChange={e => setSubtitleFontWeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="500">Moyen</option>
                  <option value="bold">Gras</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Style</label>
                <select value={subtitleFontStyle} onChange={e => setSubtitleFontStyle(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="italic">Italique</option>
                </select>
              </div>
            </div>

            {/* Body */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Corps du texte</p>
            <div className="grid grid-cols-2 gap-1">
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Police</label>
                <select value={bodyFontFamily} onChange={e => setBodyFontFamily(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto (globale)</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Helvetica">Helvetica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={bodyFontSize} onChange={e => setBodyFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto (globale)</option>
                  <option value="9px">Très petit (9)</option>
                  <option value="10px">Petit (10)</option>
                  <option value="11px">Normal (11)</option>
                  <option value="12px">Grand (12)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Interligne</label>
                <select value={bodyLineHeight} onChange={e => setBodyLineHeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="1.2">Serré (1.2)</option>
                  <option value="1.4">Normal (1.4)</option>
                  <option value="1.6">Aéré (1.6)</option>
                  <option value="1.8">Large (1.8)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-0.5">Alignement</label>
                <select value={bodyTextAlign} onChange={e => setBodyTextAlign(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="left">Gauche</option>
                  <option value="justify">Justifié</option>
                  <option value="center">Centré</option>
                </select>
              </div>
            </div>

            {/* Entry spacing */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Espacement entre blocs</p>
            <select value={entrySpacing} onChange={e => setEntrySpacing(e.target.value)}
              className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
              <option value="">Auto</option>
              <option value="4px">Très serré</option>
              <option value="8px">Serré</option>
              <option value="16px">Normal</option>
              <option value="24px">Aéré</option>
              <option value="32px">Large</option>
            </select>

            {/* Internal spacing */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Espacement interne</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Section → Entrée</label>
                <select value={sectionHeaderGap} onChange={e => setSectionHeaderGap(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="2px">Minimal</option>
                  <option value="4px">Serré</option>
                  <option value="8px">Normal</option>
                  <option value="12px">Aéré</option>
                  <option value="16px">Large</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Titre → Corps</label>
                <select value={entryTitleGap} onChange={e => setEntryTitleGap(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="0px">Aucun</option>
                  <option value="2px">Minimal</option>
                  <option value="4px">Serré</option>
                  <option value="8px">Normal</option>
                  <option value="12px">Aéré</option>
                </select>
              </div>
            </div>

            {/* Page margins */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Marges de la page</p>
            <select value={pageMargin} onChange={e => setPageMargin(e.target.value)}
              className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
              <option value="">Auto</option>
              <option value="24px 28px">Étroites</option>
              <option value="32px 36px">Réduites</option>
              <option value="40px 48px">Normales</option>
              <option value="48px 56px">Larges</option>
              <option value="56px 64px">Très larges</option>
            </select>

            {/* Section border style */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Style de bordure des sections</p>
            <select value={sectionBorderStyle} onChange={e => setSectionBorderStyle(e.target.value)}
              className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
              <option value="">Auto</option>
              <option value="solid">Ligne continue</option>
              <option value="dashed">Tirets</option>
              <option value="dotted">Pointillés</option>
              <option value="double">Double ligne</option>
              <option value="none">Aucune bordure</option>
            </select>

            {/* Photo settings */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Photo de profil</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Forme</label>
                <select value={photoShape} onChange={e => setPhotoShape(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Cercle</option>
                  <option value="rounded-lg">Arrondi</option>
                  <option value="rounded-sm">Rect. arrondi</option>
                  <option value="rounded-none">Carré</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={photoSize} onChange={e => setPhotoSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Normale (96px)</option>
                  <option value="64px">Petite (64px)</option>
                  <option value="80px">Réduite (80px)</option>
                  <option value="112px">Grande (112px)</option>
                  <option value="128px">Très grande (128px)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Bordure</label>
                <select value={photoBorder} onChange={e => setPhotoBorder(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Fine grise</option>
                  <option value="none">Aucune</option>
                  <option value="accent">Couleur d'accent</option>
                  <option value="thick">Épaisse grise</option>
                  <option value="shadow">Ombre portée</option>
                </select>
              </div>
            </div>

            {/* Header style */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Style d'en-tête</p>
            <select value={headerStyle} onChange={e => setHeaderStyle(e.target.value)}
              className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
              <option value="">Standard</option>
              <option value="accent-light">Fond coloré léger</option>
              <option value="accent-banner">Bandeau coloré</option>
              <option value="dark-banner">Bandeau sombre</option>
              <option value="gradient-banner">Dégradé coloré</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">
              Bandeau pleine largeur utilise la couleur d'accent ci-dessus.
            </p>

            {/* CV header typography (name / title / contact) */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Nom &amp; prénom</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={nameFontSize} onChange={e => setNameFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto (thème)</option>
                  <option value="16px">Petit (16)</option>
                  <option value="20px">Moyen (20)</option>
                  <option value="24px">Normal (24)</option>
                  <option value="28px">Grand (28)</option>
                  <option value="32px">Très grand (32)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Graisse</label>
                <select value={nameFontWeight} onChange={e => setNameFontWeight(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="600">Semi-gras</option>
                  <option value="bold">Gras</option>
                  <option value="800">Extra-gras</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Casse</label>
                <select value={nameTextTransform} onChange={e => setNameTextTransform(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="none">Normal</option>
                  <option value="uppercase">MAJUSCULES</option>
                  <option value="capitalize">Capitalize</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Saut de ligne</label>
                <select value={nameLineBreak} onChange={e => setNameLineBreak(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Sur une ligne</option>
                  <option value="split">Prénom / Nom</option>
                </select>
              </div>
            </div>

            <p className="text-xs font-semibold text-purple-800 mt-2 mb-1">Poste / Titre</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
                <select value={titleFontSize} onChange={e => setTitleFontSize(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="12px">Petit (12)</option>
                  <option value="14px">Normal (14)</option>
                  <option value="16px">Grand (16)</option>
                  <option value="18px">Très grand (18)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Style</label>
                <select value={titleFontStyle} onChange={e => setTitleFontStyle(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="italic">Italique</option>
                </select>
              </div>
            </div>

            <p className="text-xs font-semibold text-purple-800 mt-2 mb-1">Coordonnées</p>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Taille</label>
              <select value={contactFontSize} onChange={e => setContactFontSize(e.target.value)}
                className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                <option value="">Auto</option>
                <option value="9px">Très petit (9)</option>
                <option value="10px">Petit (10)</option>
                <option value="11px">Normal (11)</option>
                <option value="12px">Grand (12)</option>
              </select>
            </div>
          </div>
          </div>{/* end scrollable content */}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50 border rounded-lg p-3 text-sm text-gray-500 shadow-inner custom-scrollbar">
        {currentCvBlocks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4">
            <p>Ce CV est vide.</p>
            <p className="mt-2">Cliquez sur "Ajouter une entrée" pour commencer à construire votre CV.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={currentCvBlocks.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {currentCvBlocks.map((block) => (
                  <SectionItem key={block.id} block={block} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={() => setIsSelectorOpen(true)}
          className="bg-blue-50 text-blue-700 py-3 rounded-lg font-medium w-full border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm"
        >
          + Ajouter une entrée master
        </button>

        <div className="flex space-x-2">
          <select
            className="bg-gray-50 text-gray-700 py-2 px-3 rounded-lg font-medium border border-gray-300 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => {
              if (e.target.value) {
                handleAddSectionHeader(e.target.value);
                e.target.value = ''; // reset after selection
              }
            }}
          >
            <option value="">+ Ajouter un titre de section...</option>
            <option value="Expériences Professionnelles">Expériences Professionnelles</option>
            <option value="Formations">Formations</option>
            <option value="Compétences">Compétences</option>
            <option value="Projets Récents">Projets Récents</option>
            <option value="Certifications">Certifications</option>
            <option value="Langues">Langues</option>
            <option value="Centres d'intérêt">Intérêts</option>
            <option value="Nouvelle Section">Autre...</option>
          </select>

          <button
            onClick={handleAddCustomText}
            className="flex-1 bg-gray-50 text-gray-700 py-2 rounded-lg font-medium border border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors shadow-sm text-sm"
          >
            + Texte libre
          </button>
        </div>
      </div>

      {isSelectorOpen && (
        <EntrySelector cvId={cvId} onClose={() => setIsSelectorOpen(false)} />
      )}
    </div>
  );
}
