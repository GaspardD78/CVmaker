/**
 * Source metadata — single source of truth for job source labels, icons,
 * and capability flags. Replaces per-component duplication of SOURCE_LABELS.
 */

import type { JobSource } from '@/types/job-watch';

export const SOURCE_LABELS: Record<JobSource, string> = {
  apec:               'APEC',
  wttj:               'Welcome to the Jungle',
  linkedin:           'LinkedIn',
  linkedin_rss:       'LinkedIn (RSS)',
  indeed:             'Indeed',
  hellowork:          'HelloWork',
  jobicy:             'Jobicy',
  france_travail:     'France Travail',
  emploi_territorial: 'Emploi Territorial',
  mantiks:            'Mantiks',
};

/** Sources that require the user to log in via the Session Manager */
export const AUTH_REQUIRED: Set<JobSource> = new Set(['linkedin']);

/** Sources that use the WebView scraping pipeline (headless_chrome) */
export const USES_WEBVIEW: Set<JobSource> = new Set(['linkedin', 'indeed', 'hellowork']);

/** Deprecated sources — hidden from default add-source list but still functional */
export const DEPRECATED: Set<JobSource> = new Set(['linkedin_rss', 'mantiks']);

/** Canonical order for UI lists (most-useful first) */
export const ALL_SOURCES: JobSource[] = [
  'apec',
  'france_travail',
  'wttj',
  'linkedin',
  'indeed',
  'hellowork',
  'emploi_territorial',
  'jobicy',
  // deprecated at the tail
  'linkedin_rss',
  'mantiks',
];

/** Sources shown by default when adding a new config (excludes deprecated) */
export const RECOMMENDED_SOURCES: JobSource[] = ALL_SOURCES.filter(s => !DEPRECATED.has(s));
