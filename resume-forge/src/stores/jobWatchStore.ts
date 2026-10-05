import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import {
  JobOffer,
  JobOfferWithAlerts,
  JobWatchAlert,
  JobWatchConfig,
  JobWatchSettings,
  JobWatchFilters,
  FetchLog,
  SearchProfile,
  DEFAULT_JOB_WATCH_SETTINGS,
  DEFAULT_SEARCH_PROFILE,
  DEFAULT_FILTERS,
  DEFAULT_EXPIRED_MAX_AGE_DAYS,
  JobSource,
} from '@/types/job-watch';
import { processFeedback, processCompanyReputation } from '@/lib/watcher/learning-engine';
import {
  resolveFeedbackAlert,
  replaceAlertSources,
  createAlert as createAlertRow,
  deleteAlert as deleteAlertRow,
  duplicateAlert as duplicateAlertRow,
  listAlerts,
  loadOfferAlertLinks,
  reorderAlerts as reorderAlertRows,
  updateAlert as updateAlertRow,
  type AlertPatch,
  type CreateAlertInput,
} from '@/lib/watcher/alerts';
import {
  colorForKind,
  toSearchProfile,
  type PortfolioImportPreview,
} from '@/lib/watcher/ai-portfolio';
import type { AIFilterRule } from '@/lib/watcher/ai-filter';
import type { SelectorOverride, DebugCapture } from '@/lib/watcher/selector-debug';

// ── Settings helpers ────────────────────────────────────────────────────────────

// Keys saved per-profile (override global defaults). All other keys are global
// (API credentials, SMTP config) shared across profiles on the same device.
const PROFILE_SETTINGS_KEYS = new Set([
  'fetch_interval_hours', 'email_digest_enabled', 'email_digest_time', 'email_to',
  'search_profile', 'commute_origin_address', 'commute_departure_time',
  'commute_max_minutes', 'min_save_score',
  'auto_clean_expired_enabled', 'expired_max_age_days',
  'learned_dict_positive', 'learned_dict_negative', 'learned_dict_decayed_at',
  'company_reputation',
  'ai_filter_rule',
]);

/**
 * Charge les réglages bruts (clé → valeur) en superposant les réglages du
 * profil aux réglages globaux de l'appareil.
 */
async function loadSettingsMap(profileId: string | null): Promise<Record<string, string>> {
  const db = await getDb();
  // Load global settings as base, then overlay profile-specific settings
  const rows = profileId
    ? await db.select<{ key: string; profile_id: string; value: string }[]>(
        `SELECT key, profile_id, value FROM job_watch_settings
         WHERE profile_id = '' OR profile_id = ?1`,
        [profileId],
      )
    : await db.select<{ key: string; profile_id: string; value: string }[]>(
        `SELECT key, profile_id, value FROM job_watch_settings WHERE profile_id = ''`,
      );
  const map: Record<string, string> = {};
  // Global rows first (lower priority)
  for (const row of rows.filter(r => r.profile_id === '')) map[row.key] = row.value;
  // Profile-specific rows override globals
  for (const row of rows.filter(r => r.profile_id !== '')) map[row.key] = row.value;
  return map;
}

function parseJson<T>(v: string | undefined, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

/**
 * Reconstruit un profil de recherche depuis les anciennes clés globales.
 *
 * Depuis la migration 019, le profil de recherche appartient à une alerte.
 * Cette fonction ne sert donc plus qu'au rattrapage : une base qui n'a jamais
 * rejoué la migration, ou qui en est restée aux formats v1/v2, doit pouvoir
 * amorcer sa première piste sans perdre la configuration de son utilisateur.
 */
export function resolveLegacySearchProfile(map: Record<string, string>): SearchProfile {
  // Priority: search_profile key (v3) → migrate from search_intent (v2) → default
  let searchProfile: SearchProfile = parseJson<SearchProfile>(
    map['search_profile'],
    DEFAULT_SEARCH_PROFILE,
  );

  // Migration from legacy search_intent (v2) if search_profile not yet present
  if (!map['search_profile'] && map['search_intent']) {
    try {
      const intent = JSON.parse(map['search_intent']);
      searchProfile = {
        ...DEFAULT_SEARCH_PROFILE,
        jobTitles:     intent.role?.primary     ?? [],
        skills:        intent.domain?.required  ?? [],
        domains:       intent.domain?.preferred ?? [],
        excludeTitles: intent.role?.mustExclude ?? [],
        excludeDomains: intent.domain?.excluded ?? [],
        salary: {
          min:    intent.salary?.hideIfBelow ?? null,
          target: intent.salary?.target      ?? null,
        },
      };
    } catch (e) {
      console.warn('[job-watch] search_intent (v2) illisible — migration ignorée, profil par défaut conservé', e);
    }
  }

  // Further legacy migration from flat positive/negative keywords (v1)
  if (!map['search_profile'] && !map['search_intent']) {
    const pos = parseJson<string[]>(map['positive_keywords'], []);
    const neg = parseJson<string[]>(map['negative_keywords'], []);
    if (pos.length > 0 || neg.length > 0) {
      searchProfile = {
        ...DEFAULT_SEARCH_PROFILE,
        jobTitles:     pos,
        excludeTitles: neg,
      };
    }
  }

  return searchProfile;
}

async function loadSettingsFromDb(profileId: string | null): Promise<JobWatchSettings> {
  const map = await loadSettingsMap(profileId);

  return {
    fetchIntervalHours:   parseInt(map['fetch_interval_hours']  ?? '4', 10),
    emailDigestEnabled:   (map['email_digest_enabled']  ?? '0') === '1',
    emailDigestTime:       map['email_digest_time']      ?? '08:00',
    emailSmtpHost:         map['email_smtp_host']        ?? '',
    emailSmtpPort:        parseInt(map['email_smtp_port'] ?? '587', 10),
    emailSmtpUser:         map['email_smtp_user']        ?? '',
    emailSmtpPassword:     map['email_smtp_password']    ?? '',
    emailTo:               map['email_to']               ?? '',
    navitiaApiKey:         map['navitia_api_key']         ?? '',
    commuteOriginAddress:  map['commute_origin_address']  ?? '',
    commuteDepartureTime:  map['commute_departure_time']  ?? '09:00',
    commuteMaxMinutes:    parseInt(map['commute_max_minutes'] ?? '75', 10),
    ftClientId:            map['ft_client_id']            ?? '',
    ftClientSecret:        map['ft_client_secret']        ?? '',
    ftAccessToken:         map['ft_access_token']         ?? '',
    ftTokenExpiresAt:      map['ft_token_expires_at']     ?? '',
    braveSearchApiKey:     map['brave_search_api_key']    ?? '',
    minSaveScore:         parseInt(map['min_save_score']  ?? '20', 10),
    autoCleanExpiredEnabled: (map['auto_clean_expired_enabled'] ?? '1') === '1',
    expiredMaxAgeDays:    parseInt(map['expired_max_age_days'] ?? String(DEFAULT_EXPIRED_MAX_AGE_DAYS), 10),
    // Mantiks fields are persisted as untyped extras (parser reads via cast).
    mantiksApiKey:         map['mantiks_api_key']         ?? '',
    mantiksBaseUrl:        map['mantiks_base_url']        ?? '',
    mantiksLocationIds:    map['mantiks_location_ids']    ?? '',
  } as JobWatchSettings;
}

async function saveSettingsToDb(settings: JobWatchSettings, profileId: string | null): Promise<void> {
  const db = await getDb();
  const anySettings = settings as unknown as Record<string, string>;
  // [key, value] — profile_id is resolved below based on PROFILE_SETTINGS_KEYS
  const entries: Array<[string, string]> = [
    ['fetch_interval_hours',   String(settings.fetchIntervalHours)],
    ['email_digest_enabled',   settings.emailDigestEnabled ? '1' : '0'],
    ['email_digest_time',      settings.emailDigestTime],
    ['email_smtp_host',        settings.emailSmtpHost],
    ['email_smtp_port',        String(settings.emailSmtpPort)],
    ['email_smtp_user',        settings.emailSmtpUser],
    ['email_smtp_password',    settings.emailSmtpPassword],
    ['email_to',               settings.emailTo],
    ['navitia_api_key',        settings.navitiaApiKey],
    ['commute_origin_address', settings.commuteOriginAddress],
    ['commute_departure_time', settings.commuteDepartureTime],
    ['commute_max_minutes',    String(settings.commuteMaxMinutes)],
    ['ft_client_id',           settings.ftClientId],
    ['ft_client_secret',       settings.ftClientSecret],
    ['ft_access_token',        settings.ftAccessToken],
    ['ft_token_expires_at',    settings.ftTokenExpiresAt],
    ['brave_search_api_key',   settings.braveSearchApiKey],
    ['min_save_score',         String(settings.minSaveScore)],
    ['auto_clean_expired_enabled', settings.autoCleanExpiredEnabled ? '1' : '0'],
    ['expired_max_age_days',   String(settings.expiredMaxAgeDays)],
    ['mantiks_api_key',        anySettings['mantiksApiKey']       ?? ''],
    ['mantiks_base_url',       anySettings['mantiksBaseUrl']      ?? ''],
    ['mantiks_location_ids',   anySettings['mantiksLocationIds']  ?? ''],
  ];
  for (const [key, value] of entries) {
    // Profile-specific keys are stored under the profile's ID; the rest stay global ('')
    const pid = (profileId && PROFILE_SETTINGS_KEYS.has(key)) ? profileId : '';
    await db.execute(
      `INSERT INTO job_watch_settings (key, profile_id, value) VALUES (?1, ?2, ?3)
       ON CONFLICT(key, profile_id) DO UPDATE SET value = ?3`,
      [key, pid, value]
    );
  }
}

// ── Store interface ────────────────────────────────────────────────────────────

export interface FetchProgress {
  source: JobSource;
  status: string;
  current?: number;
  total?: number;
  /** Piste(s) concernée(s) par l'étape en cours — une requête peut en servir plusieurs. */
  alertName?: string;
}

interface JobWatchState {
  offers: JobOfferWithAlerts[];
  /** Portefeuille de pistes de l'utilisateur, ordonné par position. */
  alerts: JobWatchAlert[];
  /** Piste sélectionnée dans l'UI. `null` = toutes les pistes. */
  activeAlertId: string | null;
  configs: JobWatchConfig[];
  settings: JobWatchSettings;
  filters: JobWatchFilters;
  fetchLogs: FetchLog[];
  isLoading: boolean;
  /**
   * Passe à true une fois les settings réellement chargés depuis la base.
   * Tant que c'est false, `settings` contient DEFAULT_JOB_WATCH_SETTINGS
   * (searchProfile vide) et ne doit PAS servir à lancer une collecte.
   */
  settingsLoaded: boolean;
  isFetching: boolean;
  fetchProgress: FetchProgress | null;
  error: string | null;
  lastFetchedAt: string | null;
  /** Per-source selector overrides set by the AI CSS debugger (global, not per-profile). */
  selectorOverrides: Record<string, SelectorOverride>;
  /** Last captured debug HTML per WebView source (ephemeral — cleared on reload). */
  selectorDebugInfo: Record<string, DebugCapture>;

  // Init
  initialize: () => Promise<void>;

  // ── Alertes ────────────────────────────────────────────────────────────────
  fetchAlerts: () => Promise<void>;
  setActiveAlert: (id: string | null) => void;
  createAlert: (input: CreateAlertInput) => Promise<JobWatchAlert>;
  updateAlert: (id: string, patch: AlertPatch) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  duplicateAlert: (id: string) => Promise<JobWatchAlert>;
  reorderAlerts: (orderedIds: string[]) => Promise<void>;
  /**
   * Garantit qu'au moins une piste existe si la veille a déjà été configurée.
   * Rattrape les bases n'ayant pas rejoué la migration 019 et les formats v1/v2.
   */
  ensureAlerts: () => Promise<void>;
  /**
   * Applique un portefeuille généré par l'IA. Les pistes de même nom sont
   * remplacées, les autres créées. Aucune offre n'est supprimée.
   */
  applyPortfolioImport: (preview: PortfolioImportPreview) => Promise<void>;

  // Offers
  fetchOffers: () => Promise<void>;
  insertOffer: (offer: Omit<JobOffer, 'id' | 'fetchedAt'>) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markArchived: (id: string, archived: boolean) => Promise<void>;
  setKanbanId: (offerId: string, kanbanId: string) => Promise<void>;
  deleteArchivedOffers: () => Promise<void>;
  clearAllOffers: () => Promise<void>;
  purgeOffers: (minScore: number) => Promise<number>;
  purgeExpiredOffers: (maxAgeDays: number) => Promise<number>;
  submitFeedback: (offerId: string, action: string, timeToAction?: number) => Promise<void>;
  batchArchive: (ids: string[]) => Promise<void>;
  batchMarkRead: (ids: string[]) => Promise<void>;

  // Fetch logs
  loadFetchLogs: () => Promise<void>;

  // Configs
  fetchConfigs: () => Promise<void>;
  upsertConfig: (
    config: Omit<JobWatchConfig, 'id' | 'createdAt' | 'lastFetchedAt' | 'alertId'>
      & { id?: string; alertId?: string | null },
  ) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  updateLastFetchedAt: (configId: string) => Promise<void>;

  // Settings
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: JobWatchSettings) => Promise<void>;
  updateSearchProfile: (profile: SearchProfile) => Promise<void>;

  // CSS selector overrides (AI debugger)
  loadSelectorOverrides: () => Promise<void>;
  saveSelectorOverride: (source: string, override: SelectorOverride | null) => Promise<void>;
  setSelectorDebugInfo: (source: string, capture: DebugCapture) => void;

  // UI state
  setFilters: (filters: Partial<JobWatchFilters>) => void;
  setFetching: (v: boolean) => void;
  setFetchProgress: (progress: FetchProgress | null) => void;
  setError: (msg: string | null) => void;

  // Computed
  filteredOffers: () => JobOfferWithAlerts[];
  unreadCount: () => number;
  /** Piste sélectionnée, ou `null` en vue « toutes les pistes ». */
  activeAlert: () => JobWatchAlert | null;
  /**
   * Profil de recherche courant : celui de la piste sélectionnée, à défaut
   * celui de la première piste du portefeuille.
   */
  activeSearchProfile: () => SearchProfile;
  /** Nombre d'offres non lues d'une piste donnée. */
  unreadCountForAlert: (alertId: string) => number;
}

// ── Store implementation ────────────────────────────────────────────────────────

export const useJobWatchStore = create<JobWatchState>((set, get) => ({
  offers: [],
  alerts: [],
  activeAlertId: null,
  configs: [],
  settings: DEFAULT_JOB_WATCH_SETTINGS,
  filters: DEFAULT_FILTERS,
  fetchLogs: [],
  isLoading: false,
  settingsLoaded: false,
  isFetching: false,
  fetchProgress: null,
  error: null,
  lastFetchedAt: null,
  selectorOverrides: {},
  selectorDebugInfo: {},

  initialize: async () => {
    // Les alertes portent le profil de recherche : elles doivent exister avant
    // que quoi que ce soit ne tente de le lire.
    await get().ensureAlerts();
    await Promise.all([
      get().fetchOffers(),
      get().fetchConfigs(),
      get().fetchSettings(),
      get().loadSelectorOverrides(),
    ]);

    // Clean up deprecated sources
    const configs = get().configs;
    const hasDeprecated = configs.some(
      c => (c.source as string) === 'indeed' || (c.source as string) === 'hellowork'
    );
    if (hasDeprecated) {
      for (const c of configs) {
        if ((c.source as string) === 'indeed' || (c.source as string) === 'hellowork') {
          await get().deleteConfig(c.id);
        }
      }
    }
  },

  // ── Alertes ─────────────────────────────────────────────────────────────────

  fetchAlerts: async () => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const alerts = await listAlerts(profileId);
    set(state => ({
      alerts,
      // Une piste supprimée ailleurs ne doit pas laisser la vue sur un filtre mort.
      activeAlertId: alerts.some(a => a.id === state.activeAlertId) ? state.activeAlertId : null,
    }));
  },

  setActiveAlert: (id) => set({ activeAlertId: id }),

  createAlert: async (input) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const alert = await createAlertRow(profileId, input);
    await get().fetchAlerts();
    await get().fetchConfigs();
    return alert;
  },

  updateAlert: async (id, patch) => {
    await updateAlertRow(id, patch);
    await get().fetchAlerts();
  },

  deleteAlert: async (id) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    await deleteAlertRow(profileId, id);
    await get().fetchAlerts();
    await get().fetchConfigs();
    // Les offres qui perdent leur dernier rattachement restent en base : on
    // recharge pour que la vue reflète leur nouvel état (« non rattachées »).
    await get().fetchOffers();
  },

  duplicateAlert: async (id) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const alert = await duplicateAlertRow(profileId, id);
    await get().fetchAlerts();
    await get().fetchConfigs();
    return alert;
  },

  reorderAlerts: async (orderedIds) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    await reorderAlertRows(profileId, orderedIds);
    await get().fetchAlerts();
  },

  applyPortfolioImport: async (preview) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;

    // Remplacements d'abord : ils libèrent des noms et n'augmentent pas le
    // nombre de pistes, ce qui évite de buter sur la limite en cours de route.
    for (const { existingAlertId, incoming } of preview.replacements) {
      await updateAlertRow(existingAlertId, {
        name:          incoming.name,
        kind:          incoming.kind,
        color:         colorForKind(incoming.kind),
        searchProfile: toSearchProfile(incoming),
        aiFilterRule:  incoming.aiFilter ?? null,
      });
      await replaceAlertSources(profileId, existingAlertId, incoming.sources);
    }

    for (const incoming of preview.creations) {
      await createAlertRow(profileId, {
        name:          incoming.name,
        kind:          incoming.kind,
        color:         colorForKind(incoming.kind),
        searchProfile: toSearchProfile(incoming),
        sources:       incoming.sources,
        aiFilterRule:  incoming.aiFilter ?? null,
      });
    }

    await get().fetchAlerts();
    await get().fetchConfigs();
  },

  ensureAlerts: async () => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;

    const existing = await listAlerts(profileId);
    if (existing.length > 0) {
      set({ alerts: existing });
      return;
    }

    // Aucune piste : soit l'utilisateur n'a jamais configuré la veille (rien à
    // faire, l'assistant de configuration s'en chargera), soit la migration 019
    // n'a pas été rejouée sur cette base et il faut amorcer la première piste
    // depuis les anciennes clés globales.
    const map = await loadSettingsMap(profileId);
    const db = await getDb();
    const orphanConfigs = profileId
      ? await db.select<Array<{ id: string }>>(
          `SELECT id FROM job_watch_config WHERE profile_id = ?1 AND alert_id IS NULL`,
          [profileId],
        )
      : await db.select<Array<{ id: string }>>(
          `SELECT id FROM job_watch_config WHERE profile_id IS NULL AND alert_id IS NULL`,
        );

    const hasLegacyConfig =
      Boolean(map['search_profile'] || map['search_intent'] || map['positive_keywords']) ||
      orphanConfigs.length > 0;
    if (!hasLegacyConfig) {
      set({ alerts: [] });
      return;
    }

    const alert = await createAlertRow(profileId, {
      name:          'Recherche principale',
      kind:          'core',
      searchProfile: resolveLegacySearchProfile(map),
      aiFilterRule:  parseJson<AIFilterRule | null>(map['ai_filter_rule'], null),
    });

    // Reprise de l'apprentissage global accumulé avant l'isolation par piste.
    await updateAlertRow(alert.id, {
      learnedDict: {
        positive: parseJson<Record<string, number>>(map['learned_dict_positive'], {}),
        negative: parseJson<Record<string, number>>(map['learned_dict_negative'], {}),
      },
      companyReputation: parseJson<Record<string, number>>(map['company_reputation'], {}),
      learnedDecayedAt:  map['learned_dict_decayed_at'] ?? null,
    });

    // Rattachement des sources orphelines puis des offres déjà collectées.
    for (const config of orphanConfigs) {
      await db.execute(`UPDATE job_watch_config SET alert_id = ?1 WHERE id = ?2`, [alert.id, config.id]);
    }
    await db.execute(
      profileId
        ? `INSERT OR IGNORE INTO job_offer_alerts (offer_id, alert_id, score, matched_at)
           SELECT id, ?1, COALESCE(score, 0), COALESCE(fetched_at, datetime('now'))
           FROM job_offers WHERE profile_id = ?2`
        : `INSERT OR IGNORE INTO job_offer_alerts (offer_id, alert_id, score, matched_at)
           SELECT id, ?1, COALESCE(score, 0), COALESCE(fetched_at, datetime('now'))
           FROM job_offers WHERE profile_id IS NULL`,
      profileId ? [alert.id, profileId] : [alert.id],
    );

    await get().fetchAlerts();
  },

  // ── Offers ──────────────────────────────────────────────────────────────────

  fetchOffers: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const { useAuthStore } = await import('@/stores/authStore');
      const profileId = useAuthStore.getState().currentUserId;
      const raw = profileId
        ? await db.select<Record<string, unknown>[]>(
            `SELECT * FROM job_offers WHERE profile_id = ?1 ORDER BY fetched_at DESC LIMIT 500`,
            [profileId],
          )
        : await db.select<Record<string, unknown>[]>(
            `SELECT * FROM job_offers WHERE profile_id IS NULL ORDER BY fetched_at DESC LIMIT 500`,
          );
      const offers = raw.map(r => keysToCamelCase<JobOffer>(r));
      const links = await loadOfferAlertLinks(offers.map(o => o.id));
      set({ offers: offers.map(o => ({ ...o, alerts: links.get(o.id) ?? [] })) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erreur chargement offres' });
    } finally {
      set({ isLoading: false });
    }
  },

  insertOffer: async (offer) => {
    const db = await getDb();
    await db.execute(
      `INSERT OR IGNORE INTO job_offers
        (source, url, hash, title, company, location, location_lat, location_lon,
         contract_type, description_snippet, published_at, score,
         commute_minutes, commute_status,
         salary_min, salary_max, salary_raw,
         is_read, is_archived, kanban_id)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`,
      [
        offer.source, offer.url, offer.hash, offer.title,
        offer.company ?? null, offer.location ?? null,
        offer.locationLat ?? null, offer.locationLon ?? null,
        offer.contractType ?? null, offer.descriptionSnippet ?? null,
        offer.publishedAt ?? null, offer.score,
        offer.commuteMinutes ?? null, offer.commuteStatus,
        offer.salaryMin ?? null, offer.salaryMax ?? null, offer.salaryRaw ?? null,
        offer.isRead, offer.isArchived, offer.kanbanId ?? null,
      ]
    );
  },

  markRead: async (id) => {
    const db = await getDb();
    await db.execute(`UPDATE job_offers SET is_read = 1 WHERE id = ?1`, [id]);
    set(state => ({
      offers: state.offers.map(o => o.id === id ? { ...o, isRead: 1 } : o),
    }));
  },

  markArchived: async (id, archived) => {
    const db = await getDb();
    const archivedAt = archived ? new Date().toISOString() : null;
    await db.execute(
      `UPDATE job_offers SET is_archived = ?1, archived_at = ?2 WHERE id = ?3`,
      [archived ? 1 : 0, archivedAt, id]
    );
    set(state => ({
      offers: state.offers.map(o =>
        o.id === id ? { ...o, isArchived: archived ? 1 : 0, archivedAt } : o
      ),
    }));
  },

  setKanbanId: async (offerId, kanbanId) => {
    const db = await getDb();
    await db.execute(`UPDATE job_offers SET kanban_id = ?1 WHERE id = ?2`, [kanbanId, offerId]);
    set(state => ({
      offers: state.offers.map(o => o.id === offerId ? { ...o, kanbanId } : o),
    }));
  },

  deleteArchivedOffers: async () => {
    const db = await getDb();
    await db.execute(`DELETE FROM job_offers WHERE is_archived = 1`);
    set(state => ({ offers: state.offers.filter(o => o.isArchived === 0) }));
  },

  clearAllOffers: async () => {
    const db = await getDb();
    await db.execute(`DELETE FROM job_offers`);
    set({ offers: [] });
  },

  batchArchive: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const archivedAt = new Date().toISOString();
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
    await db.execute(
      `UPDATE job_offers SET is_archived = 1, archived_at = '${archivedAt}' WHERE id IN (${placeholders})`,
      ids
    );
    set(state => ({
      offers: state.offers.map(o => ids.includes(o.id) ? { ...o, isArchived: 1, archivedAt } : o),
    }));
  },

  batchMarkRead: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
    await db.execute(
      `UPDATE job_offers SET is_read = 1 WHERE id IN (${placeholders})`,
      ids
    );
    set(state => ({
      offers: state.offers.map(o => ids.includes(o.id) ? { ...o, isRead: 1 } : o),
    }));
  },

  submitFeedback: async (offerId, action, timeToAction) => {
    const db = await getDb();
    const offer = get().offers.find(o => o.id === offerId);
    const resolvedTimeToAction = timeToAction !== undefined
      ? timeToAction
      : offer
        ? Math.floor((Date.now() - new Date(offer.fetchedAt).getTime()) / 1000)
        : null;

    // Le feedback est attribué à la piste dans le contexte de laquelle il a
    // été émis : c'est elle, et elle seule, qui apprend de ce verdict.
    const alertId = offer
      ? resolveFeedbackAlert(offer.alerts, get().filters.alertId)
      : null;

    await db.execute(
      `INSERT INTO job_offer_feedback (offer_id, action, time_to_action, alert_id) VALUES (?1, ?2, ?3, ?4)`,
      [offerId, action, resolvedTimeToAction, alertId]
    );

    if (action === 'thumbs_down' || action === 'quick_archive') {
      await get().markArchived(offerId, true);
    } else if (action === 'thumbs_up') {
      await get().markRead(offerId);
    }

    // Apprentissage de la piste concernée (fire & forget).
    const target = alertId ? get().alerts.find(a => a.id === alertId) : null;
    if (offer?.title && target) {
      (async () => {
        try {
          await get().updateAlert(target.id, {
            learnedDict:       processFeedback(offer.title, action, target.learnedDict, target.searchProfile),
            companyReputation: processCompanyReputation(offer.company, action, target.companyReputation),
          });
        } catch { /* silent */ }
      })();
    }
  },

  purgeOffers: async (minScore) => {
    const db = await getDb();
    const result = await db.execute(
      `DELETE FROM job_offers WHERE score < ?1 AND is_archived = 0`,
      [minScore]
    );
    await get().fetchOffers();
    return result.rowsAffected;
  },

  purgeExpiredOffers: async (maxAgeDays) => {
    const db = await getDb();
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    // Supprime les offres dont l'âge dépasse le seuil. L'âge est mesuré depuis
    // published_at quand il est exploitable, sinon depuis fetched_at (toujours un
    // timestamp SQLite valide). julianday() renvoie NULL sur une date illisible,
    // d'où le COALESCE qui retombe alors sur fetched_at. Les offres importées dans
    // le Kanban (kanban_id non nul) sont conservées pour ne pas casser le suivi.
    // Cf. `lib/watcher/cleanup.ts` qui implémente la même sémantique côté JS.
    const result = profileId
      ? await db.execute(
          `DELETE FROM job_offers
           WHERE profile_id = ?1
             AND kanban_id IS NULL
             AND (julianday('now') - COALESCE(julianday(published_at), julianday(fetched_at))) > ?2`,
          [profileId, maxAgeDays],
        )
      : await db.execute(
          `DELETE FROM job_offers
           WHERE profile_id IS NULL
             AND kanban_id IS NULL
             AND (julianday('now') - COALESCE(julianday(published_at), julianday(fetched_at))) > ?1`,
          [maxAgeDays],
        );
    await get().fetchOffers();
    return result.rowsAffected;
  },

  // ── Fetch logs ────────────────────────────────────────────────────────────────

  loadFetchLogs: async () => {
    try {
      const db = await getDb();
      const raw = await db.select<Record<string, unknown>[]>(
        `SELECT id, source, fetched_at, offers_fetched, offers_new,
                offers_duplicate, offers_filtered,
                status, error_message, duration_ms
         FROM job_watch_fetch_log
         ORDER BY fetched_at DESC
         LIMIT 300`
      );
      set({ fetchLogs: raw.map(r => keysToCamelCase<FetchLog>(r)) });
    } catch {
      // Non-critical — table may not exist on first launch before migration runs
    }
  },

  // ── Configs ──────────────────────────────────────────────────────────────────

  fetchConfigs: async () => {
    const db = await getDb();
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const raw = profileId
      ? await db.select<Record<string, unknown>[]>(
          `SELECT id, source, rss_url, enabled, last_fetched_at, created_at, alert_id
           FROM job_watch_config WHERE profile_id = ?1 ORDER BY source`,
          [profileId],
        )
      : await db.select<Record<string, unknown>[]>(
          `SELECT id, source, rss_url, enabled, last_fetched_at, created_at, alert_id
           FROM job_watch_config WHERE profile_id IS NULL ORDER BY source`,
        );
    const configs = raw.map(r => keysToCamelCase<JobWatchConfig>(r));
    // Hydrate lastFetchedAt depuis la base (max des last_fetched_at). Sans
    // cela, chaque démarrage était vu comme « jamais collecté » et
    // l'auto-fetch partait systématiquement, quel que soit l'intervalle.
    const lastDbFetch = configs.reduce<string | null>(
      (acc, c) => (c.lastFetchedAt && (!acc || c.lastFetchedAt > acc)) ? c.lastFetchedAt : acc,
      null,
    );
    set(state => ({ configs, lastFetchedAt: state.lastFetchedAt ?? lastDbFetch }));
  },

  upsertConfig: async (config) => {
    const db = await getDb();
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;

    if (config.id) {
      await db.execute(
        `UPDATE job_watch_config SET source=?1, rss_url=?2, enabled=?3
         WHERE id=?4 AND (profile_id = ?5 OR (profile_id IS NULL AND ?5 IS NULL))`,
        [config.source, config.rssUrl ?? null, config.enabled, config.id, profileId]
      );
    } else {
      // Une source appartient à une piste : sans rattachement, elle serait
      // collectée sans profil de recherche et n'apparaîtrait dans aucune vue.
      const alertId = config.alertId ?? get().activeAlert()?.id ?? get().alerts[0]?.id ?? null;
      await db.execute(
        `INSERT INTO job_watch_config (source, rss_url, enabled, profile_id, alert_id)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
        [config.source, config.rssUrl ?? null, config.enabled, profileId, alertId]
      );
    }
    await get().fetchConfigs();
  },

  deleteConfig: async (id) => {
    const db = await getDb();
    await db.execute(`DELETE FROM job_watch_config WHERE id = ?1`, [id]);
    set(state => ({ configs: state.configs.filter(c => c.id !== id) }));
  },

  updateLastFetchedAt: async (configId) => {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE job_watch_config SET last_fetched_at = ?1 WHERE id = ?2`,
      [now, configId]
    );
    set(state => ({
      configs: state.configs.map(c =>
        c.id === configId ? { ...c, lastFetchedAt: now } : c
      ),
      lastFetchedAt: now,
    }));
  },

  // ── Settings ──────────────────────────────────────────────────────────────────

  fetchSettings: async () => {
    try {
      const { useAuthStore } = await import('@/stores/authStore');
      const profileId = useAuthStore.getState().currentUserId;
      set({ settings: await loadSettingsFromDb(profileId), settingsLoaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erreur chargement paramètres' });
    }
  },

  saveSettings: async (settings) => {
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    await saveSettingsToDb(settings, profileId);
    set({ settings });
  },

  updateSearchProfile: async (profile: SearchProfile) => {
    // Le profil de recherche appartient désormais à une piste. Sans piste
    // active — premier passage par l'assistant de configuration — on crée
    // la piste principale du portefeuille.
    const target = get().activeAlert() ?? get().alerts[0] ?? null;
    if (!target) {
      await get().createAlert({
        name:          profile.name || 'Recherche principale',
        kind:          'core',
        searchProfile: profile,
      });
      return;
    }
    await get().updateAlert(target.id, { searchProfile: profile, name: target.name });
  },

  // ── CSS selector overrides ──────────────────────────────────────────────────
  // Stored as global settings (profile_id='') since selectors are site-wide.

  loadSelectorOverrides: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        `SELECT key, value FROM job_watch_settings
         WHERE key LIKE 'selector_override_%' AND profile_id = ''`,
      );
      const overrides: Record<string, SelectorOverride> = {};
      for (const row of rows) {
        const source = row.key.replace('selector_override_', '');
        if (row.value) {
          try { overrides[source] = JSON.parse(row.value) as SelectorOverride; } catch { /* skip */ }
        }
      }
      set({ selectorOverrides: overrides });
    } catch {
      set({ selectorOverrides: {} });
    }
  },

  saveSelectorOverride: async (source: string, override: SelectorOverride | null) => {
    const db = await getDb();
    const key = `selector_override_${source}`;
    const value = override === null ? '' : JSON.stringify(override);
    await db.execute(
      `INSERT INTO job_watch_settings (key, profile_id, value) VALUES (?1, '', ?2)
       ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
      [key, value],
    );
    set(state => ({
      selectorOverrides: override === null
        ? Object.fromEntries(Object.entries(state.selectorOverrides).filter(([k]) => k !== source))
        : { ...state.selectorOverrides, [source]: override },
    }));
  },

  setSelectorDebugInfo: (source: string, capture: DebugCapture) => {
    set(state => ({
      selectorDebugInfo: { ...state.selectorDebugInfo, [source]: capture },
    }));
  },

  // ── UI ─────────────────────────────────────────────────────────────────────────

  setFilters: (filters) => {
    set(state => ({ filters: { ...state.filters, ...filters } }));
  },

  setFetching: (v) => set({ isFetching: v, ...(v === false ? { fetchProgress: null } : {}) }),

  setFetchProgress: (progress) => set({ fetchProgress: progress }),

  setError: (msg) => set({ error: msg }),

  // ── Computed ───────────────────────────────────────────────────────────────────

  filteredOffers: () => {
    const { offers, filters, alerts } = get();

    // La blacklist entreprises est portée par les pistes : on applique celle de
    // la piste sélectionnée, ou l'union du portefeuille en vue « toutes ».
    const scopedAlerts = typeof filters.alertId === 'string' && filters.alertId !== 'unlinked'
      ? alerts.filter(a => a.id === filters.alertId)
      : alerts;
    const blacklist = new Set(
      scopedAlerts.flatMap(a => a.searchProfile.blacklistedCompanies.map(c => c.trim().toLowerCase())),
    );

    const filtered = offers.filter(o => {
      if (filters.alertId === 'unlinked') {
        if (o.alerts.length > 0) return false;
      } else if (filters.alertId !== null) {
        if (!o.alerts.some(l => l.alertId === filters.alertId)) return false;
      }
      if (!filters.sources.includes(o.source as JobSource)) return false;
      if (o.score < filters.minScore) return false;
      if (filters.status === 'unread'   && (o.isRead === 1 || o.isArchived === 1)) return false;
      if (filters.status === 'archived' && o.isArchived === 0) return false;
      if (filters.status === 'all'      && o.isArchived === 1) return false;
      if (
        filters.maxCommuteMinutes !== null &&
        o.commuteMinutes !== null &&
        o.commuteStatus === 'ok' &&
        o.commuteMinutes > filters.maxCommuteMinutes
      ) return false;
      if (filters.dateFrom && o.fetchedAt < filters.dateFrom) return false;
      if (filters.dateTo   && o.fetchedAt > filters.dateTo)   return false;

      if (blacklist.size > 0 && o.company && blacklist.has(o.company.trim().toLowerCase())) {
        return false;
      }

      if (filters.maxAgeDays !== null && o.publishedAt) {
        const ageMs  = Date.now() - new Date(o.publishedAt).getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (ageDays > filters.maxAgeDays) return false;
      }

      if (filters.contractTypes && filters.contractTypes.length > 0) {
        const textToSearch = `${o.contractType || ''} ${o.title || ''}`.toLowerCase();
        const hasMatch = filters.contractTypes.some(type => {
          const t = type.toLowerCase();
          if (t === 'cdi')              return textToSearch.includes('cdi');
          if (t === 'cdd')              return textToSearch.includes('cdd');
          if (t === 'freelance')        return textToSearch.includes('freelance') || textToSearch.includes('indépendant') || textToSearch.includes('contractor');
          if (t === 'stage/alternance') return textToSearch.includes('stage') || textToSearch.includes('alternance') || textToSearch.includes('apprentissage');
          return false;
        });
        if (!hasMatch) return false;
      }

      return true;
    });

    const sortBy = filters.sortBy ?? 'score_desc';
    // En vue filtrée, on trie sur le score de la piste, pas sur le meilleur
    // score : sinon l'ordre d'une piste secondaire est dicté par une autre.
    const scoreOf = (o: JobOfferWithAlerts): number =>
      typeof filters.alertId === 'string' && filters.alertId !== 'unlinked'
        ? (o.alerts.find(l => l.alertId === filters.alertId)?.score ?? o.score)
        : o.score;
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':  return scoreOf(b) - scoreOf(a);
        case 'date_newest': return (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? '');
        case 'date_oldest': return (a.fetchedAt ?? '').localeCompare(b.fetchedAt ?? '');
        case 'commute_asc': return (a.commuteMinutes ?? 9999) - (b.commuteMinutes ?? 9999);
        case 'salary_desc': return (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0);
        default:            return 0;
      }
    });

    return filtered;
  },

  unreadCount: () => get().offers.filter(o => o.isRead === 0 && o.isArchived === 0).length,

  unreadCountForAlert: (alertId) =>
    get().offers.filter(
      o => o.isRead === 0 && o.isArchived === 0 && o.alerts.some(l => l.alertId === alertId),
    ).length,

  activeAlert: () => {
    const { alerts, activeAlertId } = get();
    if (!activeAlertId) return null;
    return alerts.find(a => a.id === activeAlertId) ?? null;
  },

  activeSearchProfile: () =>
    get().activeAlert()?.searchProfile ?? get().alerts[0]?.searchProfile ?? DEFAULT_SEARCH_PROFILE,
}));
