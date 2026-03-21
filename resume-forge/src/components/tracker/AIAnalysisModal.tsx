import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Sparkles, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCompatibilityStore, AIAnalysisRaw } from '@/stores/compatibilityStore';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { resolvePrompt } from '@/lib/prompt-resolver';
import { CV_ANALYSIS_TEMPLATE } from '@/lib/prompt-templates';
import type { Application } from '@/types/application';

interface Props {
  application: Application;
  onClose: () => void;
}

type Step = 'generate' | 'paste';

// ---------------------------------------------------------------------------
// JSON validation
// ---------------------------------------------------------------------------

function validateAIJson(obj: unknown): obj is AIAnalysisRaw {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.score_global !== 'number') return false;
  if (typeof o.scores !== 'object' || o.scores === null) return false;
  const s = o.scores as Record<string, unknown>;
  if (
    typeof s.competences !== 'number' ||
    typeof s.experience !== 'number' ||
    typeof s.formation !== 'number' ||
    typeof s.couverture !== 'number'
  ) return false;
  if (!Array.isArray(o.points_forts)) return false;
  if (!Array.isArray(o.points_friction)) return false;
  if (!Array.isArray(o.recommandations)) return false;
  if (!Array.isArray(o.mots_cles_manquants)) return false;
  if (!Array.isArray(o.mots_cles_presents)) return false;
  if (typeof o.synthese !== 'string') return false;
  return true;
}

/** Try to extract a JSON object from text that may contain markdown fences. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json ... ``` or ``` ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonStr);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIAnalysisModal({ application, onClose }: Props) {
  const { saveFromAI, saving } = useCompatibilityStore();
  const { cvs, currentCvBlocks, fetchCvBlocks } = useCvStore();
  const { profile, entries, fetchProfile } = useProfileStore();

  const [step, setStep] = useState<Step>('generate');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const isSaving = saving[application.id] ?? false;

  // Ensure profile + CV blocks are loaded
  useEffect(() => {
    fetchProfile();
    if (application.cvId) {
      fetchCvBlocks(application.cvId);
    }
  }, [application.cvId, fetchCvBlocks, fetchProfile]);

  // Generate prompt once blocks and profile are available
  useEffect(() => {
    if (!profile || !application.cvId) return;
    const cv = cvs.find(c => c.id === application.cvId);
    if (!cv) return;
    if (currentCvBlocks.length === 0) return;

    const generated = resolvePrompt(CV_ANALYSIS_TEMPLATE.id, {
      profile,
      cv,
      blocks: currentCvBlocks,
      entries,
      jobOffer: application.jobDescription ?? '',
    });
    setPrompt(generated);
  }, [profile, cvs, currentCvBlocks, entries, application.cvId, application.jobDescription]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier dans le presse-papiers.');
    }
  }, [prompt]);

  const handleImport = useCallback(async () => {
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = extractJson(jsonInput);
    } catch {
      setParseError('JSON invalide — vérifie que tu as bien copié la réponse complète de l\'IA.');
      return;
    }

    if (!validateAIJson(parsed)) {
      setParseError(
        'Le JSON ne correspond pas au format attendu. Assure-toi d\'avoir utilisé le prompt généré et que l\'IA a bien retourné tous les champs requis.',
      );
      return;
    }

    // Clamp scores 0–100
    const safe: AIAnalysisRaw = {
      ...parsed,
      score_global: Math.min(100, Math.max(0, parsed.score_global)),
      scores: {
        competences: Math.min(100, Math.max(0, parsed.scores.competences)),
        experience:  Math.min(100, Math.max(0, parsed.scores.experience)),
        formation:   Math.min(100, Math.max(0, parsed.scores.formation)),
        couverture:  Math.min(100, Math.max(0, parsed.scores.couverture)),
      },
    };

    try {
      await saveFromAI(application.id, application.cvId!, safe);
      toast.success('Analyse IA importée avec succès.');
      onClose();
    } catch {
      toast.error('Erreur lors de l\'enregistrement de l\'analyse.');
    }
  }, [jsonInput, application.id, application.cvId, saveFromAI, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-[680px] max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-500" />
            <h2 className="text-base font-bold text-gray-900">Analyse IA — {application.jobTitle}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b bg-gray-50">
          <StepTab
            number={1}
            label="Générer le prompt"
            active={step === 'generate'}
            onClick={() => setStep('generate')}
          />
          <ChevronRight size={16} className="self-center text-gray-300" />
          <StepTab
            number={2}
            label="Importer la réponse IA"
            active={step === 'paste'}
            onClick={() => setStep('paste')}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 'generate' && (
            <>
              <p className="text-sm text-gray-600">
                Ce prompt contient ton CV et le texte de l'offre.
                Copie-le et colle-le dans l'IA de ton choix (Claude, ChatGPT, Gemini…).
              </p>

              {!application.jobDescription?.trim() && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Aucun texte d'annonce renseigné. L'analyse sera moins précise.
                    Colle le texte de l'offre dans le panneau "Score de compatibilité" avant de générer.
                  </span>
                </div>
              )}

              {!prompt && (
                <p className="text-xs text-gray-400 italic">Chargement du prompt…</p>
              )}

              {prompt && (
                <div className="relative">
                  <textarea
                    readOnly
                    value={prompt}
                    rows={18}
                    className="w-full text-xs font-mono px-3 py-3 border border-gray-200 rounded-lg bg-gray-50 resize-none focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors"
                  >
                    {copied
                      ? <><Check size={12} /> Copié !</>
                      : <><Copy size={12} /> Copier</>}
                  </button>
                </div>
              )}

              <button
                onClick={() => setStep('paste')}
                disabled={!prompt}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                Suivant — coller la réponse de l'IA
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {step === 'paste' && (
            <>
              <p className="text-sm text-gray-600">
                Colle ici le JSON retourné par l'IA. Il doit commencer par <code className="text-xs bg-gray-100 px-1 rounded">{`{`}</code> et contenir les champs <code className="text-xs bg-gray-100 px-1 rounded">score_global</code>, <code className="text-xs bg-gray-100 px-1 rounded">scores</code>, etc.
              </p>

              <textarea
                value={jsonInput}
                onChange={e => { setJsonInput(e.target.value); setParseError(null); }}
                placeholder={'{\n  "score_global": 78,\n  "scores": { "competences": 82, ... },\n  ...\n}'}
                rows={16}
                className="w-full text-xs font-mono px-3 py-3 border border-gray-200 rounded-lg bg-gray-50 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />

              {parseError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('generate')}
                  className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={handleImport}
                  disabled={!jsonInput.trim() || isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {isSaving
                    ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
                    : <><Sparkles size={14} /> Importer l'analyse</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step tab sub-component
// ---------------------------------------------------------------------------

function StepTab({
  number, label, active, onClick,
}: {
  number: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
        active
          ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white -mb-px'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
        active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
      }`}>
        {number}
      </span>
      {label}
    </button>
  );
}
