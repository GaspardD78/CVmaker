/**
 * Orchestrateur de collecte des offres d'emploi — portefeuille multi-pistes.
 *
 * Une collecte sert jusqu'à quatre pistes de recherche à la fois. Le plan de
 * collecte regroupe les tâches par empreinte de requête, de sorte que deux
 * pistes interrogeant la même chose ne déclenchent qu'un seul appel réseau.
 *
 *  1. Construit le plan de collecte (tâches → groupes de requête)
 *  2. Exécute chaque groupe une fois, en espaçant les requêtes d'une même source
 *  3. Score chaque offre indépendamment pour chaque piste du groupe
 *  4. Agrège par hash : meilleur score, et rattachement piste par piste
 *  5. Calcule le temps de trajet des seules offres qui seront sauvegardées
 *  6. Insère les nouvelles offres et crée les liaisons offre↔piste manquantes
 *
 * Les erreurs par source sont loguées mais ne stoppent pas les autres tâches.
 */

import { getDb } from '@/lib/db';
import { isAndroid } from '@/lib/platform';
import type {
  CommuteStatus,
  FetchLog,
  JobSource,
  JobWatchAlert,
  JobWatchConfig,
  JobWatchSettings,
  RawJobOffer,
  SearchProfile,
} from '@/types/job-watch';
import { computeQueryKey } from './query-key';
import { linkOfferToAlerts } from './alerts';
import { ANDROID_INCOMPATIBLE } from './sources';
import { computeOfferHash, loadExistingOfferIndex, loadExistingFingerprints, detectCrossSourceDuplicates } from './deduplicator';
import { offerDedupKey } from './offer-dedup';
import { isOperationalSourceError } from './source-error';
import {
  deriveSourceStatus, failureOf, SourceError, UNAVAILABLE_SOURCES,
  type SourceFailure, type SourceStatus,
} from './source-status';
import {
  clearCooldown, cooldownUntil, formatCooldownMessage, isCoolingDown, loadCooldowns, saveCooldown,
} from './source-cooldown';
import { computeScore, LearnedSignals, SCORER_VERSION } from './scorer';
import { resolveProfileGeo, classifyOfferZone } from './geo';
import { getCommuteMinutes, getCommuteMinutesByCoords } from './commute';
import { parseApec } from './parsers/apec';
import { parseWttj } from './parsers/wttj';
// LinkedIn passe désormais par l'API publique « jobs-guest » — cf. parsers/linkedin-xray.ts.
// Le parser WebView connecté (parsers/linkedin.ts) reste en dépôt mais n'est
// plus utilisé : scraping authentifié = violation TOS LinkedIn + risque ban.
import { parseLinkedinXray } from './parsers/linkedin-xray';
import { parseIndeed } from './parsers/indeed';
import { parseHellowork } from './parsers/hellowork';
import { parseJobicy } from './parsers/jobicy';
import { parseFranceTravail, getTokenCache } from './parsers/france-travail';
import { parseEmploiTerritorial } from './parsers/emploi-territorial';
import { parseChoisirServicePublic, consumeCspMetrics, resetCspCollectionBudget } from './parsers/choisir-service-public';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { 
  isPermissionGranted, 
  requestPermission, 
  sendNotification 
} from '@tauri-apps/plugin-notification';

// ── Signaux appris ───────────────────────────────────────────────────────────

/**
 * Signaux de scoring d'une piste : dictionnaire appris, réputation entreprise
 * et règle de filtre IA.
 *
 * Ils sont portés par la piste et non plus par les réglages globaux : rejeter
 * des offres « commercial » sur la piste RH ne doit pas pénaliser la piste
 * exploratoire où ce terme est légitime.
 */
export function signalsOf(alert: JobWatchAlert): LearnedSignals {
  return {
    learnedDict:       alert.learnedDict,
    companyReputation: alert.companyReputation,
    aiFilterRule:      alert.aiFilterRule,
  };
}

// ── Plan de collecte ─────────────────────────────────────────────────────────

/**
 * Délai minimal entre deux requêtes visant une même source.
 *
 * Les sources scrapées sont les plus exposées : quatre pistes qui les
 * interrogent coup sur coup déclenchent leurs protections anti-bot. Les APIs
 * officielles tolèrent une cadence bien supérieure.
 */
export const SOURCE_THROTTLE_MS: Record<JobSource, number> = {
  linkedin:           4000,
  indeed:             4000,
  hellowork:          4000,
  wttj:               2000,
  apec:               1000,
  emploi_territorial: 1000,
  choisir_service_public: 1000, // la cadence d'une requête par seconde est aussi imposée dans le parser
  france_travail:      500,
  jobicy:              500,
  linkedin_rss:        500,
  mantiks:             500,
};

/**
 * Un groupe de requête : une seule requête réseau, dont le résultat est évalué
 * par chacune des pistes qui l'ont demandée.
 */
export interface FetchGroup {
  source: JobSource;
  queryKey: string;
  /** Config représentative — l'URL RSS fait partie de l'empreinte, donc identique. */
  config: JobWatchConfig;
  /** Profil représentatif — les paramètres de requête sont identiques par construction. */
  profile: SearchProfile;
  /** Pistes servies par ce groupe, dans l'ordre du portefeuille. */
  alerts: JobWatchAlert[];
}

/**
 * Construit le plan de collecte : une tâche par (piste active, source active),
 * regroupée par empreinte de requête.
 *
 * Fonction pure — c'est elle qui décide de la charge réseau du cycle.
 */
export function buildFetchPlan(
  alerts: JobWatchAlert[],
  configs: JobWatchConfig[],
  skipSources: Set<JobSource> = new Set(),
): FetchGroup[] {
  const byAlert = new Map(alerts.filter(a => a.enabled === 1).map(a => [a.id, a]));
  const groups = new Map<string, FetchGroup>();

  for (const config of configs) {
    if (config.enabled !== 1) continue;
    if (skipSources.has(config.source)) continue;
    const alert = config.alertId ? byAlert.get(config.alertId) : undefined;
    if (!alert) continue;

    const queryKey = computeQueryKey(config.source, alert.searchProfile, config.rssUrl);
    const existing = groups.get(queryKey);
    if (existing) {
      if (!existing.alerts.some(a => a.id === alert.id)) existing.alerts.push(alert);
    } else {
      groups.set(queryKey, {
        source:  config.source,
        queryKey,
        config,
        profile: alert.searchProfile,
        alerts:  [alert],
      });
    }
  }

  // Ordre stable : par piste principale puis par source, pour que la
  // progression affichée suive l'ordre du portefeuille.
  const positionOf = new Map(alerts.map(a => [a.id, a.position]));
  return [...groups.values()].sort((a, b) => {
    const pa = positionOf.get(a.alerts[0].id) ?? 0;
    const pb = positionOf.get(b.alerts[0].id) ?? 0;
    return pa !== pb ? pa - pb : a.source.localeCompare(b.source);
  });
}

export interface FetchLoadEstimate {
  /** Tâches demandées : pistes actives × sources actives. */
  tasks: number;
  /** Requêtes réseau réellement émises. */
  requests: number;
  /** Tâches économisées par la mutualisation. */
  mutualised: number;
  /** Temps d'attente cumulé imposé par le throttle, en millisecondes. */
  throttleMs: number;
}

/** Estimation de charge affichée dans la configuration. */
export function estimateFetchLoad(
  alerts: JobWatchAlert[],
  configs: JobWatchConfig[],
): FetchLoadEstimate {
  const enabledAlertIds = new Set(alerts.filter(a => a.enabled === 1).map(a => a.id));
  const tasks = configs.filter(
    c => c.enabled === 1 && c.alertId !== null && enabledAlertIds.has(c.alertId),
  ).length;

  const plan = buildFetchPlan(alerts, configs);
  const seen = new Set<JobSource>();
  let throttleMs = 0;
  for (const group of plan) {
    if (seen.has(group.source)) throttleMs += SOURCE_THROTTLE_MS[group.source] ?? 500;
    seen.add(group.source);
  }
  return { tasks, requests: plan.length, mutualised: tasks - plan.length, throttleMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Journalisation ───────────────────────────────────────────────────────────

/**
 * Persiste une ligne de log et purge au-delà des 50 dernières collectes du
 * couple (piste, source).
 *
 * La purge est bornée par couple et non par source : sinon quatre pistes se
 * disputeraient le même quota et l'historique d'une piste peu bavarde
 * disparaîtrait au premier cycle d'une piste volumineuse.
 *
 * Avale ses erreurs — journaliser ne doit jamais interrompre une collecte.
 */
async function writeFetchLog(
  db: Awaited<ReturnType<typeof getDb>>,
  alertId: string,
  entry: Omit<FetchLog, 'id' | 'fetchedAt'>,
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO job_watch_fetch_log
         (source, alert_id, offers_fetched, offers_new, offers_duplicate, offers_filtered, status, error_message, duration_ms,
          source_status, http_status, error_url, metrics)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      [
        entry.source,
        alertId,
        entry.offersFetched,
        entry.offersNew,
        entry.offersDuplicate,
        entry.offersFiltered,
        entry.status,
        entry.errorMessage,
        entry.durationMs,
        entry.sourceStatus ?? null,
        entry.httpStatus ?? null,
        entry.errorUrl ?? null,
        entry.metrics ?? null,
      ]
    );
    await db.execute(
      `DELETE FROM job_watch_fetch_log
       WHERE source = ?1 AND alert_id IS ?2
         AND id NOT IN (
           SELECT id FROM job_watch_fetch_log
           WHERE source = ?1 AND alert_id IS ?2
           ORDER BY fetched_at DESC
           LIMIT 50
         )`,
      [entry.source, alertId]
    );
  } catch (err) {
    console.warn('[fetcher] writeFetchLog error (non-fatal):', err);
  }
}

// ── Résultats ────────────────────────────────────────────────────────────────

export interface FetchResult {
  /** Piste concernée — une même source produit un résultat par piste servie. */
  alertId: string;
  alertName: string;
  source: JobSource;
  /** Offres réellement insérées en base pour cette piste */
  newOffers: number;
  /**
   * Offres déjà présentes en base, nouvellement rattachées à cette piste.
   * Distinct de `newOffers` : rien n'a été inséré, mais la piste les voit
   * apparaître dans sa liste.
   */
  offersLinked: number;
  /** Nombre total d'offres renvoyées par la source (avant tout filtrage) */
  totalFetched: number;
  /** Offres rejetées car déjà connues de cette piste ou doublon cross-source */
  offersDuplicate: number;
  /** Offres rejetées par le seuil de score ou le post-filtre géographique */
  offersFiltered: number;
  errors: string[];
  /** Durée de collecte (parsing uniquement) en ms */
  durationMs: number;
  /** Mesures propres à la source, en JSON (journal de collecte). */
  metrics?: string;
  /** Statut calculé : success si pas d'erreur et offres > 0, empty si 0 offre, error si erreur */
  status: 'success' | 'error' | 'empty';
  /**
   * Statut détaillé : distingue « 0 résultat » (`vide`) d'un blocage, d'une
   * adresse disparue ou d'une réponse invalide, qui ne sont jamais « 0 offre ».
   */
  sourceStatus: SourceStatus;
  /** Cause de l'échec de la requête, null si la source a répondu. */
  failure: SourceFailure | null;
}

/**
 * Bilan d'un cycle de collecte.
 *
 * `results` est détaillé par couple (piste, source) ; les compteurs de tête
 * sont dédoublonnés entre pistes — une offre captée par trois pistes reste une
 * seule offre nouvelle, et l'annoncer trois fois serait mensonger.
 */
export interface FetchOutcome {
  results: FetchResult[];
  /** Offres réellement insérées en base, quel que soit le nombre de pistes. */
  newOffers: number;
  /** Offres déjà en base nouvellement rattachées à au moins une piste. */
  linkedOffers: number;
}

export interface FetchProgressEvent {
  source: JobSource;
  status: string;
  current?: number;
  total?: number;
  /** Piste(s) concernée(s) par l'étape en cours. */
  alertName?: string;
}

/** Run a single parser — le profil de recherche pilote tous les paramètres de requête */
async function runParser(
  config: JobWatchConfig,
  settings: JobWatchSettings,
  profile: SearchProfile,
  profileId?: string | null,
): Promise<RawJobOffer[]> {
  switch (config.source) {
    case 'apec':               return parseApec(config, settings, profile);
    case 'wttj':               return parseWttj(config, settings, profile);
    case 'linkedin':           return parseLinkedinXray(config, settings, profile);
    case 'indeed':             return parseIndeed(config, settings, profile, profileId);
    case 'hellowork':          return parseHellowork(config, settings, profile, profileId);
    case 'jobicy':             return parseJobicy(config, settings, profile);
    case 'france_travail':     return parseFranceTravail(config, settings, profile);
    case 'emploi_territorial': return parseEmploiTerritorial(config, settings, profile);
    case 'choisir_service_public': return parseChoisirServicePublic(config, settings, profile);
    // Sources dépréciées — parsers supprimés. Les valeurs restent dans JobSource
    // pour l'affichage des offres historiques ; la migration 016 convertit les
    // configs linkedin_rss → linkedin.
    case 'linkedin_rss':
    case 'mantiks':
      throw new Error(`Source dépréciée: ${config.source}`);
    default:
      throw new Error(`Source inconnue: ${config.source as string}`);
  }
}

/**
 * Dépendances externes du pipeline, injectables.
 *
 * La production utilise `DEFAULT_FETCH_DEPS`. Les tests fournissent leurs
 * propres implémentations plutôt que de remplacer les modules globalement :
 * un mock de module fuirait vers les autres fichiers de test du même
 * processus et casserait, entre autres, les tests des parsers et du scorer.
 */
export interface FetchDependencies {
  runParser: typeof runParser;
  computeScore: typeof computeScore;
  resolveProfileGeo: typeof resolveProfileGeo;
  classifyOfferZone: typeof classifyOfferZone;
  getCommuteMinutes: typeof getCommuteMinutes;
  getCommuteMinutesByCoords: typeof getCommuteMinutesByCoords;
}

export const DEFAULT_FETCH_DEPS: FetchDependencies = {
  runParser,
  computeScore,
  resolveProfileGeo,
  classifyOfferZone,
  getCommuteMinutes,
  getCommuteMinutesByCoords,
};

/** Offre agrégée sur l'ensemble du cycle : un hash, N pistes, un score par piste. */
interface ProcessedOffer {
  raw: RawJobOffer;
  hash: string;
  /** Pistes retenues → score de la piste. */
  scores: Map<string, number>;
  /** Offre déjà en base : on rattachera au lieu d'insérer. */
  existingId: string | null;
  /** Meilleur score déjà enregistré en base pour cette offre. */
  existingScore: number;
  commuteMinutes: number | null;
  commuteStatus: CommuteStatus;
}

/**
 * Pipeline principal — collecte pour toutes les pistes actives du portefeuille.
 */
export async function runFetch(
  alerts:      JobWatchAlert[],
  configs:     JobWatchConfig[],
  settings:    JobWatchSettings,
  onProgress?: (event: FetchProgressEvent) => void,
  profileId?:  string | null,
  deps:        FetchDependencies = DEFAULT_FETCH_DEPS,
): Promise<FetchOutcome> {
  resetCspCollectionBudget();
  const db = await getDb();
  const existingOffers = await loadExistingOfferIndex(db, profileId ?? null);
  // Empreintes (source, entreprise, intitulé, lieu) : une annonce republiée sous
  // une autre adresse se rattache à l'offre connue au lieu d'être insérée en double.
  const fingerprints = await loadExistingFingerprints(db, profileId ?? null);

  // Sur Android, on saute silencieusement les sources de scraping (LinkedIn,
  // Indeed, HelloWork) qui ne fonctionnent pas de façon fiable sur mobile
  // (cf. ANDROID_INCOMPATIBLE). Mieux vaut les ignorer que de polluer l'UI
  // d'erreurs récurrentes.
  // Les sources indisponibles (UNAVAILABLE_SOURCES) ne sont jamais interrogées,
  // même si une configuration a été réactivée à la main.
  const unavailable = Object.keys(UNAVAILABLE_SOURCES) as JobSource[];
  const skipSources = new Set<JobSource>([
    ...(isAndroid() ? ANDROID_INCOMPATIBLE : []),
    ...unavailable,
  ]);
  const plan = buildFetchPlan(alerts, configs, skipSources);

  // Un résultat par couple (piste, source) — une même requête mutualisée
  // alimente plusieurs résultats.
  const results = new Map<string, FetchResult>();
  const resultKey = (alertId: string, source: JobSource) => `${alertId}::${source}`;
  const resultFor = (alert: JobWatchAlert, source: JobSource): FetchResult => {
    const key = resultKey(alert.id, source);
    let result = results.get(key);
    if (!result) {
      result = {
        alertId: alert.id, alertName: alert.name, source,
        newOffers: 0, offersLinked: 0, totalFetched: 0,
        offersDuplicate: 0, offersFiltered: 0,
        errors: [], durationMs: 0, status: 'empty',
        sourceStatus: 'vide', failure: null,
      };
      results.set(key, result);
    }
    return result;
  };

  // Zones de recherche résolues une fois par localisation, pas par piste :
  // plusieurs pistes partagent souvent la même ville. Sert de filet de
  // sécurité géographique — les sources dont le filtre serveur a sauté (INSEE
  // manquant, commune rejetée…) ramènent des offres de toute la France.
  // null = pas de localisation configurée ou API géo injoignable → fail-open.
  const geoCache = new Map<string, Awaited<ReturnType<typeof deps.resolveProfileGeo>>>();
  const geoZoneOf = async (profile: SearchProfile) => {
    const key = JSON.stringify(profile.location);
    if (!geoCache.has(key)) geoCache.set(key, await deps.resolveProfileGeo(profile.location));
    return geoCache.get(key) ?? null;
  };

  const cooldowns = await loadCooldowns(db);

  const processed = new Map<string, ProcessedOffer>();
  const lastRequestAt = new Map<JobSource, number>();

  // ── Phase 1 : une requête par groupe, scoring par piste ───────────────────
  for (const group of plan) {
    const alertNames = group.alerts.map(a => a.name).join(', ');

    // Source en pause après un refus : pas de nouvelle tentative (pas de martèlement).
    const cooldown = cooldowns.get(group.source);
    if (isCoolingDown(cooldown)) {
      const failure: SourceFailure = { kind: 'bloquee', httpStatus: null, url: null };
      const message = formatCooldownMessage(group.source, cooldown!);
      console.info(`[fetcher] ${message}`);
      for (const alert of group.alerts) {
        const result = resultFor(alert, group.source);
        result.errors.push(message);
        result.failure = failure;
        result.status = 'error';
      }
      continue;
    }

    // Throttle : deux requêtes distinctes vers une même source sont espacées.
    const previous = lastRequestAt.get(group.source);
    if (previous !== undefined) {
      const wait = (SOURCE_THROTTLE_MS[group.source] ?? 500) - (Date.now() - previous);
      if (wait > 0) {
        onProgress?.({ source: group.source, status: 'attente (anti-blocage)…', alertName: alertNames });
        await sleep(wait);
      }
    }
    lastRequestAt.set(group.source, Date.now());

    onProgress?.({ source: group.source, status: 'fetching', alertName: alertNames });
    const startTime = Date.now();

    let rawOffers: RawJobOffer[];
    try {
      rawOffers = await deps.runParser(group.config, settings, group.profile, profileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      // Une panne de source tierce (HTTP 4xx/5xx renvoyé par le service, réseau,
      // anti-bot, rate-limit) n'est pas un bug applicatif : la source est déjà
      // retryée côté parser, son échec est tracé dans le HealthDashboard et les
      // autres tâches continuent. On la logue donc en `console.warn`
      // (opérationnel) pour ne pas la faire remonter comme un bug dans le suivi
      // d'erreurs, qui n'enveloppe que `console.error`.
      const failure = failureOf(err);
      if (err instanceof SourceError || isOperationalSourceError(msg)) {
        console.warn(`[fetcher] Source ${group.source} indisponible (opérationnel) : ${msg}`);
      } else {
        console.error(`[fetcher] Erreur source ${group.source}:`, err);
      }
      for (const alert of group.alerts) {
        const result = resultFor(alert, group.source);
        result.errors.push(`Parser error: ${msg}`);
        result.durationMs = durationMs;
        result.status = 'error';
        result.failure = failure;
      }
      const until = cooldownUntil(group.source, failure);
      if (until) {
        cooldowns.set(group.source, { blockedUntil: until, reason: msg });
        await saveCooldown(db, group.source, until, msg);
      }
      continue;
    }

    if (cooldowns.has(group.source)) {
      cooldowns.delete(group.source);
      await clearCooldown(db, group.source);
    }

    const durationMs = Date.now() - startTime;
    // Mesure propre à la source (offres listées, retenues, enrichies…), journalisée avec la collecte.
    const metrics = group.source === 'choisir_service_public' ? consumeCspMetrics() : null;
    for (const alert of group.alerts) {
      const result = resultFor(alert, group.source);
      if (metrics) result.metrics = JSON.stringify(metrics);
      result.totalFetched += rawOffers.length;
      result.durationMs += durationMs;
    }

    onProgress?.({
      source: group.source,
      status: `${rawOffers.length} offres récupérées, analyse…`,
      current: 0,
      total: rawOffers.length,
      alertName: alertNames,
    });

    for (const raw of rawOffers) {
      try {
        let hash = await computeOfferHash(raw.source, raw.url);
        if (!existingOffers.has(hash) && !processed.has(hash)) {
          const fingerprint = offerDedupKey({
            id: hash, source: raw.source, title: raw.title,
            company: raw.company ?? null, location: raw.location ?? null,
          });
          if (!fingerprint.startsWith('id:')) {
            const known = fingerprints.get(fingerprint);
            if (known) hash = known;               // même annonce, autre adresse
            else fingerprints.set(fingerprint, hash);
          }
        }
        const existing = existingOffers.get(hash) ?? null;

        for (const alert of group.alerts) {
          const result = resultFor(alert, group.source);

          // Offre déjà connue de cette piste : rien à faire.
          if (existing?.alertIds.has(alert.id)) {
            result.offersDuplicate += 1;
            continue;
          }

          // Post-filtre géographique : offre manifestement hors zone (GPS ou
          // code département du libellé) → écartée. `unknown` (pas de données
          // fiables) conserve l'offre.
          const geoZone = await geoZoneOf(alert.searchProfile);
          if (geoZone && deps.classifyOfferZone(raw, geoZone, alert.searchProfile.location.radiusKm) === 'out') {
            result.offersFiltered += 1;
            continue;
          }

          const score = deps.computeScore(raw, alert.searchProfile, signalsOf(alert));

          // Le seuil décide du rattachement piste par piste. Une piste qui a
          // disqualifié l'offre (score 0) n'est jamais rattachée.
          if (score < settings.minSaveScore) {
            result.offersFiltered += 1;
            continue;
          }

          let entry = processed.get(hash);
          if (!entry) {
            entry = {
              raw, hash,
              scores: new Map(),
              existingId: existing?.id ?? null,
              existingScore: existing?.score ?? 0,
              commuteMinutes: null,
              commuteStatus: 'pending',
            };
            processed.set(hash, entry);
          }
          const previousScore = entry.scores.get(alert.id);
          if (previousScore === undefined || score > previousScore) {
            entry.scores.set(alert.id, score);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const alert of group.alerts) {
          resultFor(alert, group.source).errors.push(`Offre ${raw.url}: ${msg}`);
        }
        console.error('[fetcher] Erreur traitement offre:', err);
      }
    }

    onProgress?.({ source: group.source, status: 'traitement terminé', alertName: alertNames });
  }

  const retained = [...processed.values()].filter(p => p.scores.size > 0);
  const bestScoreOfEntry = (p: ProcessedOffer) => Math.max(0, ...p.scores.values());

  // ── Phase 2 : déduplication cross-source ─────────────────────────────────
  // Seules les offres à insérer sont concernées : une offre déjà en base a
  // déjà passé cette étape, la re-dédupliquer priverait une nouvelle piste
  // d'un rattachement légitime.
  const toInsert = retained.filter(p => p.existingId === null);
  const skipIndices = detectCrossSourceDuplicates(
    toInsert.map(p => ({
      title: p.raw.title, company: p.raw.company, location: p.raw.location,
      source: p.raw.source, score: bestScoreOfEntry(p),
    })),
  );
  const skipped = new Set<string>();
  for (const index of skipIndices) {
    const entry = toInsert[index];
    skipped.add(entry.hash);
    for (const alertId of entry.scores.keys()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) resultFor(alert, entry.raw.source as JobSource).offersDuplicate += 1;
    }
  }

  const toSave = retained.filter(p => !skipped.has(p.hash));

  // ── Phase 2.5 : temps de trajet des seules offres qui seront sauvegardées ─
  // Calculer le trajet avant la déduplication et le seuil gaspillait le quota
  // Navitia/Nominatim et rallongeait la collecte de plusieurs minutes.
  const needsCommute = Boolean(settings.navitiaApiKey && settings.commuteOriginAddress);
  if (needsCommute) {
    const pending = toSave.filter(p => p.existingId === null);
    let index = 0;
    for (const entry of pending) {
      index += 1;
      if (index === 1 || index % 5 === 0) {
        onProgress?.({
          source: entry.raw.source as JobSource,
          status: 'Calcul trajet…',
          current: index,
          total: pending.length,
        });
      }
      try {
        if (entry.raw.locationLat != null && entry.raw.locationLon != null) {
          const res = await deps.getCommuteMinutesByCoords(
            settings.commuteOriginAddress, entry.raw.locationLat, entry.raw.locationLon,
            settings.commuteDepartureTime, settings.navitiaApiKey,
          );
          entry.commuteStatus  = res.status;
          entry.commuteMinutes = res.minutes;
        } else if (entry.raw.location) {
          const res = await deps.getCommuteMinutes(
            settings.commuteOriginAddress, entry.raw.location,
            settings.commuteDepartureTime, settings.navitiaApiKey,
          );
          entry.commuteStatus  = res.status;
          entry.commuteMinutes = res.minutes;
        } else {
          entry.commuteStatus = 'not_found';
        }
      } catch (err) {
        console.warn('[fetcher] calcul de trajet ignoré (non bloquant):', err);
        entry.commuteStatus = 'error';
      }
    }
  } else {
    for (const entry of toSave) {
      if (!entry.raw.location && entry.raw.locationLat == null) entry.commuteStatus = 'not_found';
    }
  }

  // ── Phase 3 : insertion et rattachement ──────────────────────────────────
  // Compteurs dédoublonnés entre pistes, pour l'annonce faite à l'utilisateur.
  let insertedOffers = 0;
  let linkedOffers = 0;

  for (const entry of toSave) {
    const bestScore = bestScoreOfEntry(entry);
    const links = [...entry.scores.entries()].map(([alertId, score]) => ({ alertId, score }));

    try {
      let offerId = entry.existingId;
      const isNewOffer = offerId === null;

      if (!offerId) {
        await db.execute(
          `INSERT OR IGNORE INTO job_offers
            (source, url, hash, title, company, location, location_lat, location_lon,
             contract_type, description_snippet, published_at, score,
             commute_minutes, commute_status,
             salary_min, salary_max, salary_raw,
             is_read, is_archived, kanban_id, profile_id, score_version, origin, reference, employer_type)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,0,0,NULL,?18,?19,?20,?21,?22)`,
          [
            entry.raw.source, entry.raw.url, entry.hash, entry.raw.title,
            entry.raw.company ?? null, entry.raw.location ?? null,
            entry.raw.locationLat ?? null, entry.raw.locationLon ?? null,
            entry.raw.contractType ?? null, entry.raw.descriptionSnippet ?? null,
            entry.raw.publishedAt ?? null, bestScore,
            entry.commuteMinutes, entry.commuteStatus,
            entry.raw.salaryMin ?? null, entry.raw.salaryMax ?? null, entry.raw.salaryRaw ?? null,
            profileId ?? null, SCORER_VERSION,
            entry.raw.origin ?? null, entry.raw.reference ?? null, entry.raw.employerType ?? null,
          ]
        );
        const rows = await db.select<{ id: string }[]>(
          `SELECT id FROM job_offers WHERE hash = ?1`, [entry.hash],
        );
        offerId = rows[0]?.id ?? null;
      }

      if (!offerId) {
        console.warn('[fetcher] offre insérée introuvable par son hash — rattachement ignoré');
        continue;
      }

      // Idempotent : relève un score existant, n'écrase jamais `matched_at`,
      // et ne touche pas au statut lu/archivé porté par l'offre.
      await linkOfferToAlerts(offerId, links);

      if (isNewOffer) insertedOffers += 1;
      else linkedOffers += 1;

      for (const { alertId } of links) {
        const alert = alerts.find(a => a.id === alertId);
        if (!alert) continue;
        const result = resultFor(alert, entry.raw.source as JobSource);
        if (isNewOffer) result.newOffers += 1;
        else result.offersLinked += 1;
      }

      // L'index en mémoire suit les insertions : une offre vue deux fois dans
      // le même cycle ne doit pas être réinsérée.
      existingOffers.set(entry.hash, {
        id: offerId,
        score: Math.max(bestScore, entry.existingScore),
        alertIds: new Set([...(existingOffers.get(entry.hash)?.alertIds ?? []), ...entry.scores.keys()]),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const alertId of entry.scores.keys()) {
        const alert = alerts.find(a => a.id === alertId);
        if (alert) resultFor(alert, entry.raw.source as JobSource).errors.push(`Offre ${entry.raw.url}: ${msg}`);
      }
      console.error('[fetcher] Erreur insertion offre:', err);
    }
  }

  // ── Statuts finaux et journalisation ─────────────────────────────────────
  const finalResults = [...results.values()];
  for (const result of finalResults) {
    if (result.errors.length > 0)        result.status = 'error';
    else if (result.totalFetched === 0)  result.status = 'empty';
    else                                 result.status = 'success';
    // Une erreur de traitement d'offre (sans échec de requête) reste une erreur
    // réseau/applicative côté statut détaillé ; un échec de requête garde son type.
    result.sourceStatus = result.status === 'error' && !result.failure
      ? 'erreur_reseau'
      : deriveSourceStatus({ failure: result.failure, totalFetched: result.totalFetched });

    onProgress?.({
      source: result.source,
      status: `done (${result.newOffers} nouvelles)`,
      alertName: result.alertName,
    });

    await writeFetchLog(db, result.alertId, {
      source:          result.source,
      offersFetched:   result.totalFetched,
      offersNew:       result.newOffers,
      offersDuplicate: result.offersDuplicate,
      offersFiltered:  result.offersFiltered,
      status:          result.status,
      errorMessage:    result.errors.length > 0 ? result.errors[0] : null,
      durationMs:      result.durationMs,
      sourceStatus:    result.sourceStatus,
      httpStatus:      result.failure?.httpStatus ?? null,
      errorUrl:        result.failure?.url ?? null,
      metrics:         result.metrics ?? null,
    });
  }

  // Persist France Travail token if refreshed
  const ftCache = getTokenCache();
  if (ftCache) {
    const store = useJobWatchStore.getState();
    await store.saveSettings({
      ...store.settings,
      ftAccessToken:    ftCache.accessToken,
      ftTokenExpiresAt: String(ftCache.expiresAt),
    });
  }

  if (insertedOffers > 0) {
    try {
      let permission = await isPermissionGranted();
      if (!permission) {
        permission = await requestPermission() === 'granted';
      }
      if (permission) {
        sendNotification({
          title: 'Nouvelles offres trouvées !',
          body: `${insertedOffers} nouvelles offres correspondent à vos critères.`,
          icon: 'ic_launcher', // Icône Android par défaut
        });
      }
    } catch (err) {
      console.warn('[fetcher] Erreur notification native:', err);
    }
  }

  return { results: finalResults, newOffers: insertedOffers, linkedOffers };
}
