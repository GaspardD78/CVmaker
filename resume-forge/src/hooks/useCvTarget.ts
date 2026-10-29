import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePromptStore } from '@/stores/promptStore';
import { detectTarget } from '@/lib/cv-target-detect';
import { choiceWithProposal, reconcileAiTarget, type AiTargetOutcome } from '@/lib/cv-target-snapshot';
import { defaultFocusFor, resolveTarget, type ResolvedTarget, type TargetChoice } from '@/lib/cv-targets';
import { resolveBulletFocus, resolveVerbTense, type BulletFocus } from '@/lib/cv-focus-rules';
import type { AiCvCible } from '@/lib/cv-target-snapshot';

interface UseCvTargetOptions {
  profileId?: string;
  jobOfferText: string;
  company?: string | null;
  /** Réglages du CV (`bulletFocus`) ; l'orientation du CV l'emporte sur celle du profil. */
  cvSettings?: Record<string, unknown> | null;
  /** Surcharge d'orientation propre à cette génération (générateur de la Veille). */
  focusOverride?: BulletFocus | '';
}

/**
 * Ciblage d'une génération : choix de l'utilisateur (tout en « Auto » au départ), détection par
 * l'application, fiches du profil, ciblage résolu et orientation effective (CV > profil > fiche > missions).
 */
export function useCvTarget({ profileId, jobOfferText, company, cvSettings, focusOverride }: UseCvTargetOptions) {
  const { targetSheets, targetSheetsProfileId, loadTargetSheets, bulletFocus, bulletFocusProfileId, verbTense: storedTense, verbTenseProfileId, loadVerbTense } = usePromptStore();
  const [choice, setChoiceRaw] = useState<TargetChoice>({});
  /** Un champ du ciblage a changé depuis la dernière copie du prompt : « Copier le nouveau prompt » apparaît. */
  const [dirty, setDirty] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);

  useEffect(() => { if (profileId) { void loadTargetSheets(profileId); void loadVerbTense(profileId); } }, [profileId, loadTargetSheets, loadVerbTense]);

  const setChoice = useCallback((c: TargetChoice) => { setChoiceRaw(c); setDirty(true); }, []);
  const markCopied = useCallback(() => setDirty(false), []);
  const verbTense = resolveVerbTense(profileId && verbTenseProfileId === profileId ? storedTense : undefined);

  const sheetOverrides = profileId && targetSheetsProfileId === profileId ? targetSheets : {};
  const detected = useMemo(() => detectTarget({ jobOfferText, company }), [jobOfferText, company]);
  const target = useMemo(() => resolveTarget(choice, sheetOverrides, detected), [choice, sheetOverrides, detected]);
  const profileFocus = profileId && bulletFocusProfileId === profileId ? bulletFocus : undefined;

  /** Orientation effective pour un ciblage donné. */
  const focusFor = useCallback((t: ResolvedTarget): BulletFocus =>
    resolveBulletFocus({ ...(cvSettings ?? {}), ...(focusOverride ? { bulletFocus: focusOverride } : {}) }, profileFocus, defaultFocusFor(t)),
  [cvSettings, focusOverride, profileFocus]);

  /** Proposition de l'IA (`analyse.cible`) rapprochée du ciblage retenu. */
  const proposalFor = useCallback((cible: AiCvCible | undefined): AiTargetOutcome | undefined => {
    if (!cible) return undefined;
    const outcome = reconcileAiTarget(target, cible, sheetOverrides);
    return outcome.filled.length > 0 || outcome.contradictions.length > 0 ? outcome : undefined;
  }, [target, sheetOverrides]);

  /** Applique la proposition au choix de l'utilisateur ; renvoie le nouveau ciblage résolu. */
  const applyProposal = useCallback((outcome: AiTargetOutcome): ResolvedTarget => {
    const next = choiceWithProposal(choice, outcome);
    setChoiceRaw(next);
    return resolveTarget(next, sheetOverrides, detected);
  }, [choice, sheetOverrides, detected]);

  const requestEdit = useCallback(() => setExpandSignal(n => n + 1), []);

  return { choice, setChoice, dirty, markCopied, verbTense, detected, target, sheetOverrides, focus: focusFor(target), focusFor, proposalFor, applyProposal, expandSignal, requestEdit };
}
