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

/**
 * Sources non supportées sur Android.
 *
 * LinkedIn / Indeed / HelloWork reposent toutes sur du scraping (API jobs-guest
 * + fetch JSON-LD pour LinkedIn, WebView offscreen pour Indeed/HelloWork). En
 * pratique, sur Android on observe :
 *   - LinkedIn : l'API guest et les pages publiques `linkedin.com/jobs/view/`
 *     rate-limitent agressivement les requêtes issues d'IPs mobiles et
 *     redirigent souvent vers la version mobile sans JSON-LD.
 *   - Indeed / HelloWork : la WebView Android offscreen peine à passer les
 *     challenges Cloudflare et le JS-heavy rendering.
 *
 * On masque ces sources dans l'UI Android et on les ignore au runtime côté
 * `runFetch` plutôt que d'afficher des erreurs en boucle. Les utilisateurs
 * desktop continuent à les utiliser normalement.
 */
export const ANDROID_INCOMPATIBLE: Set<JobSource> = new Set([
  'linkedin', 'linkedin_rss', 'indeed', 'hellowork',
]);

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
];

/** Sources shown by default when adding a new config (excludes deprecated) */
export const RECOMMENDED_SOURCES: JobSource[] = ALL_SOURCES;

/**
 * Sources jamais activées d'office : le site refuse les requêtes automatiques
 * (pare-feu applicatif). Elles restent ajoutables à la main, avec un avertissement.
 */
export const DISABLED_BY_DEFAULT: Set<JobSource> = new Set(['emploi_territorial']);

/** Réglage où configurer une source depuis le tableau des collectes. */
export type SourceSetupTarget = 'add-source' | 'france-travail' | 'none';

export interface SourceSetupHint {
  /** Une phrase : ce qui manque pour que la source collecte. */
  explanation: string;
  target: SourceSetupTarget;
  /** Libellé du lien d'action. */
  actionLabel: string;
}

/**
 * Aide à la configuration d'une source « Non configurée » (spec 006, phase 5).
 *
 * Indeed et HelloWork ont leurs parsers, mais ne collectent que si la source
 * est ajoutée à la piste (aucune clé n'est requise). Elles passent par le
 * navigateur intégré derrière une protection anti-robot : si le site oppose un
 * contrôle, la collecte s'arrête et le statut « Bloquée » est affiché — aucun
 * contournement n'est tenté.
 */
export const SOURCE_SETUP_HINTS: Partial<Record<JobSource, SourceSetupHint>> = {
  indeed: {
    explanation:
      'Aucune clé requise : ajoutez Indeed à la piste. Il passe par le navigateur intégré et s\'arrête (statut « Bloquée ») si le site oppose un contrôle anti-robot.',
    target: 'add-source',
    actionLabel: 'Ajouter Indeed',
  },
  hellowork: {
    explanation:
      'Aucune clé requise : ajoutez HelloWork à la piste. Il passe par le navigateur intégré et s\'arrête (statut « Bloquée ») si le site oppose un contrôle anti-robot.',
    target: 'add-source',
    actionLabel: 'Ajouter HelloWork',
  },
  france_travail: {
    explanation: 'Il manque vos identifiants API France Travail (client_id et client_secret, gratuits).',
    target: 'france-travail',
    actionLabel: 'Saisir les clés',
  },
  emploi_territorial: {
    explanation:
      'Désactivée par défaut : le site refuse les requêtes automatiques. Ajoutez-la seulement si vous avez une URL de flux qui fonctionne.',
    target: 'add-source',
    actionLabel: 'Ajouter quand même',
  },
};

/** Sources qui demandent l'accord de l'utilisateur avant d'être ajoutées (avertissement). */
export function addSourceWarning(source: JobSource): string | null {
  if (source === 'emploi_territorial') {
    return 'Emploi Territorial refuse les requêtes automatiques : sans URL de flux valide, cette source restera « Bloquée ».';
  }
  if (source === 'indeed' || source === 'hellowork') {
    return `${SOURCE_LABELS[source]} est protégé par un contrôle anti-robot : si le site l'oppose, la collecte s'arrête (statut « Bloquée ») sans contournement.`;
  }
  return null;
}
