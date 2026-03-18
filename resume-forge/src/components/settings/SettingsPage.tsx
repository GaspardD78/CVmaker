import { useState, useEffect } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { MODULES, ModuleId, BackupData, exportBackup, pickAndParseBackup } from '@/lib/backup';
import { ImportConflictModal } from './ImportConflictModal';
import { usePromptStore } from '@/stores/promptStore';

export function SettingsPage() {
  // ── AI Differentiator ───────────────────────────────────────────────────
  const { differentiator, loadDifferentiator, saveDifferentiator, isLoaded } = usePromptStore();
  const [localDifferentiator, setLocalDifferentiator] = useState('');
  const [diffSaved, setDiffSaved] = useState(false);

  useEffect(() => {
    if (!isLoaded) loadDifferentiator();
  }, [isLoaded, loadDifferentiator]);

  useEffect(() => {
    if (isLoaded) setLocalDifferentiator(differentiator);
  }, [isLoaded, differentiator]);

  const handleSaveDifferentiator = async () => {
    await saveDifferentiator(localDifferentiator);
    setDiffSaved(true);
    setTimeout(() => setDiffSaved(false), 2000);
  };

  // ── Export state ──────────────────────────────────────────────────────────
  const [selectedModules, setSelectedModules] = useState<Set<ModuleId>>(
    new Set(MODULES.map(m => m.id))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Import state ──────────────────────────────────────────────────────────
  const [isParsing, setIsParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);

  // ── Module toggle ─────────────────────────────────────────────────────────
  const toggleModule = (id: ModuleId) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedModules.size === MODULES.length) setSelectedModules(new Set());
    else setSelectedModules(new Set(MODULES.map(m => m.id)));
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (selectedModules.size === 0) return;
    setIsExporting(true);
    setExportStatus(null);
    try {
      await exportBackup([...selectedModules]);
      setExportStatus({ ok: true, message: 'Sauvegarde exportée avec succès.' });
    } catch (err) {
      setExportStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Erreur lors de l\'export.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handlePickFile = async () => {
    setIsParsing(true);
    setImportError(null);
    try {
      const backup = await pickAndParseBackup();
      if (backup) setPendingBackup(backup);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Impossible de lire le fichier.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Paramètres</h1>
      <p className="text-gray-500 text-sm mb-8">Configuration et gestion des données de l'application.</p>

      {/* ── AI Prompt Personalization ── */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold">Personnalisation des prompts IA</h2>
          </div>
          <p className="text-sm text-gray-500">
            Ces paramètres sont utilisés par le générateur de prompts dans le CV builder.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Votre atout différenciant
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Décrivez en une phrase ce qui vous distingue des autres candidats.
              Ce texte sera injecté dans les prompts d'entretien et de message de candidature.
            </p>
            <textarea
              value={localDifferentiator}
              onChange={e => setLocalDifferentiator(e.target.value)}
              placeholder={"Ex: Jeu de cartes pédagogique conçu pour standardiser l'évaluation technique des candidats"}
              className="w-full p-2.5 border border-gray-300 rounded-md text-sm resize-y h-20 focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
            />
          </div>

          <button
            onClick={handleSaveDifferentiator}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
              diffSaved
                ? 'bg-green-100 text-green-700 border border-green-300'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {diffSaved ? (
              <><CheckCircle2 size={15} /> Enregistré</>
            ) : (
              'Enregistrer'
            )}
          </button>
        </div>
      </section>

      {/* ── Backup section ── */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Download size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold">Sauvegarde des données</h2>
          </div>
          <p className="text-sm text-gray-500">
            Exporte vos données dans un fichier <code className="bg-gray-100 px-1 rounded text-xs">.cvmaker</code> que vous pouvez stocker ou transférer sur une autre installation.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Module checkboxes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Modules à inclure</p>
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:underline"
              >
                {selectedModules.size === MODULES.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div className="space-y-2">
              {MODULES.map(m => (
                <label
                  key={m.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedModules.has(m.id)}
                    onChange={() => toggleModule(m.id)}
                    className="mt-0.5 w-4 h-4 rounded accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.label}</p>
                    <p className="text-xs text-gray-500">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Export feedback */}
          {exportStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
              exportStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {exportStatus.ok
                ? <CheckCircle2 size={15} />
                : <AlertCircle size={15} />}
              {exportStatus.message}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting || selectedModules.size === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting
              ? <><Loader2 size={15} className="animate-spin" /> Export en cours…</>
              : <><Download size={15} /> Télécharger la sauvegarde</>}
          </button>
        </div>
      </section>

      {/* ── Restore section ── */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={18} className="text-orange-500" />
            <h2 className="text-base font-semibold">Restauration des données</h2>
          </div>
          <p className="text-sm text-gray-500">
            Importe un fichier <code className="bg-gray-100 px-1 rounded text-xs">.cvmaker</code> pour restaurer ou fusionner des données.
            Vous pourrez choisir la stratégie module par module.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              Certaines stratégies d'import peuvent écraser vos données actuelles de façon irréversible.
              Pensez à faire une sauvegarde avant d'importer.
            </span>
          </div>

          {importError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              {importError}
            </div>
          )}

          <button
            onClick={handlePickFile}
            disabled={isParsing}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isParsing
              ? <><Loader2 size={15} className="animate-spin" /> Lecture du fichier…</>
              : <><Upload size={15} /> Choisir un fichier .cvmaker</>}
          </button>
        </div>
      </section>

      {/* Conflict resolution modal */}
      {pendingBackup && (
        <ImportConflictModal
          backup={pendingBackup}
          onClose={() => setPendingBackup(null)}
          onDone={() => setPendingBackup(null)}
        />
      )}
    </div>
  );
}
