/**
 * SelectorDebugPanel — AI-assisted CSS selector debugger for WebView parsers.
 *
 * Shown inline in HealthDashboard when a WebView source (LinkedIn, Indeed,
 * HelloWork) returned 0 offers and captured debug HTML during the last fetch.
 *
 * Flow:
 *  1. Panel shows how much HTML was captured + what override is active.
 *  2. "Générer le prompt" copies a fully-documented debug prompt to clipboard.
 *  3. User pastes it into ChatGPT/Claude/Gemini and copies the JSON response.
 *  4. User pastes JSON here → "Valider" applies the override immediately.
 *  5. Next fetch will use the updated selectors; "Effacer" reverts to defaults.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Wrench, Trash2, CheckCircle2, AlertTriangle, FileJson, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import {
  buildSelectorDebugPrompt,
  validateSelectorOverride,
  WEBVIEW_SOURCES,
  SELECTOR_OVERRIDE_VERSION,
  type SelectorOverride,
} from '@/lib/watcher/selector-debug';
import { SOURCE_LABELS } from '@/lib/watcher/sources';
import type { JobSource } from '@/types/job-watch';

/** Current defaults surfaced in the prompt so the LLM knows what failed */
const DEFAULT_SELECTORS_BY_SOURCE: Record<string, Record<string, string>> = {
  linkedin: {
    waitSelector: '[data-job-id], [data-occludable-job-id], .scaffold-layout__list-container',
    cardSelector: 'li[data-occludable-job-id], li[data-job-id], .jobs-search-results__list-item',
    titleSelector: 'a[aria-label], h3, h2, .job-card-list__title, .base-search-card__title',
    companySelector: '.job-card-container__primary-description, .base-search-card__subtitle, h4',
    locationSelector: '.job-card-container__metadata-item, .job-search-card__location',
    linkSelector: 'a[href*="/jobs/view/"]',
  },
  indeed: {
    waitSelector: '#mosaic-provider-jobcards, .jobsearch-ResultsList',
    cardSelector: '.resultContent, .job_seen_beacon, [data-jk]',
    titleSelector: 'h2 a, .jobTitle a',
    companySelector: '.companyName, [data-testid="company-name"]',
    locationSelector: '.companyLocation, [data-testid="text-location"]',
    linkSelector: 'h2 a, .jobTitle a',
  },
  hellowork: {
    waitSelector: '[data-cy="serpCard"]',
    cardSelector: '[data-cy="serpCard"]',
    titleSelector: '[data-cy="job-title"], h2',
    companySelector: '[data-cy="company-name"]',
    locationSelector: '[data-cy="location"]',
    linkSelector: 'a[href]',
  },
};

interface SelectorDebugPanelProps {
  source: JobSource;
}

export function SelectorDebugPanel({ source }: SelectorDebugPanelProps) {
  const debugInfo = useJobWatchStore(s => s.selectorDebugInfo[source]);
  const override  = useJobWatchStore(s => s.selectorOverrides[source]);
  const saveSelectorOverride = useJobWatchStore(s => s.saveSelectorOverride);

  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);

  if (!WEBVIEW_SOURCES.has(source)) return null;

  const sourceLabel = SOURCE_LABELS[source] ?? source;
  const currentSelectors = override
    ? {
        waitSelector:    override.waitSelector    ?? undefined,
        cardSelector:    override.cardSelector    ?? undefined,
        titleSelector:   override.titleSelector   ?? undefined,
        companySelector: override.companySelector ?? undefined,
        locationSelector: override.locationSelector ?? undefined,
        linkSelector:    override.linkSelector    ?? undefined,
      }
    : (DEFAULT_SELECTORS_BY_SOURCE[source] ?? {});

  const generatedPrompt = debugInfo
    ? buildSelectorDebugPrompt(source, debugInfo.url, debugInfo.html, currentSelectors)
    : null;

  const handleGeneratePrompt = async () => {
    if (!generatedPrompt) return;
    setPromptVisible(true);
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      toast.success('Prompt copié dans le presse-papier');
    } catch {
      toast.info('Prompt généré — copie-le manuellement ci-dessous');
    }
  };

  const handleValidate = async () => {
    setParseError(null);
    let raw = jsonInput.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
    if (fenced) raw = fenced[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      setParseError(`JSON invalide : ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    let result: SelectorOverride;
    try {
      result = validateSelectorOverride(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (result.source !== source) {
      setParseError(`Source incorrecte : attendu "${source}", reçu "${result.source}".`);
      return;
    }

    try {
      await saveSelectorOverride(source, result);
      toast.success(`Sélecteurs ${sourceLabel} mis à jour — prendra effet à la prochaine collecte`);
      setJsonInput('');
      setPromptVisible(false);
    } catch (err) {
      setParseError(`Erreur de sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleClear = async () => {
    if (!window.confirm(`Supprimer la correction de sélecteurs pour ${sourceLabel} ?`)) return;
    await saveSelectorOverride(source, null);
    toast.success(`Sélecteurs ${sourceLabel} réinitialisés aux valeurs par défaut`);
  };

  return (
    <div className="space-y-2.5">
      {/* Context line */}
      <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-800 dark:text-amber-200">
        <Wrench className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-0.5">
          <p className="font-medium">Les sélecteurs CSS de {sourceLabel} ont peut-être changé</p>
          {debugInfo ? (
            <p className="text-amber-700 dark:text-amber-300">
              HTML capturé le {new Date(debugInfo.timestamp).toLocaleTimeString('fr-FR')} —{' '}
              {(debugInfo.html.length / 1000).toFixed(1)} Ko (scripts/styles retirés) depuis{' '}
              <span className="font-mono text-[10px] break-all">{debugInfo.url}</span>
            </p>
          ) : (
            <p className="text-amber-700 dark:text-amber-300">
              Lance une collecte pour capturer le HTML et activer le débogage.
            </p>
          )}
        </div>
      </div>

      {/* Active override badge */}
      {override && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-green-800 dark:text-green-200 font-medium">
              Correction active depuis {new Date(override.updatedAt).toLocaleDateString('fr-FR')}
            </span>
          </div>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 hover:underline"
          >
            <Trash2 className="w-3 h-3" /> Effacer
          </button>
        </div>
      )}

      {/* Generate prompt — only when debug HTML is available */}
      {debugInfo && (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGeneratePrompt}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
            >
              <Wrench className="w-3 h-3 mr-1" /> Générer le prompt IA
            </Button>
            {promptVisible && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!generatedPrompt) return;
                  await navigator.clipboard.writeText(generatedPrompt).catch(() => {});
                  toast.success('Prompt recopié');
                }}
              >
                <Copy className="w-3 h-3 mr-1" /> Recopier
              </Button>
            )}
          </div>

          {/* Prompt preview */}
          {promptVisible && generatedPrompt && (
            <div>
              <button
                className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 mb-1"
                onClick={() => setPromptVisible(v => !v)}
              >
                {promptVisible ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Voir le prompt complet
              </button>
              <textarea
                value={generatedPrompt}
                readOnly
                rows={6}
                className="w-full font-mono text-[10px] rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-gray-700 dark:text-gray-300 resize-none"
              />
            </div>
          )}

          {/* Paste JSON response */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
              Colle ici la réponse JSON de l'IA
            </label>
            <textarea
              value={jsonInput}
              onChange={e => { setJsonInput(e.target.value); setParseError(null); }}
              rows={6}
              placeholder={`{\n  "version": "${SELECTOR_OVERRIDE_VERSION}",\n  "source": "${source}",\n  "cardSelector": "…",\n  …\n}`}
              className="w-full font-mono text-[10px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            {parseError && (
              <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-red-800 dark:text-red-200">{parseError}</p>
              </div>
            )}
            <div className="mt-1.5">
              <Button
                size="sm"
                onClick={handleValidate}
                disabled={!jsonInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                <FileJson className="w-3 h-3 mr-1" /> Valider et appliquer
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
