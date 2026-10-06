/**
 * Statuts fiables d'une source de collecte (spec 006, phase 1).
 *
 * « 0 offre » peut vouloir dire quatre choses très différentes : la requête est
 * valide et rien ne correspond (`vide`), le site nous a refusés (`bloquee`),
 * l'endpoint a disparu (`introuvable`), ou la réponse n'était pas celle qu'on
 * attendait (une page HTML de pare-feu au lieu de XML/JSON : `reponse_invalide`).
 * Les confondre fait diagnostiquer un échantillon biaisé sans le savoir.
 *
 * Ce module est pur : classification, détection de page de pare-feu, libellés
 * et conseils. Aucun contournement de protection n'y est tenté — quand un site
 * refuse, on le dit.
 */

import type { JobSource } from '@/types/job-watch';

export type SourceStatus =
  | 'ok'
  | 'vide'
  | 'bloquee'
  | 'introuvable'
  | 'erreur_reseau'
  | 'reponse_invalide'
  | 'intitules_inadaptes'
  | 'non_configuree'
  | 'en_attente'
  | 'indisponible';

/** Statuts qui signalent une source à réparer ou à activer (pas un simple « 0 résultat »). */
export const FAILING_STATUSES: ReadonlySet<SourceStatus> = new Set<SourceStatus>([
  'bloquee', 'introuvable', 'erreur_reseau', 'reponse_invalide', 'intitules_inadaptes',
]);

/**
 * Sources indisponibles pour toutes les pistes, quoi qu'en disent les journaux.
 * Retirer une entrée suffit à la réactiver : le parser reste en place.
 *
 * Emploi Territorial : accès automatiques bloqués par un pare-feu applicatif, et
 * API officielle (OpenAPI v5.3) authentifiée par un token délivré par le support
 * du GIP des CDG, sans endpoint de recherche des offres publiées.
 */
export const UNAVAILABLE_SOURCES: Partial<Record<JobSource, string>> = {
  emploi_territorial:
    'Emploi Territorial bloque les accès automatiques et son API est réservée aux collectivités. ' +
    'Créez une alerte e-mail sur emploi-territorial.fr.',
};

export type SourceFailureKind = Extract<
  SourceStatus,
  'bloquee' | 'introuvable' | 'erreur_reseau' | 'reponse_invalide' | 'intitules_inadaptes'
>;

/** Erreur typée d'une source : le statut est connu de l'émetteur, pas deviné d'un message. */
export class SourceError extends Error {
  readonly kind: SourceFailureKind;
  readonly httpStatus: number | null;
  readonly url: string | null;

  constructor(
    kind: SourceFailureKind,
    message: string,
    opts: { httpStatus?: number | null; url?: string | null } = {},
  ) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
    this.httpStatus = opts.httpStatus ?? null;
    this.url = opts.url ? sanitizeUrl(opts.url) : null;
  }
}

/** Détail d'un échec, tel que persisté dans `job_watch_fetch_log`. */
export interface SourceFailure {
  kind: SourceFailureKind;
  httpStatus: number | null;
  url: string | null;
}

// ── Détection de pages de pare-feu ───────────────────────────────────────────

/**
 * Une réponse 200 qui est en fait une page de pare-feu applicatif
 * (« Request Rejected », « Access Denied », challenge Cloudflare…).
 */
export function looksLikeBlockPage(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  if (/<title>\s*(request rejected|access denied|forbidden|just a moment|attention required|blocked)/.test(head)) {
    return true;
  }
  return [
    'the requested url was rejected',
    'your support id is',
    'cf-chl-',
    'checking your browser before accessing',
    'captcha-delivery',
    'datadome',
    'cf-browser-verification',
    'verify you are human',
    'vérifiez que vous êtes un humain',
  ].some(marker => head.includes(marker));
}

/** HTML reçu là où l'on attend du XML ou du JSON. */
export function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 300).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || /<html[\s>]/.test(head);
}

/**
 * Valide un corps de réponse attendu en `xml` ou `json`. Lève une `SourceError`
 * typée si c'est une page de pare-feu (`bloquee`) ou du HTML (`reponse_invalide`).
 */
export function assertExpectedBody(
  body: string,
  expected: 'xml' | 'json',
  ctx: { url: string; httpStatus?: number },
): void {
  if (looksLikeBlockPage(body)) {
    throw new SourceError(
      'bloquee',
      `Page de pare-feu reçue (Request Rejected) au lieu de ${expected.toUpperCase()}`,
      { httpStatus: ctx.httpStatus ?? 200, url: ctx.url },
    );
  }
  if (looksLikeHtml(body)) {
    throw new SourceError(
      'reponse_invalide',
      `HTML reçu au lieu de ${expected.toUpperCase()}`,
      { httpStatus: ctx.httpStatus ?? 200, url: ctx.url },
    );
  }
}

/**
 * Page HTML issue d'un navigateur intégré (sources scrapées) : si c'est un
 * contrôle anti-robot, la collecte s'arrête en `bloquee`. On ne tente jamais de
 * le franchir.
 */
export function assertNotChallengePage(html: string, ctx: { url: string }): void {
  if (looksLikeBlockPage(html)) {
    throw new SourceError('bloquee', 'Contrôle anti-robot affiché par le site', {
      httpStatus: 200, url: ctx.url,
    });
  }
}

/**
 * Erreur d'une source scrapée via le navigateur intégré (commande Rust
 * `scrape_with_session`, dont les messages sont « Navigation: … », « Lancement
 * Chrome: … », « Chrome/Chromium introuvable: … »). Sans cela, tout finissait en
 * « erreur réseau » sans URL ni explication. On garde le message d'origine, on
 * ajoute l'URL (sans secret) et on classe : un contrôle anti-robot est `bloquee`
 * (on s'arrête, sans contournement), le reste reste `erreur_reseau` avec la cause.
 */
export function scrapeSourceError(err: unknown, ctx: { url: string }): SourceError {
  if (err instanceof SourceError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const detail = classifyFailureMessage(raw);
  if (detail.kind === 'bloquee') {
    return new SourceError('bloquee', `Site inaccessible (refus ou contrôle anti-robot) : ${raw}`, {
      httpStatus: detail.httpStatus, url: ctx.url,
    });
  }
  const m = raw.toLowerCase();
  const cause = m.includes('chrome') && (m.includes('introuvable') || m.includes('lancement'))
    ? 'navigateur Chrome/Chromium indisponible sur cette machine'
    : m.includes('navigation') || m.includes('attente navigation')
      ? 'la page n\'a pas pu être chargée (connexion, DNS ou délai dépassé)'
      : 'échec du navigateur intégré';
  return new SourceError('erreur_reseau', `${cause} : ${raw}`, { httpStatus: detail.httpStatus, url: ctx.url });
}

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Retire d'une URL ce qui pourrait être un secret (jetons, clés, identifiants)
 * avant de la stocker ou de l'afficher. Les mots-clés de recherche sont gardés :
 * ils ne sont pas secrets et aident à comprendre l'échec.
 */
export function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/key|token|secret|auth|pass|sig|bearer|apikey/i.test(key)) u.searchParams.set(key, '***');
    }
    return u.toString();
  } catch {
    return raw.replace(/(key|token|secret)=[^&\s]+/gi, '$1=***');
  }
}

/**
 * Classe un échec à partir de son message quand le parser n'a pas levé de
 * `SourceError` (parsers historiques : « APEC HTTP 403 », « Algolia HTTP 500 »…).
 */
export function classifyFailureMessage(message: string): SourceFailure {
  const m = message.toLowerCase();
  const urlMatch = message.match(/https?:\/\/[^\s)"']+/);
  const url = urlMatch ? sanitizeUrl(urlMatch[0]) : null;
  const codeMatch = m.match(/\b(?:http|api|html|status|statut|erreur|error|code)\b[^]{0,12}\b([45]\d\d)\b/)
    ?? m.match(/\b([45]\d\d)\b/);
  const httpStatus = codeMatch ? Number(codeMatch[1]) : null;

  if (m.includes('request rejected') || m.includes('pare-feu') || m.includes('captcha')
    || m.includes('anti-bot') || m.includes('forbidden')
    || httpStatus === 403 || httpStatus === 429 || m.includes('too many requests')
    || m.includes('rate limit') || m.includes('rate-limit')) {
    return { kind: 'bloquee', httpStatus, url };
  }
  if (httpStatus === 404 || httpStatus === 410) return { kind: 'introuvable', httpStatus, url };
  if (m.includes('html reçu') || m.includes('parse error') || m.includes('erreur parsing')
    || m.includes('réponse sans champ') || m.includes('unexpected token') || m.includes('json')) {
    return { kind: 'reponse_invalide', httpStatus, url };
  }
  return { kind: 'erreur_reseau', httpStatus, url };
}

/** Détail d'un échec : le type porté par l'erreur prime sur la lecture du message. */
export function failureOf(err: unknown): SourceFailure {
  if (err instanceof SourceError) {
    return { kind: err.kind, httpStatus: err.httpStatus, url: err.url };
  }
  return classifyFailureMessage(err instanceof Error ? err.message : String(err));
}

/**
 * Statut final d'une collecte pour un couple (piste, source).
 * `failure` prime : un échec n'est jamais présenté comme « 0 offre ».
 */
/** Statut affiché : l'indisponibilité d'une source prime sur son dernier journal. */
export function displayStatus(source: JobSource, status: SourceStatus): SourceStatus {
  return source in UNAVAILABLE_SOURCES ? 'indisponible' : status;
}

export function deriveSourceStatus(input: {
  failure: SourceFailure | null;
  totalFetched: number;
}): SourceStatus {
  if (input.failure) return input.failure.kind;
  return input.totalFetched === 0 ? 'vide' : 'ok';
}

// ── Présentation ─────────────────────────────────────────────────────────────

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  ok:                  'Succès',
  vide:                'Vide',
  bloquee:             'Bloquée',
  introuvable:         'Introuvable',
  erreur_reseau:       'Erreur réseau',
  reponse_invalide:    'Réponse invalide',
  intitules_inadaptes: 'Intitulés inadaptés',
  non_configuree:      'Non configurée',
  en_attente:          'En attente',
  indisponible:        'Indisponible',
};

/** Statut persistant (`status` historique) → statut détaillé quand la ligne est ancienne. */
export function legacyToSourceStatus(status: 'success' | 'error' | 'empty'): SourceStatus {
  if (status === 'success') return 'ok';
  if (status === 'empty') return 'vide';
  return 'erreur_reseau';
}

const BLOCK_ADVICE: Partial<Record<JobSource, string>> = {
  choisir_service_public:
    'Choisir le service public a refusé les requêtes (ou robots.txt les interdit). Source mise en pause ; ne multipliez pas les essais.',
  apec: 'APEC refuse les requêtes automatiques. Créez une alerte e-mail APEC en attendant.',
  emploi_territorial:
    'Emploi Territorial refuse les requêtes automatiques. Source désactivée : consultez le site directement.',
};

/** Action conseillée affichée dans l'info-bulle ou la ligne dépliable. */
export function adviceFor(status: SourceStatus, source: JobSource): string {
  switch (status) {
    case 'indisponible':
      return UNAVAILABLE_SOURCES[source] ?? 'Source indisponible.';
    case 'ok':
      return 'Rien à faire.';
    case 'vide':
      return 'La requête est valide mais aucune offre ne correspond : élargissez les intitulés ou la zone.';
    case 'bloquee':
      return BLOCK_ADVICE[source]
        ?? 'Le site refuse les requêtes automatiques. Réessayez plus tard ; ne multipliez pas les essais.';
    case 'introuvable':
      return 'L\'adresse interrogée n\'existe plus : le site a probablement changé son interface. Source à réparer.';
    case 'erreur_reseau':
      return 'Panne réseau ou service indisponible : réessayez à la prochaine collecte.';
    case 'reponse_invalide':
      return 'Le site a répondu autre chose que des données (page HTML). Source à réparer, aucune offre n\'est comptée.';
    case 'intitules_inadaptes':
      return 'Ajoutez un intitulé français (ex : chargé de recrutement IT) pour interroger cette source.';
    case 'non_configuree':
      return 'Source non activée pour cette piste : activez-la dans la configuration.';
    case 'en_attente':
      return 'Aucune collecte n\'a encore été faite pour cette source.';
  }
}
