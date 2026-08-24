/**
 * Contrat — gestion des alertes (pistes de veille).
 *
 * Document de spécification : ce fichier n'est pas compilé avec l'application.
 * Il fixe les signatures attendues de `src/lib/watcher/alerts.ts` et les
 * invariants que le store doit garantir.
 */

import type { AIFilterRule } from '../../../resume-forge/src/lib/watcher/ai-filter';
import type { JobSource, SearchProfile } from '../../../resume-forge/src/types/job-watch';

export const MAX_ALERTS = 4;

export type AlertKind = 'core' | 'adjacent' | 'exploratory' | 'opportunistic';

export interface LearnedDictionary {
  positive: Record<string, number>;
  negative: Record<string, number>;
}

export interface JobWatchAlert {
  id: string;
  name: string;
  color: string;
  kind: AlertKind;
  /** Ordre d'affichage et ordre des sections du digest. Contigu de 0 à n-1. */
  position: number;
  enabled: number; // 0 | 1
  searchProfile: SearchProfile;
  aiFilterRule: AIFilterRule | null;
  learnedDict: LearnedDictionary;
  companyReputation: Record<string, number>;
  learnedDecayedAt: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  /** Sources actives, dérivées des lignes job_watch_config rattachées. */
  sources: JobSource[];
}

/** Rattachement d'une offre à une piste, portant le score propre à cette piste. */
export interface OfferAlertLink {
  alertId: string;
  score: number;
  matchedAt: string;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateAlertInput {
  name: string;
  kind?: AlertKind;
  color?: string;
  searchProfile?: Partial<SearchProfile>;
  sources?: JobSource[];
  aiFilterRule?: AIFilterRule | null;
}

/**
 * Crée une alerte en dernière position.
 * @throws si le profil possède déjà MAX_ALERTS alertes.
 */
export declare function createAlert(
  profileId: string | null,
  input: CreateAlertInput,
): Promise<JobWatchAlert>;

export declare function listAlerts(profileId: string | null): Promise<JobWatchAlert[]>;

export declare function updateAlert(
  id: string,
  patch: Partial<Omit<JobWatchAlert, 'id' | 'createdAt'>>,
): Promise<void>;

/**
 * Supprime une alerte, ses liaisons, ses logs et ses signaux appris.
 * Ne supprime aucune offre.
 * @throws s'il s'agit de la dernière alerte du profil.
 */
export declare function deleteAlert(id: string): Promise<void>;

/**
 * Duplique une alerte : profil de recherche, sources et règle IA sont copiés ;
 * l'apprentissage (dictionnaire, réputation) et l'historique ne le sont pas.
 * @throws si le profil possède déjà MAX_ALERTS alertes.
 */
export declare function duplicateAlert(id: string): Promise<JobWatchAlert>;

/** Réordonne les alertes et renormalise les positions en 0..n-1. */
export declare function reorderAlerts(profileId: string | null, orderedIds: string[]): Promise<void>;

// ── Liaisons offre ↔ alerte ──────────────────────────────────────────────────

/**
 * Écrit les rattachements d'une offre. Idempotent : une liaison existante voit
 * son score mis à jour uniquement s'il augmente ; `matchedAt` n'est jamais écrasé.
 * Ne modifie jamais is_read / is_archived de l'offre.
 */
export declare function linkOfferToAlerts(
  offerId: string,
  links: Array<{ alertId: string; score: number }>,
): Promise<void>;

export declare function loadOfferAlertLinks(
  offerIds: string[],
): Promise<Map<string, OfferAlertLink[]>>;

// ── Invariants garantis par l'implémentation ─────────────────────────────────
//
// I1  Au plus MAX_ALERTS alertes par profil utilisateur.
// I2  Au moins une alerte dès lors que la veille a été configurée.
// I3  `position` contiguë de 0 à n-1 après toute mutation.
// I4  La suppression d'une alerte ne supprime jamais d'offre.
// I5  Une alerte n'est jamais visible depuis un autre profil utilisateur.
// I6  `job_offers.score` reflète toujours le max des scores de ses liaisons.
