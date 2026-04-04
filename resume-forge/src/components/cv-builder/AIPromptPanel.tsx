import { useState, useEffect } from 'react';
import { X, Copy, Check, Sparkles, Wand2 } from 'lucide-react';
import { usePromptStore } from '@/stores/promptStore';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { PROMPT_TEMPLATES, generateFullCVMatchPrompt } from '@/lib/prompt-templates';
import { CVBlock } from '@/types/cv';
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
  } = usePromptStore();

  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standard' | 'full'>('standard');
  const [jsonInput, setJsonInput] = useState('');
  const [fullPromptCopied, setFullPromptCopied] = useState(false);

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
      const prompt = generateFullCVMatchPrompt(profile, entries, jobOffer);
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

    try {
      // Clean up markdown blocks
      const cleanJson = jsonInput.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);

      if (!currentCv) return;

      // Update CV Document
      await useCvStore.getState().updateCv(currentCv.id, {
        targetJob: data.title,
        customSummary: data.summary,
      });

      // Remove old experience and skill blocks
      // We will identify them by looking at the entry type they reference, or just clear custom blocks if we want
      // It's safer to just delete existing 'experience' and 'skill' section headers and their contents?
      // For simplicity, we can remove ALL entry_ref blocks that point to 'experience' or 'skill'
      // BUT actually, it's safer to just add the new ones at the end, or find the 'Expériences Professionnelles' section header

      // Let's create entirely new custom_content blocks for these to not mess up the master profile
      // or we can create entry_refs pointing to null with overrideData.
      // The instructions say "Remplace les blocs de type 'experience' par les nouvelles expériences du JSON"
      // "Remplace les blocs de type 'skill' par les nouveaux skills du JSON"

      // Step 1: Delete all current experience and skill blocks (and their headers if needed, but maybe just clear entries)
      const blocksToRemove = currentCvBlocks.filter(b => {
        if (b.blockType === 'entry_ref' && b.entryId) {
          const entry = entries.find(e => e.id === b.entryId);
          return entry?.entryType === 'experience' || entry?.entryType === 'skill';
        }
        // Also remove custom_content blocks if they were added as experiences/skills? Let's just remove the entry_refs for now
        return false;
      });

      for (const b of blocksToRemove) {
        await useCvStore.getState().deleteCvBlock(b.id);
      }

      // We need to insert the new blocks. We will append them or place them where the old ones were.
      // To simplify, let's just create new section headers and custom_content blocks at the end of the CV
      let sortOrder = currentCvBlocks.length > 0 ? Math.max(...currentCvBlocks.map(b => b.sortOrder)) + 1 : 0;

      if (data.experiences && data.experiences.length > 0) {
        await useCvStore.getState().createCvBlock({
          cvId: currentCv.id,
          entryId: null,
          blockType: 'section_header',
          sectionName: 'Expériences (Sur-mesure)',
          customContent: null,
          sortOrder: sortOrder++,
          isVisible: true,
          overrideData: { displayFormat: 'list' }
        });

        for (const exp of data.experiences) {
          await useCvStore.getState().createCvBlock({
            cvId: currentCv.id,
            entryId: null,
            blockType: 'custom_text',
            sectionName: null,
            customContent: `**${exp.title}**\n${exp.subtitle} | ${exp.date}\n\n${exp.description}`,
            sortOrder: sortOrder++,
            isVisible: true,
            overrideData: {}
          });
        }
      }

      if (data.skills && data.skills.length > 0) {
        await useCvStore.getState().createCvBlock({
          cvId: currentCv.id,
          entryId: null,
          blockType: 'section_header',
          sectionName: 'Compétences (Sur-mesure)',
          customContent: null,
          sortOrder: sortOrder++,
          isVisible: true,
          overrideData: { displayFormat: 'badges' }
        });

        for (const skill of data.skills) {
          await useCvStore.getState().createCvBlock({
            cvId: currentCv.id,
            entryId: null,
            blockType: 'custom_text',
            sectionName: null,
            customContent: `**${skill.title}**: ${skill.description}`,
            sortOrder: sortOrder++,
            isVisible: true,
            overrideData: {}
          });
        }
      }

      toast.success("CV sur-mesure appliqué avec succès !");
      setJsonInput('');
      onClose();
    } catch (err) {
      toast.error("Erreur de parsing JSON. Vérifiez le format.");
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex flex-col border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Générateur IA
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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

            <button
              onClick={handleApplyFullCV}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              3. Appliquer au CV
            </button>
          </>
        )}
      </div>
    </div>
  );
}
