import { FileText } from 'lucide-react';

interface SummaryPanelProps {
  customSummary: string;
  setCustomSummary: (v: string) => void;
  summaryFontFamily: string;
  setSummaryFontFamily: (v: string) => void;
  summaryFontSize: string;
  setSummaryFontSize: (v: string) => void;
  summaryFontWeight: string;
  setSummaryFontWeight: (v: string) => void;
  summaryFontStyle: string;
  setSummaryFontStyle: (v: string) => void;
  summaryTextAlign: string;
  setSummaryTextAlign: (v: string) => void;
  summaryLineHeight: string;
  setSummaryLineHeight: (v: string) => void;
}

export function SummaryPanel({
  customSummary, setCustomSummary,
  summaryFontFamily, setSummaryFontFamily,
  summaryFontSize, setSummaryFontSize,
  summaryFontWeight, setSummaryFontWeight,
  summaryFontStyle, setSummaryFontStyle,
  summaryTextAlign, setSummaryTextAlign,
  summaryLineHeight, setSummaryLineHeight,
}: SummaryPanelProps) {
  return (
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
  );
}
