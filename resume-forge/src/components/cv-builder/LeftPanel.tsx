import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useCvStore } from '@/stores/cvStore';
import { toast } from 'sonner';
import { SettingsPanel } from './SettingsPanel';
import { SummaryPanel } from './SummaryPanel';
import { DesignPanel } from './DesignPanel';
import { BlockList } from './BlockList';

import { Settings, Palette, FileText, Sparkles } from 'lucide-react';
import { AIPromptPanel } from './AIPromptPanel';

export function LeftPanel({ cvId }: { cvId: string }) {
  const { currentCv, currentCvBlocks, createCvBlock, updateCv } = useCvStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

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
          <button
            onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
            className={`transition-colors p-1 rounded-full hover:bg-gray-100 ${isAIPanelOpen ? 'text-amber-500' : 'text-gray-500 hover:text-amber-500'}`}
            title="Générateur de prompts IA"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsPanel
          targetJob={targetJob} setTargetJob={setTargetJob}
          targetCompany={targetCompany} setTargetCompany={setTargetCompany}
          customSummary={customSummary} setCustomSummary={setCustomSummary}
        />
      )}

      {isSummaryOpen && (
        <SummaryPanel
          customSummary={customSummary} setCustomSummary={setCustomSummary}
          summaryFontFamily={summaryFontFamily} setSummaryFontFamily={setSummaryFontFamily}
          summaryFontSize={summaryFontSize} setSummaryFontSize={setSummaryFontSize}
          summaryFontWeight={summaryFontWeight} setSummaryFontWeight={setSummaryFontWeight}
          summaryFontStyle={summaryFontStyle} setSummaryFontStyle={setSummaryFontStyle}
          summaryTextAlign={summaryTextAlign} setSummaryTextAlign={setSummaryTextAlign}
          summaryLineHeight={summaryLineHeight} setSummaryLineHeight={setSummaryLineHeight}
        />
      )}

      {isDesignOpen && (
        <DesignPanel
          onFitToPage={handleFitToPage}
          fontFamily={fontFamily} setFontFamily={setFontFamily}
          fontSize={fontSize} setFontSize={setFontSize}
          primaryColor={primaryColor} setPrimaryColor={setPrimaryColor}
          headerFontSize={headerFontSize} setHeaderFontSize={setHeaderFontSize}
          headerFontFamily={headerFontFamily} setHeaderFontFamily={setHeaderFontFamily}
          headerFontWeight={headerFontWeight} setHeaderFontWeight={setHeaderFontWeight}
          headerTextTransform={headerTextTransform} setHeaderTextTransform={setHeaderTextTransform}
          headerTextAlign={headerTextAlign} setHeaderTextAlign={setHeaderTextAlign}
          subtitleFontSize={subtitleFontSize} setSubtitleFontSize={setSubtitleFontSize}
          subtitleFontFamily={subtitleFontFamily} setSubtitleFontFamily={setSubtitleFontFamily}
          subtitleFontStyle={subtitleFontStyle} setSubtitleFontStyle={setSubtitleFontStyle}
          subtitleFontWeight={subtitleFontWeight} setSubtitleFontWeight={setSubtitleFontWeight}
          bodyFontFamily={bodyFontFamily} setBodyFontFamily={setBodyFontFamily}
          bodyFontSize={bodyFontSize} setBodyFontSize={setBodyFontSize}
          bodyTextAlign={bodyTextAlign} setBodyTextAlign={setBodyTextAlign}
          bodyLineHeight={bodyLineHeight} setBodyLineHeight={setBodyLineHeight}
          entrySpacing={entrySpacing} setEntrySpacing={setEntrySpacing}
          sectionHeaderGap={sectionHeaderGap} setSectionHeaderGap={setSectionHeaderGap}
          entryTitleGap={entryTitleGap} setEntryTitleGap={setEntryTitleGap}
          pageMargin={pageMargin} setPageMargin={setPageMargin}
          sectionBorderStyle={sectionBorderStyle} setSectionBorderStyle={setSectionBorderStyle}
          photoShape={photoShape} setPhotoShape={setPhotoShape}
          photoSize={photoSize} setPhotoSize={setPhotoSize}
          photoBorder={photoBorder} setPhotoBorder={setPhotoBorder}
          headerStyle={headerStyle} setHeaderStyle={setHeaderStyle}
          nameFontSize={nameFontSize} setNameFontSize={setNameFontSize}
          nameFontWeight={nameFontWeight} setNameFontWeight={setNameFontWeight}
          nameTextTransform={nameTextTransform} setNameTextTransform={setNameTextTransform}
          nameLineBreak={nameLineBreak} setNameLineBreak={setNameLineBreak}
          titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize}
          titleFontStyle={titleFontStyle} setTitleFontStyle={setTitleFontStyle}
          contactFontSize={contactFontSize} setContactFontSize={setContactFontSize}
        />
      )}

      <div className="flex-1 overflow-auto bg-gray-50 border rounded-lg p-3 text-sm text-gray-500 shadow-inner custom-scrollbar">
        <BlockList cvId={cvId} blocks={currentCvBlocks} />
      </div>

      <div className="mt-4 space-y-2">
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

      {isAIPanelOpen && (
        <AIPromptPanel cvId={cvId} onClose={() => setIsAIPanelOpen(false)} />
      )}
    </div>
  );
}
