import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/db';
import { resolvePrompt, ResolverContext } from '@/lib/prompt-resolver';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';
import { DEFAULT_TARGET_PAGES, normalizeTargetPages } from '@/lib/cv-experience';
import { personalRulesKey } from '@/lib/cv-prompt';
import { BULLET_FOCUS_SETTING, VERB_TENSE_SETTING, normalizeBulletFocus, normalizeVerbTense, type BulletFocus, type VerbTense } from '@/lib/cv-focus-rules';
import { loadProfileSetting, loadTargetSheetOverrides, saveProfileSetting, saveTargetSheetOverrides } from '@/lib/profile-settings';
import type { SheetOverrides } from '@/lib/cv-targets';

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
  /** Orientation des puces du profil chargé (`undefined` : jamais réglée, défaut « missions »). */
  bulletFocus: BulletFocus | undefined;
  bulletFocusProfileId: string | null;
  loadBulletFocus: (profileId: string) => Promise<void>;
  saveBulletFocus: (profileId: string, value: BulletFocus) => Promise<void>;
  /** Forme du premier mot des puces du profil chargé (`undefined` : jamais réglée, défaut infinitif). */
  verbTense: VerbTense | undefined;
  verbTenseProfileId: string | null;
  loadVerbTense: (profileId: string) => Promise<void>;
  saveVerbTense: (profileId: string, value: VerbTense) => Promise<void>;
  /** Fiches de ciblage personnalisées du profil chargé (seuls les champs modifiés). */
  targetSheets: SheetOverrides;
  targetSheetsProfileId: string | null;
  loadTargetSheets: (profileId: string) => Promise<void>;
  saveTargetSheets: (profileId: string, overrides: SheetOverrides) => Promise<void>;
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
  bulletFocus: undefined,
  bulletFocusProfileId: null,
  verbTense: undefined,
  verbTenseProfileId: null,
  targetSheets: {},
  targetSheetsProfileId: null,

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

  loadBulletFocus: async (profileId) => {
    try {
      set({ bulletFocus: normalizeBulletFocus(await loadProfileSetting(BULLET_FOCUS_SETTING, profileId)), bulletFocusProfileId: profileId });
    } catch {
      set({ bulletFocus: undefined, bulletFocusProfileId: profileId });
    }
  },

  saveBulletFocus: async (profileId, value) => {
    await saveProfileSetting(BULLET_FOCUS_SETTING, profileId, value);
    set({ bulletFocus: value, bulletFocusProfileId: profileId });
  },

  loadVerbTense: async (profileId) => {
    try {
      set({ verbTense: normalizeVerbTense(await loadProfileSetting(VERB_TENSE_SETTING, profileId)), verbTenseProfileId: profileId });
    } catch {
      set({ verbTense: undefined, verbTenseProfileId: profileId });
    }
  },

  saveVerbTense: async (profileId, value) => {
    await saveProfileSetting(VERB_TENSE_SETTING, profileId, value);
    set({ verbTense: value, verbTenseProfileId: profileId });
  },

  loadTargetSheets: async (profileId) => {
    try {
      set({ targetSheets: await loadTargetSheetOverrides(profileId), targetSheetsProfileId: profileId });
    } catch {
      set({ targetSheets: {}, targetSheetsProfileId: profileId });
    }
  },

  saveTargetSheets: async (profileId, overrides) => {
    await saveTargetSheetOverrides(profileId, overrides);
    set({ targetSheets: overrides, targetSheetsProfileId: profileId });
  },

  saveTargetPages: async (value) => {
    const pages = normalizeTargetPages(value);
    await setSetting('cv_target_pages', String(pages));
    set({ targetPages: pages });
  },
}));
