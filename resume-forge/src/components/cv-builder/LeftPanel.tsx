import { useState, useEffect, useRef } from 'react';
import { useCvStore } from '@/stores/cvStore';
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

import { Settings, Palette } from 'lucide-react';

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
  const [fontFamily, setFontFamily] = useState(cvSettings.fontFamily || 'Calibri');
  const [fontSize, setFontSize] = useState(cvSettings.fontSize || '11px');
  const [primaryColor, setPrimaryColor] = useState(cvSettings.primaryColor || '#1f2937');

  const [headerFontSize, setHeaderFontSize]           = useState(cvSettings.headerFontSize      || '');
  const [headerFontWeight, setHeaderFontWeight]       = useState(cvSettings.headerFontWeight    || '');
  const [headerTextTransform, setHeaderTextTransform] = useState(cvSettings.headerTextTransform || '');
  const [headerTextAlign, setHeaderTextAlign]         = useState(cvSettings.headerTextAlign     || '');
  const [subtitleFontStyle, setSubtitleFontStyle]     = useState(cvSettings.subtitleFontStyle   || '');
  const [subtitleFontWeight, setSubtitleFontWeight]   = useState(cvSettings.subtitleFontWeight  || '');
  const [bodyTextAlign, setBodyTextAlign]             = useState(cvSettings.bodyTextAlign       || '');
  const [bodyLineHeight, setBodyLineHeight]           = useState(cvSettings.bodyLineHeight      || '');
  const [entrySpacing, setEntrySpacing]               = useState(cvSettings.entrySpacing        || '');
  const [pageMargin, setPageMargin]                   = useState(cvSettings.pageMargin          || '');
  const [sectionBorderStyle, setSectionBorderStyle]   = useState(cvSettings.sectionBorderStyle  || '');
  const [photoShape, setPhotoShape]                   = useState(cvSettings.photoShape          || '');
  const [photoSize, setPhotoSize]                     = useState(cvSettings.photoSize            || '');
  const [photoZoom, setPhotoZoom]                     = useState(cvSettings.photoZoom            || '');
  const [photoPositionX, setPhotoPositionX]           = useState(cvSettings.photoPositionX      || '');
  const [photoPositionY, setPhotoPositionY]           = useState(cvSettings.photoPositionY      || '');
  const [photoBorder, setPhotoBorder]                 = useState(cvSettings.photoBorder          || '');

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

  // Track what was last saved so we compare against local state only —
  // NOT against currentCv. This prevents the loop: updateCv → fetchCvById →
  // currentCv changes → effect re-runs → updateCv again (and the concurrent
  // write that would break template switching).
  const lastSavedDesign = useRef({
    fontFamily, fontSize, primaryColor,
    headerFontSize, headerFontWeight, headerTextTransform, headerTextAlign,
    subtitleFontStyle, subtitleFontWeight,
    bodyTextAlign, bodyLineHeight, entrySpacing,
    pageMargin, sectionBorderStyle,
    photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
  });

  useEffect(() => {
    const saved = lastSavedDesign.current;
    const current = {
      fontFamily, fontSize, primaryColor,
      headerFontSize, headerFontWeight, headerTextTransform, headerTextAlign,
      subtitleFontStyle, subtitleFontWeight,
      bodyTextAlign, bodyLineHeight, entrySpacing,
      pageMargin, sectionBorderStyle,
      photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
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
      headerFontSize, headerFontWeight, headerTextTransform, headerTextAlign,
      subtitleFontStyle, subtitleFontWeight,
      bodyTextAlign, bodyLineHeight, entrySpacing,
      pageMargin, sectionBorderStyle,
      photoShape, photoSize, photoZoom, photoPositionX, photoPositionY, photoBorder,
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

      {isDesignOpen && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg shadow-sm text-sm">
          <h3 className="font-semibold text-purple-900 mb-2">Design du CV</h3>
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
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border border-gray-300"
                />
                <span className="text-xs text-gray-500 font-mono">{primaryColor}</span>
              </div>
            </div>

            {/* Section headers */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Titres de section</p>
            <div className="grid grid-cols-2 gap-1">
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
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Style</label>
                <select value={subtitleFontStyle} onChange={e => setSubtitleFontStyle(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="italic">Italique</option>
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
            </div>

            {/* Body */}
            <p className="text-xs font-semibold text-purple-800 mt-3 mb-1 border-t border-purple-200 pt-2">Corps du texte</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Alignement</label>
                <select value={bodyTextAlign} onChange={e => setBodyTextAlign(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Auto</option>
                  <option value="left">Gauche</option>
                  <option value="justify">Justifié</option>
                  <option value="center">Centré</option>
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
                <label className="block text-xs text-gray-600 mb-0.5">Zoom</label>
                <select value={photoZoom} onChange={e => setPhotoZoom(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Normal (1x)</option>
                  <option value="1.15">Léger (1.15x)</option>
                  <option value="1.3">Moyen (1.3x)</option>
                  <option value="1.5">Fort (1.5x)</option>
                  <option value="2">Très fort (2x)</option>
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
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Cadrage H</label>
                <select value={photoPositionX} onChange={e => setPhotoPositionX(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Centre</option>
                  <option value="left">Gauche</option>
                  <option value="right">Droite</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Cadrage V</label>
                <select value={photoPositionY} onChange={e => setPhotoPositionY(e.target.value)}
                  className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                  <option value="">Centre</option>
                  <option value="top">Haut</option>
                  <option value="bottom">Bas</option>
                </select>
              </div>
            </div>
          </div>
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
