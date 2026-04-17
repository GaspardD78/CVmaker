/**
 * json-ld-utils.ts — Utilitaires partagés d'extraction JSON-LD JobPosting
 *
 * Utilisé par wttj.ts et linkedin-rss.ts pour éviter la duplication
 * du code de parsing HTML + JSON-LD.
 *
 * Stratégie :
 *  1. Chercher tous les <script type="application/ld+json"> dans le DOM
 *  2. Parser chaque bloc JSON
 *  3. Extraire les entrées dont @type === 'JobPosting'
 *  4. Supporter les formats : objet seul, tableau, @graph
 */

import { parseDate } from './parsers/rss-utils';

// ── Type partagé ──────────────────────────────────────────────────────────────

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
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string };
    currency?: string;
  };
}

// ── Extraction ────────────────────────────────────────────────────────────────

/**
 * Extrait tous les JobPosting JSON-LD depuis une chaîne HTML brute.
 * Parse via DOMParser — doit être appelé dans un contexte browser/WebView.
 */
export function extractJsonLdJobs(html: string): JsonLdJob[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return extractJsonLdJobsFromDoc(doc);
}

/**
 * Extrait tous les JobPosting JSON-LD depuis un Document déjà parsé.
 * Utile quand le Document a déjà été construit pour d'autres traitements.
 */
export function extractJsonLdJobsFromDoc(doc: Document): JsonLdJob[] {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const jobs: JsonLdJob[] = [];

  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent ?? '{}');
      const candidates: JsonLdJob[] = [];

      if (Array.isArray(raw)) {
        candidates.push(...raw);
      } else if ('@graph' in raw && Array.isArray(raw['@graph'])) {
        candidates.push(...raw['@graph']);
      } else {
        candidates.push(raw as JsonLdJob);
      }

      for (const candidate of candidates) {
        if (candidate['@type'] === 'JobPosting' && candidate.title) {
          jobs.push(candidate);
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return jobs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extrait la ville depuis jobLocation, supportant les formes objet et tableau.
 * Retourne addressLocality en priorité, puis addressRegion.
 */
export function parseJobLocation(job: JsonLdJob): string | null {
  if (!job.jobLocation) return null;
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  return loc?.address?.addressLocality ?? loc?.address?.addressRegion ?? null;
}

/**
 * Extrait et normalise la date de publication vers ISO 8601.
 * Retourne null si datePosted est absent ou non parsable.
 */
export function parseJobDate(job: JsonLdJob): string | null {
  return parseDate(job.datePosted ?? null);
}
