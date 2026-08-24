/**
 * Prompt stratège — conception assistée du portefeuille de pistes.
 *
 * Flux identique aux autres fonctions IA de l'app : l'utilisateur décrit son
 * intention, copie le prompt dans l'assistant de son choix, colle le JSON
 * obtenu, examine un aperçu, puis applique. Aucune clé API, aucun appel réseau.
 *
 * L'aperçu n'est pas une formalité : appliquer un portefeuille remplace des
 * pistes existantes, et l'utilisateur doit voir ce qui va changer avant que ça
 * ne change.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Sparkles, Wand2 } from 'lucide-react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import {
  buildPortfolioImportPreview,
  buildPortfolioStrategyPrompt,
  extractJson,
  validateAlertPortfolio,
  type PortfolioImportPreview,
} from '@/lib/watcher/ai-portfolio';
import { ALERT_KIND_LABELS, MAX_ALERTS } from '@/types/job-watch';

export function PortfolioStrategyPanel() {
  const alerts = useJobWatchStore(s => s.alerts);
  const activeSearchProfile = useJobWatchStore(s => s.activeSearchProfile);
  const applyPortfolioImport = useJobWatchStore(s => s.applyPortfolioImport);
  const { profile, entries } = useProfileStore();

  const [intent, setIntent] = useState('');
  const [mobility, setMobility] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [promptVisible, setPromptVisible] = useState(false);
  const [preview, setPreview] = useState<PortfolioImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const prompt = useMemo(() => {
    const reference = activeSearchProfile();
    return buildPortfolioStrategyPrompt({
      profileTitle: profile?.title ?? null,
      skills:       entries.filter(e => e.entryType === 'skill').map(e => e.title),
      experiences:  entries
        .filter(e => e.entryType === 'experience')
        .slice(0, 8)
        .map(e => ({ title: e.title, company: e.subtitle })),
      education:    entries.filter(e => e.entryType === 'education').map(e => e.title),
      intent,
      constraints: {
        locationLabel: reference.location.label || reference.location.city,
        radiusKm:      reference.location.radiusKm,
        mobility,
        contractTypes: reference.contractTypes,
        salaryMin:     reference.salary.min,
        salaryTarget:  reference.salary.target,
      },
      currentPortfolio: [...alerts]
        .sort((a, b) => a.position - b.position)
        .map(a => ({ name: a.name, kind: a.kind, jobTitles: a.searchProfile.jobTitles })),
    });
  }, [profile, entries, intent, mobility, alerts, activeSearchProfile]);

  const copyPrompt = async () => {
    setPromptVisible(true);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Prompt copié — collez-le dans ChatGPT, Claude ou Gemini');
    } catch {
      toast.info('Prompt généré — copiez-le manuellement ci-dessous');
    }
  };

  const handlePreview = () => {
    setParseError(null);
    setPreview(null);
    if (!jsonInput.trim()) {
      setParseError("Collez d'abord la réponse JSON générée par l'assistant.");
      return;
    }
    try {
      const { portfolio, warnings } = validateAlertPortfolio(extractJson(jsonInput));
      setPreview(buildPortfolioImportPreview(
        portfolio,
        alerts.map(a => ({ id: a.id, name: a.name })),
        warnings,
      ));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      await applyPortfolioImport(preview);
      toast.success(
        `Portefeuille appliqué : ${preview.creations.length} piste(s) créée(s), ${preview.replacements.length} remplacée(s)`,
      );
      setPreview(null);
      setJsonInput('');
      setIntent('');
      setPromptVisible(false);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  // Un portefeuille qui dépasserait la limite ne peut pas être appliqué tel quel.
  const blocking = preview?.warnings.some(w => w.includes('au-delà de la limite')) ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <Wand2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-indigo-800 dark:text-indigo-200">
          <p className="font-medium">Concevoir mon portefeuille de pistes</p>
          <p className="mt-1">
            L'assistant part de votre CV et de votre intention pour proposer 3 à {MAX_ALERTS} pistes
            <strong> complémentaires</strong> — cœur de cible, métier voisin, ouverture, angle étroit —
            en veillant à ce qu'elles ne ramènent pas les mêmes offres. Aucune clé API, aucun envoi réseau.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Votre intention de recherche
        </span>
        <textarea
          value={intent}
          onChange={e => setIntent(e.target.value)}
          rows={3}
          placeholder="Ex : je veux rester sur le recrutement mais m'ouvrir à la tech et au remote, sans descendre sous 45 k€."
          className="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Mobilité acceptée <span className="font-normal text-gray-400">(facultatif)</span>
        </span>
        <input
          value={mobility}
          onChange={e => setMobility(e.target.value)}
          placeholder="Ex : Île-de-France, ou remote total"
          className="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100"
        />
      </label>

      <button
        type="button"
        onClick={copyPrompt}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Générer le prompt stratège
      </button>

      {promptVisible && (
        <div className="relative">
          <textarea
            readOnly
            value={prompt}
            rows={8}
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-[11px] font-mono text-gray-600 dark:text-gray-300"
          />
          <button
            type="button"
            onClick={copyPrompt}
            className="absolute top-2 right-2 p-1.5 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            aria-label="Copier le prompt"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Réponse de l'assistant (JSON)
        </span>
        <textarea
          value={jsonInput}
          onChange={e => setJsonInput(e.target.value)}
          rows={4}
          placeholder='{ "version": "1.0", "alerts": [ … ] }'
          className="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono text-gray-800 dark:text-gray-100"
        />
      </label>

      <button
        type="button"
        onClick={handlePreview}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        Analyser la proposition
      </button>

      {parseError && (
        <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {parseError}
        </p>
      )}

      {preview && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            Aperçu — {preview.creations.length} création(s), {preview.replacements.length} remplacement(s)
          </p>

          {preview.warnings.map(warning => (
            <p
              key={warning}
              className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </p>
          ))}

          {[
            ...preview.creations.map(a => ({ action: 'Créer' as const, alert: a, replaced: null })),
            ...preview.replacements.map(r => ({ action: 'Remplacer' as const, alert: r.incoming, replaced: r.existingName })),
          ].map(({ action, alert, replaced }) => (
            <div key={alert.name} className="rounded border border-gray-200 dark:border-gray-700 p-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500 dark:text-gray-400">
                  {action}{replaced ? ` « ${replaced} »` : ''}
                </span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{alert.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{ALERT_KIND_LABELS[alert.kind]}</span>
              </div>
              {alert.rationale && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{alert.rationale}</p>
              )}
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                <div><dt className="inline font-medium">Titres : </dt><dd className="inline">{alert.searchProfile.jobTitles.join(', ')}</dd></div>
                <div><dt className="inline font-medium">Exclusions : </dt><dd className="inline">{alert.searchProfile.excludeTitles.join(', ')}</dd></div>
                <div><dt className="inline font-medium">Lieu : </dt><dd className="inline">{alert.searchProfile.location.label || alert.searchProfile.location.city || '—'} ({alert.searchProfile.location.radiusKm} km)</dd></div>
                <div><dt className="inline font-medium">Contrats : </dt><dd className="inline">{alert.searchProfile.contractTypes.join(', ') || 'tous'}</dd></div>
                <div className="sm:col-span-2"><dt className="inline font-medium">Sources : </dt><dd className="inline">{alert.sources.join(', ') || 'aucune'}</dd></div>
              </dl>
            </div>
          ))}

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Aucune offre déjà collectée n'est supprimée par cette opération.
          </p>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || blocking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Appliquer le portefeuille
          </button>
        </div>
      )}
    </div>
  );
}
