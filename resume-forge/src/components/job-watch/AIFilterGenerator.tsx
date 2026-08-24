/**
 * AIFilterGenerator — Phase 3 UI for the prompt-importable AI filter.
 *
 * Flow:
 *  1. User types their intent in a textarea.
 *  2. Clicks "Générer le prompt" → the assembled prompt is copied to the
 *     clipboard for pasting into ChatGPT / Claude / Gemini.
 *  3. User pastes the returned JSON into a second textarea and clicks
 *     "Valider" → `validateAIFilterRule` parses it and `saveAIFilterRule`
 *     persists it as a per-profile setting.
 *  4. A preview shows the active rule with a "Supprimer" action.
 *
 * No API call is made from this component — the LLM runs on the user's
 * side and the app only consumes its JSON output.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Sparkles, Trash2, CheckCircle2, AlertTriangle, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import {
  buildAIFilterPrompt,
  validateAIFilterRule,
  type AIFilterRule,
} from '@/lib/watcher/ai-filter';
import { ALERT_KIND_LABELS } from '@/types/job-watch';

function countClauses(rule: AIFilterRule): {
  exclusions: number;
  boosts: number;
  penalties: number;
} {
  const exclusions =
    (rule.excludeIfTitle?.length ?? 0) +
    (rule.excludeIfCompany?.length ?? 0) +
    (rule.excludeIfDescription?.length ?? 0) +
    (rule.excludeIfLocation?.length ?? 0);
  const boosts =
    (rule.boostIfTitleContains?.length ?? 0) +
    (rule.boostIfDescriptionContains?.length ?? 0) +
    (rule.boostIfCompany?.length ?? 0);
  const penalties =
    (rule.penalizeIfTitleContains?.length ?? 0) +
    (rule.penalizeIfDescriptionContains?.length ?? 0);
  return { exclusions, boosts, penalties };
}

export function AIFilterGenerator() {
  // La règle appartient à la piste sélectionnée : une règle globale forcerait
  // au plus petit dénominateur commun entre des explorations différentes.
  const alerts = useJobWatchStore(s => s.alerts);
  const activeAlert = useJobWatchStore(s => s.activeAlert);
  const updateAlert = useJobWatchStore(s => s.updateAlert);

  const currentAlert = activeAlert() ?? alerts[0] ?? null;
  const aiFilterRule = currentAlert?.aiFilterRule ?? null;

  const saveAIFilterRule = async (rule: AIFilterRule | null) => {
    if (!currentAlert) throw new Error('Aucune piste sélectionnée.');
    await updateAlert(currentAlert.id, { aiFilterRule: rule });
  };

  const [intent, setIntent] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [promptVisible, setPromptVisible] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const generatedPrompt = useMemo(
    () => buildAIFilterPrompt(
      intent,
      currentAlert
        ? {
            alert: {
              name:          currentAlert.name,
              kindLabel:     ALERT_KIND_LABELS[currentAlert.kind],
              jobTitles:     currentAlert.searchProfile.jobTitles,
              excludeTitles: currentAlert.searchProfile.excludeTitles,
              skills:        currentAlert.searchProfile.skills,
              domains:       currentAlert.searchProfile.domains,
            },
            otherAlerts: alerts
              .filter(a => a.id !== currentAlert.id)
              .sort((a, b) => a.position - b.position)
              .map(a => ({
                name:      a.name,
                kindLabel: ALERT_KIND_LABELS[a.kind],
                jobTitles: a.searchProfile.jobTitles,
              })),
          }
        : undefined,
    ),
    [intent, currentAlert, alerts],
  );
  const counts = aiFilterRule ? countClauses(aiFilterRule) : null;

  const handleGeneratePrompt = async () => {
    if (!intent.trim()) {
      toast.error('Décris d\'abord ton intention de recherche');
      return;
    }
    setPromptVisible(true);
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      toast.success('Prompt copié dans le presse-papier');
    } catch {
      toast.info('Prompt généré — copie-le manuellement ci-dessous');
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      toast.success('Prompt copié');
    } catch {
      toast.error('Impossible de copier — sélectionne le texte manuellement');
    }
  };

  const handleValidate = async () => {
    setParseError(null);
    if (!jsonInput.trim()) {
      setParseError('Colle d\'abord la réponse JSON générée par l\'IA.');
      return;
    }

    // Extract JSON from a possibly noisy response (some LLMs wrap in ```json)
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

    let rule: AIFilterRule;
    try {
      rule = validateAIFilterRule(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }

    try {
      await saveAIFilterRule(rule);
      toast.success(`Règle "${rule.name}" activée sur la piste « ${currentAlert?.name ?? ''} »`);
      setJsonInput('');
      setIntent('');
      setPromptVisible(false);
    } catch (err) {
      setParseError(`Erreur de sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer la règle IA de la piste « ${currentAlert?.name ?? ''} » ?`)) return;
    await saveAIFilterRule(null);
    toast.success('Règle IA désactivée');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-purple-800 dark:text-purple-200">
          <p className="font-medium">Filtre IA par prompt</p>
          <p className="mt-1">
            Décris ton intention, copie le prompt généré dans ChatGPT/Claude/Gemini, puis colle
            la réponse ici. La règle est appliquée localement — aucune clé API, aucun envoi réseau.
          </p>
          {currentAlert && (
            <p className="mt-1 font-medium">
              Cette règle ne s'appliquera qu'à la piste « {currentAlert.name} ».
              {alerts.length > 1 && ' Le prompt inclut les autres pistes pour éviter qu\'elle ne les recoupe.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Active rule preview ─────────────────────────────────────────────── */}
      {aiFilterRule && counts && (
        <div className="p-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-green-900 dark:text-green-100 truncate">
                  {aiFilterRule.name}
                </span>
              </div>
              {aiFilterRule.description && (
                <p className="text-xs text-green-800 dark:text-green-200 mt-1">{aiFilterRule.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-green-700 dark:text-green-300">
                <span>{counts.exclusions} exclusion{counts.exclusions > 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{counts.boosts} boost{counts.boosts > 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{counts.penalties} pénalité{counts.penalties > 1 ? 's' : ''}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Supprimer
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 1 — intent ──────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          1. Décris ton intention de recherche
        </label>
        <textarea
          value={intent}
          onChange={e => setIntent(e.target.value)}
          rows={3}
          placeholder="Ex: Je cherche un poste senior React/TypeScript, idéalement en remote, pas d'alternance ni de stage, éviter les banques et assurances."
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            onClick={handleGeneratePrompt}
            disabled={!intent.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Générer le prompt
          </Button>
          {promptVisible && (
            <Button size="sm" variant="outline" onClick={handleCopyPrompt}>
              <Copy className="w-3.5 h-3.5 mr-1" /> Recopier
            </Button>
          )}
        </div>
      </div>

      {/* ── Generated prompt (read-only preview) ────────────────────────────── */}
      {promptVisible && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            2. Colle ce prompt dans ChatGPT / Claude / Gemini
          </label>
          <textarea
            value={generatedPrompt}
            readOnly
            rows={6}
            className="w-full font-mono text-[11px] rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-gray-800 dark:text-gray-200"
          />
        </div>
      )}

      {/* ── Step 3 — paste JSON response ────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          3. Colle la réponse JSON de l'IA
        </label>
        <textarea
          value={jsonInput}
          onChange={e => { setJsonInput(e.target.value); setParseError(null); }}
          rows={8}
          placeholder={'{\n  "version": "1.0",\n  "name": "…",\n  …\n}'}
          className="w-full font-mono text-[11px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {parseError && (
          <div className="mt-2 flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-800 dark:text-red-200">{parseError}</p>
          </div>
        )}
        <div className="mt-2">
          <Button
            size="sm"
            onClick={handleValidate}
            disabled={!jsonInput.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileJson className="w-3.5 h-3.5 mr-1" /> Valider et activer
          </Button>
        </div>
      </div>
    </div>
  );
}
