import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/db';
import { resolvePrompt, ResolverContext } from '@/lib/prompt-resolver';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';
import { DEFAULT_TARGET_PAGES, normalizeTargetPages } from '@/lib/cv-experience';
import { personalRulesKey } from '@/lib/cv-prompt';

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
  /** Règles personnelles du profil chargé (injectées dans le prompt « CV ciblé »). */
  personalRules: string;
  /** Profil auquel appartient `personalRules` (null : rien de chargé). */
  personalRulesProfileId: string | null;
  loadPersonalRules: (profileId: string) => Promise<void>;
  savePersonalRules: (profileId: string, value: string) => Promise<void>;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  jobOffer: '',
  selectedTemplateId: PROMPT_TEMPLATES[0].id,
  generatedPrompt: '',
  differentiator: '',
  isLoaded: false,
  targetPages: DEFAULT_TARGET_PAGES,
  personalRules: '',
  personalRulesProfileId: null,

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

  loadPersonalRules: async (profileId) => {
    try {
      set({ personalRules: (await getSetting(personalRulesKey(profileId))) ?? '', personalRulesProfileId: profileId });
    } catch {
      set({ personalRules: '', personalRulesProfileId: profileId });
    }
  },

  savePersonalRules: async (profileId, value) => {
    await setSetting(personalRulesKey(profileId), value);
    set({ personalRules: value, personalRulesProfileId: profileId });
  },

  saveTargetPages: async (value) => {
    const pages = normalizeTargetPages(value);
    await setSetting('cv_target_pages', String(pages));
    set({ targetPages: pages });
  },
}));
