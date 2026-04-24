/**
 * Base interface for all job-site parsers.
 *
 * New parsers (Phase 2) implement this contract. Existing parsers satisfy
 * it implicitly via the `runParser` dispatcher in fetcher.ts.
 */

import type { RawJobOffer, JobSource, JobWatchConfig, JobWatchSettings } from '@/types/job-watch';

export type HealthStatus = 'ok' | 'auth_required' | 'blocked' | 'error';

export interface ValidationResult {
  valid: boolean;
  /** Human-readable reason if invalid */
  reason?: string;
}

export interface JobSiteParser {
  /** Canonical source identifier */
  readonly id: JobSource;

  /** True when the site requires a user session (LinkedIn, Glassdoor…) */
  readonly requiresAuth: boolean;

  /** Login URL to open for the user if session is missing */
  readonly loginUrl?: string;

  /**
   * Fetch raw offers for the given profile.
   * Must not throw for transient errors — return [] and surface via healthCheck.
   */
  fetch(config: JobWatchConfig, settings: JobWatchSettings): Promise<RawJobOffer[]>;

  /**
   * Validate that the query derived from `settings.searchProfile` is usable
   * for this source (e.g. required fields present, no unsupported options).
   */
  validateQuery(settings: JobWatchSettings): ValidationResult;

  /**
   * Quick sanity-check: can we reach the site / do we have a valid session?
   * Used by HealthDashboard and the session manager UI.
   */
  healthCheck(settings: JobWatchSettings): Promise<HealthStatus>;
}
