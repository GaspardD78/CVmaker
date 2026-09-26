import { useState } from 'react';
import { ChevronDown, ChevronUp, Palette, SlidersHorizontal, Settings2 } from 'lucide-react';
import type { CVTemplate } from '../../types/template';
import { DENSITY_PRESETS, type DensityId } from '../../theme/tokens';

interface DesignPanelProps {
  onFitToPage: () => void;
  /** Ajustement à une page en cours : bouton désactivé. */
  fitting?: boolean;
  template: CVTemplate;
  onApplyDensity: (id: DensityId) => void;
  onApplyPalette: (accent: string) => void;
  fontFamily: string; setFontFamily: (v: string) => void;
  fontSize: string; setFontSize: (v: string) => void;
  primaryColor: string; setPrimaryColor: (v: string) => void;
  headerFontSize: string; setHeaderFontSize: (v: string) => void;
  headerFontFamily: string; setHeaderFontFamily: (v: string) => void;
  headerFontWeight: string; setHeaderFontWeight: (v: string) => void;
  headerTextTransform: string; setHeaderTextTransform: (v: string) => void;
  headerTextAlign: string; setHeaderTextAlign: (v: string) => void;
  subtitleFontSize: string; setSubtitleFontSize: (v: string) => void;
  subtitleFontFamily: string; setSubtitleFontFamily: (v: string) => void;
  subtitleFontStyle: string; setSubtitleFontStyle: (v: string) => void;
  subtitleFontWeight: string; setSubtitleFontWeight: (v: string) => void;
  bodyFontFamily: string; setBodyFontFamily: (v: string) => void;
  bodyFontSize: string; setBodyFontSize: (v: string) => void;
  bodyTextAlign: string; setBodyTextAlign: (v: string) => void;
  bodyLineHeight: string; setBodyLineHeight: (v: string) => void;
  entrySpacing: string; setEntrySpacing: (v: string) => void;
  sectionHeaderGap: string; setSectionHeaderGap: (v: string) => void;
  entryTitleGap: string; setEntryTitleGap: (v: string) => void;
  pageMargin: string; setPageMargin: (v: string) => void;
  sectionBorderStyle: string; setSectionBorderStyle: (v: string) => void;
  photoShape: string; setPhotoShape: (v: string) => void;
  photoSize: string; setPhotoSize: (v: string) => void;
  photoBorder: string; setPhotoBorder: (v: string) => void;
  headerStyle: string; setHeaderStyle: (v: string) => void;
  nameFontSize: string; setNameFontSize: (v: string) => void;
  nameFontWeight: string; setNameFontWeight: (v: string) => void;
  nameTextTransform: string; setNameTextTransform: (v: string) => void;
  nameLineBreak: string; setNameLineBreak: (v: string) => void;
  titleFontSize: string; setTitleFontSize: (v: string) => void;
  titleFontStyle: string; setTitleFontStyle: (v: string) => void;
  contactFontSize: string; setContactFontSize: (v: string) => void;
}

export function DesignPanel({
  onFitToPage,
  fitting = false,
  template,
  onApplyDensity,
  onApplyPalette,
  fontFamily, setFontFamily,
  fontSize, setFontSize,
  primaryColor, setPrimaryColor,
  headerFontSize, setHeaderFontSize,
  headerFontFamily, setHeaderFontFamily,
  headerFontWeight, setHeaderFontWeight,
  headerTextTransform, setHeaderTextTransform,
  headerTextAlign, setHeaderTextAlign,
  subtitleFontSize, setSubtitleFontSize,
  subtitleFontFamily, setSubtitleFontFamily,
  subtitleFontStyle, setSubtitleFontStyle,
  subtitleFontWeight, setSubtitleFontWeight,
  bodyFontFamily, setBodyFontFamily,
  bodyFontSize, setBodyFontSize,
  bodyTextAlign, setBodyTextAlign,
  bodyLineHeight, setBodyLineHeight,
  entrySpacing, setEntrySpacing,
  sectionHeaderGap, setSectionHeaderGap,
  entryTitleGap, setEntryTitleGap,
  pageMargin, setPageMargin,
  sectionBorderStyle, setSectionBorderStyle,
  photoShape, setPhotoShape,
  photoSize, setPhotoSize,
  photoBorder, setPhotoBorder,
  headerStyle, setHeaderStyle,
  nameFontSize, setNameFontSize,
  nameFontWeight, setNameFontWeight,
  nameTextTransform, setNameTextTransform,
  nameLineBreak, setNameLineBreak,
  titleFontSize, setTitleFontSize,
  titleFontStyle, setTitleFontStyle,
  contactFontSize, setContactFontSize,
}: DesignPanelProps) {
  const [isStandardOpen, setIsStandardOpen] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 text-sm text-gray-900 pb-8">
      {/* ─── Zone 1: Style Rapide ─────────────────────────────────────── */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-purple-600" />
          <h3 className="font-semibold text-purple-900">Style Rapide</h3>
        </div>

        {(template.palettes && template.palettes.length > 0) && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-purple-800 mb-1.5">Palette</p>
            <div className="flex flex-wrap gap-1.5">
              {template.palettes.map(p => {
                const active = (primaryColor || '').toLowerCase() === p.accent.toLowerCase();
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onApplyPalette(p.accent)}
                    title={p.name}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      active ? 'border-gray-900 scale-110 ring-2 ring-purple-200' : 'border-white shadow-sm hover:scale-105'
                    }`}
                    style={{ backgroundColor: p.accent }}
                    aria-label={`Palette ${p.name}`}
                  />
                );
              })}
              {primaryColor && (
                <button
                  type="button"
                  onClick={() => onApplyPalette('')}
                  title="Réinitialiser"
                  className="h-7 px-2 text-[10px] font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 rounded-full"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-xs font-semibold text-purple-800 mb-1.5">Densité</p>
          <div className="grid grid-cols-3 gap-1">
            {(['compact', 'normal', 'comfortable'] as DensityId[]).map(id => (
              <button
                key={id}
                type="button"
                onClick={() => onApplyDensity(id)}
                className="text-[11px] font-medium py-1.5 px-1 rounded border border-gray-300 bg-white hover:bg-purple-100 hover:border-purple-400 transition-colors"
              >
                {DENSITY_PRESETS[id].name}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onFitToPage}
          disabled={fitting}
          aria-busy={fitting}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-md transition-colors shadow-sm disabled:opacity-60 disabled:cursor-wait"
        >
          <span>✨</span> {fitting ? 'Ajustement…' : 'Ajuster à 1 page'}
        </button>
      </div>

      {/* ─── Zone 2: Standard ─────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
        <button
          onClick={() => setIsStandardOpen(!isStandardOpen)}
          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Typographie & Mise en page</span>
          </div>
          {isStandardOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        
        {isStandardOpen && (
          <div className="p-3 space-y-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Police globale</label>
              <select
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-purple-200 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                <option value="Calibri">Calibri (défaut)</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Helvetica">Helvetica</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Taille du texte</label>
              <select
                value={fontSize}
                onChange={e => setFontSize(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-purple-200 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                <option value="10px">Petit (10pt)</option>
                <option value="11px">Normal (11pt)</option>
                <option value="12px">Grand (12pt)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Couleur d'accent libre</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={primaryColor || '#1f2937'}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{primaryColor || 'Auto (thème)'}</span>
                {primaryColor && (
                  <button
                    type="button"
                    onClick={() => setPrimaryColor('')}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Style d'en-tête</label>
              <select value={headerStyle} onChange={e => setHeaderStyle(e.target.value)}
                className="w-full p-1 border rounded text-sm focus:ring focus:ring-purple-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">Standard</option>
                <option value="accent-light">Fond coloré léger</option>
                <option value="accent-banner">Bandeau coloré</option>
                <option value="dark-banner">Bandeau sombre</option>
                <option value="gradient-banner">Dégradé coloré</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Marges de la page</label>
              <select value={pageMargin} onChange={e => setPageMargin(e.target.value)}
                className="w-full p-1 border rounded text-sm focus:ring focus:ring-purple-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">Auto</option>
                <option value="24px 28px">Étroites</option>
                <option value="32px 36px">Réduites</option>
                <option value="40px 48px">Normales</option>
                <option value="48px 56px">Larges</option>
                <option value="56px 64px">Très larges</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Bordure des sections</label>
              <select value={sectionBorderStyle} onChange={e => setSectionBorderStyle(e.target.value)}
                className="w-full p-1 border rounded text-sm focus:ring focus:ring-purple-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">Auto</option>
                <option value="solid">Ligne continue</option>
                <option value="dashed">Tirets</option>
                <option value="dotted">Pointillés</option>
                <option value="double">Double ligne</option>
                <option value="none">Aucune bordure</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ─── Zone 3: Avancé ─────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Réglages Avancés</span>
          </div>
          {isAdvancedOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {isAdvancedOpen && (
          <div className="p-3 space-y-4 border-t border-gray-200 dark:border-gray-700">
            
            {/* Section headers */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Titres de section</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Police</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Graisse</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Casse</label>
                  <select value={headerTextTransform} onChange={e => setHeaderTextTransform(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="none">Normal</option>
                    <option value="uppercase">MAJUSCULES</option>
                    <option value="capitalize">Capitalize</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Alignement</label>
                  <select value={headerTextAlign} onChange={e => setHeaderTextAlign(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="left">Gauche</option>
                    <option value="center">Centré</option>
                    <option value="right">Droite</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Entry titles */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Titres d'entrée <span className="font-normal text-gray-400">(postes, diplômes…)</span></p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Police</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Graisse</label>
                  <select value={subtitleFontWeight} onChange={e => setSubtitleFontWeight(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="normal">Normal</option>
                    <option value="500">Moyen</option>
                    <option value="bold">Gras</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Style</label>
                  <select value={subtitleFontStyle} onChange={e => setSubtitleFontStyle(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="normal">Normal</option>
                    <option value="italic">Italique</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Body */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Corps du texte</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Police</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Interligne</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Alignement</label>
                  <select value={bodyTextAlign} onChange={e => setBodyTextAlign(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="left">Gauche</option>
                    <option value="justify">Justifié</option>
                    <option value="center">Centré</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Entry spacing */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Espacements</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Entre blocs</label>
                  <select value={entrySpacing} onChange={e => setEntrySpacing(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="4px">Très serré</option>
                    <option value="8px">Serré</option>
                    <option value="16px">Normal</option>
                    <option value="24px">Aéré</option>
                    <option value="32px">Large</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Section → Entrée</label>
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
                    <label className="block text-xs text-gray-500 mb-0.5">Titre → Corps</label>
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
              </div>
            </div>

            {/* Photo settings */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Photo de profil</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Forme</label>
                  <select value={photoShape} onChange={e => setPhotoShape(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Cercle</option>
                    <option value="rounded-lg">Arrondi</option>
                    <option value="rounded-sm">Rect. arrondi</option>
                    <option value="rounded-none">Carré</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
                  <select value={photoSize} onChange={e => setPhotoSize(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Normale (96px)</option>
                    <option value="64px">Petite (64px)</option>
                    <option value="80px">Réduite (80px)</option>
                    <option value="112px">Grande (112px)</option>
                    <option value="128px">Très grande (128px)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Bordure</label>
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
            </div>

            {/* CV header typography (name / title / contact) */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Nom &amp; prénom</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Graisse</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Casse</label>
                  <select value={nameTextTransform} onChange={e => setNameTextTransform(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="none">Normal</option>
                    <option value="uppercase">MAJUSCULES</option>
                    <option value="capitalize">Capitalize</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Saut de ligne</label>
                  <select value={nameLineBreak} onChange={e => setNameLineBreak(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Sur une ligne</option>
                    <option value="split">Prénom / Nom</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Poste / Titre</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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
                  <label className="block text-xs text-gray-500 mb-0.5">Style</label>
                  <select value={titleFontStyle} onChange={e => setTitleFontStyle(e.target.value)}
                    className="w-full p-1 border rounded text-xs focus:ring focus:ring-purple-200">
                    <option value="">Auto</option>
                    <option value="normal">Normal</option>
                    <option value="italic">Italique</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">Coordonnées</p>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Taille</label>
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

          </div>
        )}
      </div>

    </div>
  );
}
