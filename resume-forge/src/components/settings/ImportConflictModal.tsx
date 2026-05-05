import { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  BackupData,
  ImportPlan,
  ImportStrategy,
  ModuleId,
  MODULES,
  detectModules,
  countRows,
  importBackup,
} from '@/lib/backup';

interface Props {
  backup: BackupData;
  onClose: () => void;
  onDone: () => void;
}

const STRATEGY_LABELS: Record<ImportStrategy, string> = {
  replace: 'Remplacer',
  merge: 'Fusionner',
  ignore: 'Ignorer',
};

const STRATEGY_HINTS: Record<ImportStrategy, string> = {
  replace: 'Supprime toutes les données existantes pour ce module, puis importe celles de la sauvegarde.',
  merge: 'Ajoute ou met à jour les entrées par identifiant. Les données non présentes dans la sauvegarde sont conservées.',
  ignore: 'Importe uniquement les entrées dont l\'identifiant n\'existe pas encore. Rien n\'est écrasé.',
};

export function ImportConflictModal({ backup, onClose, onDone }: Props) {
  const presentModules = detectModules(backup);

  const [plan, setPlan] = useState<ImportPlan>(() =>
    Object.fromEntries(presentModules.map(id => [id, 'merge' as ImportStrategy])) as ImportPlan
  );
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasReplace = Object.values(plan).some(s => s === 'replace');

  const setStrategy = (moduleId: ModuleId, strategy: ImportStrategy) => {
    setPlan(prev => ({ ...prev, [moduleId]: strategy }));
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      await importBackup(backup, plan);

      // Refresh stores so the UI reflects imported data immediately
      const { useProfileStore } = await import('@/stores/profileStore');
      await useProfileStore.getState().fetchProfile();
      if (plan.cvDocuments && plan.cvDocuments !== 'ignore') {
        const { useCvStore } = await import('@/stores/cvStore');
        await useCvStore.getState().fetchCvs();
      }
      if (plan.applications && plan.applications !== 'ignore') {
        const { useApplicationStore } = await import('@/stores/applicationStore');
        await useApplicationStore.getState().fetchApplications();
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import.');
    } finally {
      setIsImporting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Import réussi</h2>
          <p className="text-sm text-gray-500 mb-6">
            Les données ont été importées avec succès.
          </p>
          <button
            onClick={onDone}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold dark:text-gray-100">Résolution des conflits</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sauvegarde du {new Date(backup.exportDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              {' · '}v{backup.version}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
            <X size={20} />
          </button>
        </div>

        {/* Module table */}
        <div className="overflow-y-auto flex-1 p-6 min-h-0">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Pour chaque module présent dans la sauvegarde, choisissez comment gérer les conflits avec vos données actuelles.
          </p>

          <div className="space-y-3">
            {presentModules.map(moduleId => {
              const meta = MODULES.find(m => m.id === moduleId)!;
              const rowCount = countRows(backup, moduleId);
              const currentStrategy = plan[moduleId] ?? 'ignore';

              return (
                <div key={moduleId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-medium text-sm dark:text-gray-100">{meta.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                        {rowCount} enregistrement{rowCount > 1 ? 's' : ''} dans la sauvegarde
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(['replace', 'merge', 'ignore'] as ImportStrategy[]).map(strategy => (
                      <button
                        key={strategy}
                        onClick={() => setStrategy(moduleId, strategy)}
                        className={`flex-1 text-xs py-1.5 rounded border transition ${
                          currentStrategy === strategy
                            ? strategy === 'replace'
                              ? 'bg-red-600 text-white border-red-600'
                              : strategy === 'merge'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-gray-500 text-white border-gray-500'
                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        {STRATEGY_LABELS[strategy]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 flex items-start gap-1">
                    <Info size={11} className="mt-0.5 flex-shrink-0" />
                    {STRATEGY_HINTS[currentStrategy]}
                  </p>
                </div>
              );
            })}
          </div>

          {hasReplace && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>
                Le mode <strong>Remplacer</strong> supprime définitivement toutes les données existantes du module concerné avant d'importer.
                Cette action est irréversible.
              </span>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || presentModules.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isImporting ? 'Import en cours…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
