/**
 * Contract: scorer.ts v3
 *
 * Signature inchangée — remplacement drop-in de v2.
 * Seules les valeurs numériques changent (voir data-model.md § Scoring delta).
 */

import type { RawJobOffer, SearchProfile } from '@/types/job-watch';
import type { LearnedSignals } from '@/lib/watcher/scorer';

// ── ScoreBreakdown ────────────────────────────────────────────────────────────

/**
 * Contrat de retour de computeScoreWithBreakdown.
 * Rétrocompatible : champ `basePenalty` optionnel ajouté pour diagnostic.
 */
export interface ScoreBreakdown {
  /** Score final clampé 0-100 */
  total: number;
  /** true si disqualifié immédiatement (score forcé à 0) */
  disqualified: boolean;
  disqualifyReason?: string;
  titleMatchScore: number;    // 0 | 15 | 30 | 40
  titleMatchedTerm?: string;
  contractMatchScore: number; // -15 | 0 | +10
  skillsScore: number;        // 0..24
  domainScore: number;        // 0..10
  salaryScore: number;        // -30 | 0 | +10 | +20
  learnedScore: number;       // -15..+15
  decayPenalty: number;       // 0..-20
  /** Diagnostic : base utilisée (0 ou 50) */
  baseScore?: number;
}

// ── Fonction principale ───────────────────────────────────────────────────────

/**
 * Calcule le score de pertinence d'une offre avec détail par couche.
 * Signature identique à v2 — aucun appelant à modifier.
 */
export declare function computeScoreWithBreakdown(
  offer: Pick<RawJobOffer,
    | 'title'
    | 'descriptionSnippet'
    | 'publishedAt'
    | 'company'
    | 'salaryMin'
    | 'salaryMax'
    | 'contractType'
    | 'extraction'
  >,
  profile: SearchProfile,
  learned?: LearnedSignals,
): ScoreBreakdown;

/**
 * Raccourci retournant uniquement le total.
 * Signature identique à v2.
 */
export declare function computeScore(
  offer: Parameters<typeof computeScoreWithBreakdown>[0],
  profile: SearchProfile,
  learned?: LearnedSignals,
): number;

// ── Règles de scoring v3 ──────────────────────────────────────────────────────

/**
 * Résumé des règles v3 (pour référence, non exécutable) :
 *
 * BASE :
 *   - jobTitles.length > 0 → base = 0
 *   - jobTitles.length === 0 → base = 50
 *
 * COUCHE 1 — Title match :
 *   - Match titre, confidence high  → +40
 *   - Match titre, confidence other → +30
 *   - Match description/snippet     → +15
 *   - Mode balanced, no match, jobTitles non vide → cap total à 25
 *   - Mode strict, no match → score 0 (disqualifié)
 *
 * COUCHE 2 — Contract :
 *   - Match                             → +10
 *   - Mauvais (balanced, confidence ok) → -15
 *   - Mauvais (strict)                  → score 0 (disqualifié)
 *
 * COUCHE 3 — Skills :
 *   - Skill dans titre    → +6 par match, max +24
 *   - Skill dans snippet  → +3 par match, max +12
 *
 * HARD DISQUALIFIERS (score → 0, inchangés) :
 *   - Entreprise blacklistée
 *   - Terme exclu dans titre OU description
 */
