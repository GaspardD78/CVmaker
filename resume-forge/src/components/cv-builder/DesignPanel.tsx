interface DesignPanelProps {
  onFitToPage: () => void;
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
  return (
    <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg shadow-sm text-sm flex flex-col min-h-0 flex-shrink-0 max-h-[60vh]">
      <div className="p-3 pb-2 border-b border-purple-200 flex-shrink-0">
        <h3 className="font-semibold text-purple-900 mb-2">Design du CV</h3>
        {/* ✨ Magic fit-to-page button */}
        <button
          type="button"
          onClick={onFitToPage}
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

        {/* Entry titles */}
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
  );
}
