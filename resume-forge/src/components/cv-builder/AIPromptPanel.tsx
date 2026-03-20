import { useState, useEffect } from 'react';
import { X, Copy, Check, Sparkles } from 'lucide-react';
import { usePromptStore } from '@/stores/promptStore';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';
import { CVBlock } from '@/types/cv';

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
  } = usePromptStore();

  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded) loadDifferentiator();
  }, [isLoaded, loadDifferentiator]);

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

  const handleGenerate = async () => {
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

    await generatePrompt({
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

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Générateur de prompts IA
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
      </div>
    </div>
  );
}
