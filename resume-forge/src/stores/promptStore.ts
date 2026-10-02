import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/db';
import { resolvePrompt, ResolverContext } from '@/lib/prompt-resolver';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';
import { DEFAULT_TARGET_PAGES, normalizeTargetPages } from '@/lib/cv-experience';

interface PromptState {
  jobOffer: string;
  selectedTemplateId: string;
  generatedPrompt: string;
  differentiator: string;
  isLoaded: boolean;
  /** Réglage « Pages cibles » du CV généré par IA (1 ou 2). */
  targetPages: 1 | 2;
  setJobOffer: (value: string) => void;
  selectTemplate: (id: string) => void;
  generatePrompt: (context: Omit<ResolverContext, 'jobOffer' | 'differentiator'>) => void;
  loadDifferentiator: () => Promise<void>;
  saveDifferentiator: (value: string) => Promise<void>;
  loadTargetPages: () => Promise<void>;
  saveTargetPages: (value: 1 | 2) => Promise<void>;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  jobOffer: '',
  selectedTemplateId: PROMPT_TEMPLATES[0].id,
  generatedPrompt: '',
  differentiator: '',
  isLoaded: false,
  targetPages: DEFAULT_TARGET_PAGES,

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

  loadTargetPages: async () => {
    try {
      set({ targetPages: normalizeTargetPages(await getSetting('cv_target_pages')) });
    } catch {
      /* défaut : 1 page */
    }
  },

  saveTargetPages: async (value) => {
    const pages = normalizeTargetPages(value);
    await setSetting('cv_target_pages', String(pages));
    set({ targetPages: pages });
  },
}));
