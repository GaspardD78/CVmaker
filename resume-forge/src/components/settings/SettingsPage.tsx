import { useState, useEffect, useRef } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Sparkles, Sun, Moon, Monitor, Briefcase } from 'lucide-react';
import { MODULES, ModuleId, BackupData, exportBackup, pickAndParseBackup } from '@/lib/backup';
import { ImportConflictModal } from './ImportConflictModal';
import { usePromptStore } from '@/stores/promptStore';
import { useTheme } from '@/hooks/useTheme';
import { getSetting, setSetting } from '@/lib/db';
import { DEFAULT_DIFFERENTIATOR } from '@/lib/prompt-templates';

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

  // ── Profil métier settings ───────────────────────────────────────────────
  const [sectorContext, setSectorContext] = useState('');
  const [profDifferentiator, setProfDifferentiator] = useState('');
  const [minKeywordLength, setMinKeywordLength] = useState('4');
  const [profSaved, setProfSaved] = useState(false);
  const profDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      getSetting('sector_context'),
      getSetting('differentiator'),
      getSetting('min_keyword_length'),
    ]).then(([sc, diff, mkl]) => {
      setSectorContext(sc ?? '');
      setProfDifferentiator(diff ?? DEFAULT_DIFFERENTIATOR);
      setMinKeywordLength(mkl ?? '4');
    }).catch(() => {});
  }, []);

  const saveProfSetting = (key: string, value: string) => {
    if (profDebounceRef.current) clearTimeout(profDebounceRef.current);
    profDebounceRef.current = setTimeout(async () => {
      await setSetting(key, value);
      setProfSaved(true);
      setTimeout(() => setProfSaved(false), 2000);
    }, 500);
  };

  const handleSectorContextChange = (value: string) => {
    setSectorContext(value);
    saveProfSetting('sector_context', value);
  };

  const handleProfDifferentiatorChange = (value: string) => {
    setProfDifferentiator(value);
    saveProfSetting('differentiator', value);
  };

  const handleMinKeywordLengthChange = (value: string) => {
    setMinKeywordLength(value);
    saveProfSetting('min_keyword_length', value);
  };

  // ── Theme ───────────────────────────────────────────────────────────────
  const { theme, setTheme } = useTheme();

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
      <h1 className="text-2xl font-bold mb-1 dark:text-gray-100">Paramètres</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">Configuration et gestion des données de l'application.</p>

      {/* ── Apparence ── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Sun size={18} className="text-yellow-500" />
            <h2 className="text-base font-semibold dark:text-gray-100">Apparence</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choisissez le thème de l'application.
          </p>
        </div>
        <div className="p-6">
          <div className="flex gap-3">
            {([
              { value: 'light' as const, label: 'Clair', icon: Sun },
              { value: 'dark' as const, label: 'Sombre', icon: Moon },
              { value: 'system' as const, label: 'Système', icon: Monitor },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  theme === value
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Profil métier ── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold dark:text-gray-100">Profil métier</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configurez le contexte sectoriel utilisé dans les prompts IA et le scoring.
            {profSaved && <span className="ml-2 text-green-600 font-medium">✓ Enregistré</span>}
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Secteur / contexte métier
            </label>
            <input
              type="text"
              value={sectorContext}
              onChange={e => handleSectorContextChange(e.target.value)}
              placeholder="ex: Technique spectacle, Fonction publique territoriale"
              className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Injecté dans les prompts IA via le placeholder <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{'`contexte_métier`{'}'}</code>.
              Laissez vide pour le comportement par défaut (cybersécurité/RH).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Atout différenciant
            </label>
            <textarea
              value={profDifferentiator}
              onChange={e => handleProfDifferentiatorChange(e.target.value)}
              placeholder={DEFAULT_DIFFERENTIATOR}
              className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm resize-y h-20 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Phrase unique qui vous distingue. Injectée dans les prompts d'entretien et de message de candidature.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Longueur minimale des mots-clés
            </label>
            <div className="flex gap-3">
              {['3', '4', '5'].map(val => (
                <button
                  key={val}
                  onClick={() => handleMinKeywordLengthChange(val)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    minKeywordLength === val
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                      : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {val} caractères
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Les tokens plus courts sont ignorés lors du scoring de compatibilité.
            </p>
          </div>
        </div>
      </section>

      {/* ── AI Prompt Personalization ── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold dark:text-gray-100">Personnalisation des prompts IA</h2>
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
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Download size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold dark:text-gray-100">Sauvegarde des données</h2>
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
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={18} className="text-orange-500" />
            <h2 className="text-base font-semibold dark:text-gray-100">Restauration des données</h2>
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
