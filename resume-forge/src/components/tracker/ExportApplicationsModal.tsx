import { useState } from 'react';
import { X, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { exportApplicationsZip } from '@/lib/export-applications';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportApplicationsModal({ isOpen, onClose }: Props) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      await exportApplicationsZip({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setStatus({ type: 'success', message: 'Dossier exporté avec succès !' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de l\'export.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setStatus(null);
    setStartDate('');
    setEndDate('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Exporter les candidatures</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Génère un dossier ZIP avec un récap HTML et les pièces jointes.
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* Date range */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-700">
            Période <span className="font-normal text-gray-400">(optionnel — basé sur la date de candidature)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Du</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Au</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {!startDate && !endDate && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
              Sans sélection, toutes les candidatures seront exportées.
            </p>
          )}
        </div>

        {/* Status feedback */}
        {status && (
          <div className={`mt-4 flex items-start gap-2 p-3 rounded-md text-sm ${
            status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {status.type === 'success'
              ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
              : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
            {status.message}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting
              ? <><Loader2 size={15} className="animate-spin" /> Export en cours…</>
              : <><Download size={15} /> Exporter le dossier ZIP</>}
          </button>
        </div>
      </div>
    </div>
  );
}
