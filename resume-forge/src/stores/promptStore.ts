import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/db';
import { resolvePrompt, ResolverContext } from '@/lib/prompt-resolver';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';

interface PromptState {
  jobOffer: string;
  selectedTemplateId: string;
  generatedPrompt: string;
  differentiator: string;
  isLoaded: boolean;
  setJobOffer: (value: string) => void;
  selectTemplate: (id: string) => void;
  generatePrompt: (context: Omit<ResolverContext, 'jobOffer' | 'differentiator'>) => void;
  loadDifferentiator: () => Promise<void>;
  saveDifferentiator: (value: string) => Promise<void>;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  jobOffer: '',
  selectedTemplateId: PROMPT_TEMPLATES[0].id,
  generatedPrompt: '',
  differentiator: '',
  isLoaded: false,

  setJobOffer: (value) => set({ jobOffer: value }),

  selectTemplate: (id) => set({ selectedTemplateId: id, generatedPrompt: '' }),

  generatePrompt: (context) => {
    const { jobOffer, selectedTemplateId, differentiator } = get();
    const resolved = resolvePrompt(selectedTemplateId, {
      ...context,
      jobOffer,
      differentiator: differentiator || undefined,
    });
    set({ generatedPrompt: resolved });
  },

  loadDifferentiator: async () => {
    try {
      const value = await getSetting('ai_differentiator');
      set({ differentiator: value || '', isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  saveDifferentiator: async (value) => {
    await setSetting('ai_differentiator', value);
    set({ differentiator: value });
  },
}));
