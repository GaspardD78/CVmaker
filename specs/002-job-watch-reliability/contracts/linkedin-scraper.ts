/**
 * Contract: linkedin-rss.ts — scraping sans RSS
 *
 * Comportement conditionnel :
 *   - config.rssUrl non vide → comportement RSS existant (inchangé)
 *   - config.rssUrl vide/null → scraping tauriFetch + DOMParser + JSON-LD
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings } from '@/types/job-watch';

// ── Endpoint cible ─────────────────────────────────────────────────────────────

/**
 * URL de scraping LinkedIn (sans authentification) :
 * https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *   ?keywords=<query>&location=France&start=0
 *
 * Retourne du HTML. Peut retourner statut 999 si User-Agent détecté.
 */

// ── json-ld-utils.ts — utilitaires partagés ────────────────────────────────────

/**
 * Extrait les JobPosting JSON-LD depuis un document HTML.
 * Partagé entre wttj.ts et linkedin-rss.ts.
 * Fichier : src/lib/watcher/json-ld-utils.ts
 */
export declare function extractJsonLdJobs(html: string): JsonLdJob[];

export interface JsonLdJob {
  '@type'?: string;
  title?: string;
  hiringOrganization?: { name?: string };
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string } }
    | Array<{ address?: { addressLocality?: string; addressRegion?: string } }>;
  employmentType?: string;
  description?: string;
  datePosted?: string;
  url?: string;
  baseSalary?: {
    value?: { minValue?: number; maxValue?: number; value?: number };
    currency?: string;
  };
}

/** Extrait la ville depuis jobLocation (objet ou tableau) */
export declare function parseJobLocation(job: JsonLdJob): string | null;

/** Extrait et normalise la date de publication */
export declare function parseJobDate(job: JsonLdJob): string | null;

// ── parseLinkedinRss — comportement conditionnel ──────────────────────────────

/**
 * Point d'entrée unique pour LinkedIn.
 * Signature inchangée — aucun appelant à modifier.
 *
 * Logique :
 *   if (config.rssUrl) → fetchRssFeed(config.rssUrl) [comportement actuel]
 *   else → scrapeLinkedin(settings) [nouveau]
 *
 * En cas d'échec du scraping :
 *   - Retourne [] (0 offres)
 *   - Le FetchLog reçoit status='error' et error_message explicite
 *   - Pas de throw — ne bloque pas les autres sources
 */
export declare function parseLinkedinRss(
  config: JobWatchConfig,
  settings?: JobWatchSettings,
): Promise<RawJobOffer[]>;

// ── Gestion d'échec scraping ──────────────────────────────────────────────────

/**
 * Message d'erreur standard si scraping LinkedIn échoue :
 * "Scraping LinkedIn échoué — essayez rss.app comme alternative."
 *
 * Conditions déclenchant ce message :
 *   - Réponse HTTP non-2xx (dont statut 999 anti-bot)
 *   - HTML reçu mais 0 offres extraites après JSON-LD + CSS fallback
 */
export const LINKEDIN_SCRAPING_ERROR_MESSAGE =
  "Scraping LinkedIn échoué — essayez rss.app comme alternative.";
