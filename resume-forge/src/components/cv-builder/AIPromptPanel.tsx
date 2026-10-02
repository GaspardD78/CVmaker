import { useState, useEffect, useMemo } from 'react';
import { Copy, Check, Sparkles, Wand2 } from 'lucide-react';
import { usePromptStore } from '@/stores/promptStore';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { PROMPT_TEMPLATES, generateFullCVMatchPrompt } from '@/lib/prompt-templates';
import { analyzeAiCvJson } from '@/lib/ai-cv-pipeline';
import { AiCvGuardReport } from './AiCvGuardReport';
import { applyAiCvToBlocks } from '@/lib/apply-ai-cv';
import { CVBlock, CVDocument } from '@/types/cv';
import { toast } from 'sonner';

interface AIPromptPanelProps {
  cvId: string;
  onClose: () => void;
}

export function AIPromptPanel({ onClose }: AIPromptPanelProps) {
  const { profile, entries } = useProfileStore();
  const { currentCv, currentCvBlocks } = useCvStore();
  const {
    jobOffer, setJobOffer,
    selectedTemplateId, selectTemplate,
    generatedPrompt, generatePrompt,
    loadDifferentiator,
    isLoaded,
    targetPages, loadTargetPages,
  } = usePromptStore();

  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standard' | 'full'>('standard');
  const [jsonInput, setJsonInput] = useState('');
  const [fullPromptCopied, setFullPromptCopied] = useState(false);
  const [clarify, setClarify] = useState(false);

  useEffect(() => {
    if (!isLoaded) loadDifferentiator();
    loadTargetPages();
  }, [isLoaded, loadDifferentiator, loadTargetPages]);

  // Parse + garde-fou du JSON collé (rapport affiché avant l'application).
  const analysis = useMemo(
    () => (jsonInput.trim() ? analyzeAiCvJson(jsonInput, { entries, profile, pageBudget: targetPages }) : null),
    [jsonInput, entries, profile, targetPages],
  );
  const hasBlockingIssues = analysis !== null && analysis.ok && analysis.report.errors.length > 0;

  const selectedTemplate = PROMPT_TEMPLATES.find(t => t.id === selectedTemplateId);

  // Entry ref blocks visible in the current CV (for "reformulate experience" selector)
  const visibleEntryBlocks = currentCvBlocks.filter(
    b => b.isVisible && b.blockType === 'entry_ref' && b.entryId
  );

  const getBlockLabel = (block: CVBlock): string => {
    const entry = entries.find(e => e.id === block.entryId);
    if (!entry) return '(entrée inconnue)';
    const data = { ...entry, ...block.overrideData };
    const title = (data.title as string) || entry.title;
    const subtitle = (data.subtitle as string) || entry.subtitle;
    return subtitle ? `${title} — ${subtitle}` : title;
  };

  const handleGenerate = () => {
    setError('');
    if (!jobOffer.trim()) {
      setError('Collez d\'abord le texte de l\'annonce');
      return;
    }
    if (!profile || !currentCv) return;

    let targetBlock: CVBlock | undefined;
    if (selectedTemplate?.requiresBlock) {
      if (!selectedBlockId) {
        setError('Sélectionnez un bloc à reformuler');
        return;
      }
      targetBlock = currentCvBlocks.find(b => b.id === selectedBlockId);
    }

    generatePrompt({
      profile,
      cv: currentCv,
      blocks: currentCvBlocks,
      entries,
      targetBlock,
      contactName: contactName || undefined,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const handleCopyFullPrompt = async () => {
    if (!jobOffer.trim()) {
      setError("Collez d'abord le texte de l'annonce");
      return;
    }
    if (!profile) return;

    try {
      const prompt = generateFullCVMatchPrompt(profile, entries, jobOffer, undefined, undefined, clarify, { pageBudget: targetPages });
      await navigator.clipboard.writeText(prompt);
      setFullPromptCopied(true);
      toast.success("Prompt copié dans le presse-papier");
      setTimeout(() => setFullPromptCopied(false), 2000);
      setError('');
    } catch {
      toast.error("Erreur lors de la copie");
    }
  };

  const handleApplyFullCV = async () => {
    if (!jsonInput.trim()) {
      toast.error("Veuillez coller le JSON généré");
      return;
    }
    if (!currentCv) return;

    const result = analyzeAiCvJson(jsonInput, { entries, profile, pageBudget: targetPages });
    if (!result.ok) {
      toast.error("Erreur de parsing JSON. Vérifiez le format.");
      return;
    }
    const data = result.data;

    try {
      // Update CV metadata (only the fields the AI actually returned)
      const cvUpdates: Partial<CVDocument> = {};
      if (data.title !== undefined) cvUpdates.targetJob = data.title;
      if (data.summary !== undefined) cvUpdates.customSummary = data.summary;
      if (Object.keys(cvUpdates).length > 0) {
        await useCvStore.getState().updateCv(currentCv.id, cvUpdates);
      }

      // Apply entry-level changes (all types), skill grouping and re-ordering on
      // the CV's blocks — non destructively. The master profile is untouched.
      // Note: suggestedEntries are intentionally ignored here — that review flow lives in
      // the job-watch CV generator drawer for now.
      await applyAiCvToBlocks(currentCv.id, data);

      toast.success("CV sur-mesure appliqué avec succès !");
      setJsonInput('');
      onClose();
    } catch {
      toast.error("Erreur lors de l'application du CV.");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex flex-col border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Générateur IA
          </h2>
        </div>
        <div className="flex px-4 gap-4 border-t border-gray-100">
          <button
            onClick={() => setActiveTab('standard')}
            className={`py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'standard' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Chirurgical
          </button>
          <button
            onClick={() => setActiveTab('full')}
            className={`py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'full' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            CV Complet (One-Shot)
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'standard' ? (
          <>
            {/* 1. Job offer textarea */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                1. Texte de l'annonce
              </label>
              <textarea
                value={jobOffer}
                onChange={e => { setJobOffer(e.target.value); setError(''); }}
                placeholder="Collez ici le texte de l'annonce..."
                className="w-full p-2 border border-gray-300 rounded-md text-xs resize-y h-28 focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              />
            </div>

            {/* 2. Template selection */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                2. Objectif
              </label>
              <div className="space-y-1.5">
                {PROMPT_TEMPLATES.map(t => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      selectedTemplateId === t.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={selectedTemplateId === t.id}
                      onChange={() => selectTemplate(t.id)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <div>
                      <p className="text-xs font-medium text-gray-900">{t.name}</p>
                      <p className="text-[10px] text-gray-500">{t.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Conditional: block selector for "reformulate experience" */}
            {selectedTemplate?.requiresBlock && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Bloc à reformuler
                </label>
                <select
                  value={selectedBlockId}
                  onChange={e => setSelectedBlockId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">Sélectionnez un bloc...</option>
                  {visibleEntryBlocks.map(block => (
                    <option key={block.id} value={block.id}>
                      {getBlockLabel(block)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Conditional: contact name for "application message" */}
            {selectedTemplate?.requiresContactName && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nom du contact (optionnel)
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Ex: Marie Dupont"
                  className="w-full p-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                {error}
              </p>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-md transition-colors shadow-sm"
            >
              Générer le prompt
            </button>

            {/* 3. Generated prompt */}
            {generatedPrompt && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  3. Prompt généré
                </label>
                <textarea
                  readOnly
                  value={generatedPrompt}
                  className="w-full p-2 border border-gray-300 rounded-md text-xs bg-gray-50 resize-none h-64 focus:outline-none select-all cursor-text"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    copied
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {copied ? (
                    <><Check className="w-3.5 h-3.5" /> Copié !</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copier</>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                1. Coller l'annonce
              </label>
              <textarea
                value={jobOffer}
                onChange={e => { setJobOffer(e.target.value); setError(''); }}
                placeholder="Collez ici le texte de l'annonce..."
                className="w-full p-2 border border-gray-300 rounded-md text-xs resize-y h-28 focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                {error}
              </p>
            )}

            <label className="flex items-start gap-2 p-2.5 rounded-md border border-gray-200 bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={clarify}
                onChange={e => setClarify(e.target.checked)}
                className="mt-0.5 accent-amber-500 flex-shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-700">Affiner par questions</span> — l'IA pose 1 à 3 questions ciblées avant de générer (si besoin). Réponds-lui, puis colle le JSON final.
              </span>
            </label>

            <button
              onClick={handleCopyFullPrompt}
              className={`w-full py-2 flex items-center justify-center gap-2 text-sm font-semibold rounded-md transition-colors border ${
                fullPromptCopied
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {fullPromptCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {fullPromptCopied ? 'Prompt copié !' : '1. Copier le prompt d\'analyse'}
            </button>

            <div className="pt-4 border-t border-gray-200">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                2. Coller le JSON de l'IA ici
              </label>
              <textarea
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                placeholder='{"title": "...", "summary": "...", "experiences": [...]}'
                className="w-full p-2 border border-gray-300 rounded-md text-xs resize-y h-48 font-mono bg-gray-50 focus:ring-2 focus:ring-amber-200 focus:bg-white"
              />
            </div>

            {analysis && analysis.ok && <AiCvGuardReport report={analysis.report} />}

            <button
              onClick={handleApplyFullCV}
              className={`w-full py-2.5 text-white text-sm font-semibold rounded-md transition-colors shadow-sm flex items-center justify-center gap-2 ${
                hasBlockingIssues ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {hasBlockingIssues ? '3. Appliquer quand même' : '3. Appliquer au CV'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
