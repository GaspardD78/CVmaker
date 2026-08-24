/**
 * Contrat — échanges IA du portefeuille (prompt stratège et revue).
 *
 * Document de spécification : ce fichier n'est pas compilé avec l'application.
 * Il fixe les schémas JSON que l'utilisateur colle dans l'app après être passé
 * par l'assistant de son choix, et les règles de validation associées.
 *
 * Rappel : aucun appel réseau vers un LLM n'est émis par l'application.
 */

import type { AIFilterRule } from '../../../resume-forge/src/lib/watcher/ai-filter';
import type { JobSource, SearchProfile } from '../../../resume-forge/src/types/job-watch';
import type { AlertKind } from './alerts';

// ── 1. Portefeuille généré par le prompt stratège ────────────────────────────

export const AI_PORTFOLIO_SCHEMA_VERSION = '1.0';

/** Sous-ensemble de SearchProfile que l'IA est autorisée à définir. */
export interface PortfolioSearchProfile {
  jobTitles: string[];        // ≥ 2
  skills: string[];
  domains: string[];
  excludeTitles: string[];    // ≥ 3
  excludeDomains: string[];
  location: {
    label: string;
    city: string;
    /** Peut être vide : l'app résout le code INSEE via son autocomplétion. */
    inseeCode?: string;
    departmentCodes?: string[];
    radiusKm: number;
  };
  contractTypes: string[];
  salary: { min: number | null; target: number | null };
  scoring: { mode: 'strict' | 'balanced' | 'loose' };
  blacklistedCompanies?: string[];
}

export interface PortfolioAlert {
  name: string;
  kind: AlertKind;
  /** Pourquoi cette piste existe et ce qu'elle capte que les autres ne captent pas. */
  rationale: string;
  searchProfile: PortfolioSearchProfile;
  sources: JobSource[];
  /** Règle de filtre IA propre à cette piste, optionnelle. */
  aiFilter?: AIFilterRule;
}

export interface AlertPortfolio {
  version: typeof AI_PORTFOLIO_SCHEMA_VERSION;
  /** Logique d'ensemble du portefeuille, 3 à 6 lignes. */
  rationale: string;
  alerts: PortfolioAlert[];   // 3 à MAX_ALERTS
  /** Angles volontairement non couverts, et pourquoi. */
  blindSpots?: string[];
}

export interface PortfolioValidationResult {
  portfolio: AlertPortfolio;
  /** Problèmes de qualité — n'empêchent pas l'import, sont affichés dans l'aperçu. */
  warnings: string[];
}

/**
 * Valide un JSON collé par l'utilisateur.
 *
 * Rejette (throw, avec un message désignant le champ fautif) :
 *   - `version` absente ou inconnue
 *   - moins de 3 ou plus de MAX_ALERTS alertes
 *   - absence de piste `core`, ou plus d'une
 *   - absence de piste `exploratory`
 *   - `jobTitles.length < 2` ou `excludeTitles.length < 3` sur une piste
 *   - `kind` inconnu, `scoring.mode` inconnu
 *   - source inconnue (le message nomme la source)
 *   - `aiFilter` présent mais non conforme à `validateAIFilterRule`
 *
 * Signale en `warnings` sans rejeter :
 *   - deux pistes partageant plus d'un terme dans `jobTitles`
 *   - une piste sans source
 *   - une piste dont la localisation diffère de la localisation de référence
 *   - `blindSpots` vide
 */
export declare function validateAlertPortfolio(input: unknown): PortfolioValidationResult;

/** Ce que l'aperçu d'import présente à l'utilisateur avant application. */
export interface PortfolioImportPreview {
  creations: PortfolioAlert[];
  replacements: Array<{ existingAlertId: string; existingName: string; incoming: PortfolioAlert }>;
  warnings: string[];
  /** Estimation de la charge de collecte du portefeuille proposé. */
  estimatedRequestsPerCycle: number;
}

export declare function buildPortfolioImportPreview(
  portfolio: AlertPortfolio,
  existing: Array<{ id: string; name: string }>,
): PortfolioImportPreview;

/**
 * Applique l'import en une transaction unique. En cas d'erreur, aucune alerte
 * n'est créée ni modifiée. Ne supprime jamais d'offre (FR-043).
 */
export declare function applyPortfolioImport(
  profileId: string | null,
  preview: PortfolioImportPreview,
): Promise<void>;

// ── 2. Revue de portefeuille ─────────────────────────────────────────────────

export const AI_REVIEW_SCHEMA_VERSION = '1.0';

export type AlertVerdict = 'keep' | 'tune' | 'merge' | 'drop';

export interface PortfolioReview {
  version: typeof AI_REVIEW_SCHEMA_VERSION;
  overlaps: Array<{
    alertA: string;
    alertB: string;
    sharedPercent: number;
    /** Ce qu'il faut modifier pour différencier les deux pistes. */
    recommendation: string;
  }>;
  perAlert: Array<{
    alertName: string;
    verdict: AlertVerdict;
    why: string;
    /** Changements structurés, applicables en un clic quand ils sont présents. */
    suggestedChanges?: {
      addJobTitles?: string[];
      removeJobTitles?: string[];
      addExcludeTitles?: string[];
      removeExcludeTitles?: string[];
      addSources?: JobSource[];
      removeSources?: JobSource[];
      scoringMode?: 'strict' | 'balanced' | 'loose';
    };
  }>;
  blindSpots: Array<{
    label: string;
    why: string;
    /** Piste prête à créer, si l'IA en propose une. */
    suggestedAlert?: PortfolioAlert;
  }>;
}

export declare function validatePortfolioReview(input: unknown): PortfolioReview;

// ── 3. Métriques calculées localement (sans IA) ──────────────────────────────

export interface AlertMetrics {
  alertId: string;
  name: string;
  total: number;
  exclusive: number;
  readRate: number;
  kanbanRate: number;
  quickArchiveRate: number;
  medianScore: number;
}

export interface OverlapMetric {
  alertA: string;
  alertB: string;
  shared: number;
  /** shared / MIN(total_a, total_b), en pourcentage entier. */
  sharedPercent: number;
}

export interface PortfolioMetrics {
  windowDays: number;         // 30
  perAlert: AlertMetrics[];
  overlaps: OverlapMetric[];
}

/** Calcul SQL local, aucune IA impliquée (FR-045). */
export declare function computePortfolioMetrics(
  profileId: string | null,
  windowDays?: number,
): Promise<PortfolioMetrics>;

/** Seuil au-delà duquel un recouvrement est signalé dans l'UI sans passer par l'IA. */
export const OVERLAP_WARNING_THRESHOLD = 60;

// ── 4. Assemblage des prompts ────────────────────────────────────────────────

export declare function buildPortfolioStrategyPrompt(args: {
  profileTitle: string | null;
  skills: string[];
  experiences: Array<{ title: string; company: string | null }>;
  education: string[];
  intent: string;
  constraints: {
    locationLabel: string;
    radiusKm: number;
    mobility: string;
    contractTypes: string[];
    salaryMin: number | null;
    salaryTarget: number | null;
  };
  currentPortfolio?: Array<{ name: string; kind: AlertKind; jobTitles: string[] }>;
}): string;

export declare function buildPortfolioReviewPrompt(
  alerts: Array<{ name: string; kind: AlertKind; searchProfile: SearchProfile; sources: JobSource[] }>,
  metrics: PortfolioMetrics,
): string;
