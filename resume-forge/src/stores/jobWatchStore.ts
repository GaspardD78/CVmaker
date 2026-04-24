import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import {
  JobOffer,
  JobWatchConfig,
  JobWatchSettings,
  JobWatchFilters,
  FetchLog,
  SearchProfile,
  DEFAULT_JOB_WATCH_SETTINGS,
  DEFAULT_SEARCH_PROFILE,
  DEFAULT_FILTERS,
  JobSource,
} from '@/types/job-watch';
import { processFeedback, processCompanyReputation, LearnedDictionary } from '@/lib/watcher/learning-engine';

// ── Settings helpers ────────────────────────────────────────────────────────────

// Keys saved per-profile (override global defaults). All other keys are global
// (API credentials, SMTP config) shared across profiles on the same device.
const PROFILE_SETTINGS_KEYS = new Set([
  'fetch_interval_hours', 'email_digest_enabled', 'email_digest_time', 'email_to',
  'search_profile', 'commute_origin_address', 'commute_departure_time',
  'commute_max_minutes', 'min_save_score',
  'learned_dict_positive', 'learned_dict_negative', 'learned_dict_decayed_at',
  'company_reputation',
]);

async function loadSettingsFromDb(profileId: string | null): Promise<JobWatchSettings> {
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

  const parseJson = <T>(v: string | undefined, fallback: T): T => {
    if (!v) return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  };

  // ── Resolve SearchProfile ───────────────────────────────────────────────────
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
    } catch { /* ignore — keep default */ }
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

  return {
    fetchIntervalHours:   parseInt(map['fetch_interval_hours']  ?? '4', 10),
    emailDigestEnabled:   (map['email_digest_enabled']  ?? '0') === '1',
    emailDigestTime:       map['email_digest_time']      ?? '08:00',
    emailSmtpHost:         map['email_smtp_host']        ?? '',
    emailSmtpPort:        parseInt(map['email_smtp_port'] ?? '587', 10),
    emailSmtpUser:         map['email_smtp_user']        ?? '',
    emailSmtpPassword:     map['email_smtp_password']    ?? '',
    emailTo:               map['email_to']               ?? '',
    searchProfile,
    navitiaApiKey:         map['navitia_api_key']         ?? '',
    commuteOriginAddress:  map['commute_origin_address']  ?? '',
    commuteDepartureTime:  map['commute_departure_time']  ?? '09:00',
    commuteMaxMinutes:    parseInt(map['commute_max_minutes'] ?? '75', 10),
    ftClientId:            map['ft_client_id']            ?? '',
    ftClientSecret:        map['ft_client_secret']        ?? '',
    ftAccessToken:         map['ft_access_token']         ?? '',
    ftTokenExpiresAt:      map['ft_token_expires_at']     ?? '',
    minSaveScore:         parseInt(map['min_save_score']  ?? '20', 10),
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
    ['search_profile',         JSON.stringify(settings.searchProfile)],
    ['navitia_api_key',        settings.navitiaApiKey],
    ['commute_origin_address', settings.commuteOriginAddress],
    ['commute_departure_time', settings.commuteDepartureTime],
    ['commute_max_minutes',    String(settings.commuteMaxMinutes)],
    ['ft_client_id',           settings.ftClientId],
    ['ft_client_secret',       settings.ftClientSecret],
    ['ft_access_token',        settings.ftAccessToken],
    ['ft_token_expires_at',    settings.ftTokenExpiresAt],
    ['min_save_score',         String(settings.minSaveScore)],
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
}

interface JobWatchState {
  offers: JobOffer[];
  configs: JobWatchConfig[];
  settings: JobWatchSettings;
  filters: JobWatchFilters;
  fetchLogs: FetchLog[];
  isLoading: boolean;
  isFetching: boolean;
  fetchProgress: FetchProgress | null;
  error: string | null;
  lastFetchedAt: string | null;

  // Init
  initialize: () => Promise<void>;

  // Offers
  fetchOffers: () => Promise<void>;
  insertOffer: (offer: Omit<JobOffer, 'id' | 'fetchedAt'>) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markArchived: (id: string, archived: boolean) => Promise<void>;
  setKanbanId: (offerId: string, kanbanId: string) => Promise<void>;
  deleteArchivedOffers: () => Promise<void>;
  clearAllOffers: () => Promise<void>;
  purgeOffers: (minScore: number) => Promise<number>;
  submitFeedback: (offerId: string, action: string, timeToAction?: number) => Promise<void>;
  batchArchive: (ids: string[]) => Promise<void>;
  batchMarkRead: (ids: string[]) => Promise<void>;

  // Fetch logs
  loadFetchLogs: () => Promise<void>;

  // Configs
  fetchConfigs: () => Promise<void>;
  upsertConfig: (config: Omit<JobWatchConfig, 'id' | 'createdAt' | 'lastFetchedAt'> & { id?: string }) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  updateLastFetchedAt: (configId: string) => Promise<void>;

  // Settings
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: JobWatchSettings) => Promise<void>;
  updateSearchProfile: (profile: SearchProfile) => Promise<void>;

  // UI state
  setFilters: (filters: Partial<JobWatchFilters>) => void;
  setFetching: (v: boolean) => void;
  setFetchProgress: (progress: FetchProgress | null) => void;
  setError: (msg: string | null) => void;

  // Computed
  filteredOffers: () => JobOffer[];
  unreadCount: () => number;
}

// ── Store implementation ────────────────────────────────────────────────────────

export const useJobWatchStore = create<JobWatchState>((set, get) => ({
  offers: [],
  configs: [],
  settings: DEFAULT_JOB_WATCH_SETTINGS,
  filters: DEFAULT_FILTERS,
  fetchLogs: [],
  isLoading: false,
  isFetching: false,
  fetchProgress: null,
  error: null,
  lastFetchedAt: null,

  initialize: async () => {
    await Promise.all([
      get().fetchOffers(),
      get().fetchConfigs(),
      get().fetchSettings(),
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
      set({ offers: raw.map(r => keysToCamelCase<JobOffer>(r)) });
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

    await db.execute(
      `INSERT INTO job_offer_feedback (offer_id, action, time_to_action) VALUES (?1, ?2, ?3)`,
      [offerId, action, resolvedTimeToAction]
    );

    if (action === 'thumbs_down' || action === 'quick_archive') {
      await get().markArchived(offerId, true);
    } else if (action === 'thumbs_up') {
      await get().markRead(offerId);
    }

    // Update learned dictionary & company reputation (fire & forget, scoped to profile)
    if (offer?.title) {
      (async () => {
        try {
          const { useAuthStore } = await import('@/stores/authStore');
          const pid = useAuthStore.getState().currentUserId ?? '';
          const rows = await db.select<{ key: string; profile_id: string; value: string }[]>(
            `SELECT key, profile_id, value FROM job_watch_settings
             WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'company_reputation')
             AND (profile_id = '' OR profile_id = ?1)`,
            [pid],
          );
          const map: Record<string, string> = {};
          for (const r of rows.filter(x => x.profile_id === '')) map[r.key] = r.value;
          for (const r of rows.filter(x => x.profile_id !== '')) map[r.key] = r.value;

          const currentDict: LearnedDictionary = {
            positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
            negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
          };
          const updated = processFeedback(offer.title, action, currentDict);
          await db.execute(
            `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('learned_dict_positive', ?1, ?2)
             ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
            [pid, JSON.stringify(updated.positive)]
          );
          await db.execute(
            `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('learned_dict_negative', ?1, ?2)
             ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
            [pid, JSON.stringify(updated.negative)]
          );

          const currentRep: Record<string, number> = map['company_reputation']
            ? JSON.parse(map['company_reputation'])
            : {};
          const updatedRep = processCompanyReputation(offer.company, action, currentRep);
          await db.execute(
            `INSERT INTO job_watch_settings (key, profile_id, value) VALUES ('company_reputation', ?1, ?2)
             ON CONFLICT(key, profile_id) DO UPDATE SET value = ?2`,
            [pid, JSON.stringify(updatedRep)]
          );
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
          `SELECT id, source, rss_url, enabled, last_fetched_at, created_at
           FROM job_watch_config WHERE profile_id = ?1 ORDER BY source`,
          [profileId],
        )
      : await db.select<Record<string, unknown>[]>(
          `SELECT id, source, rss_url, enabled, last_fetched_at, created_at
           FROM job_watch_config WHERE profile_id IS NULL ORDER BY source`,
        );
    set({ configs: raw.map(r => keysToCamelCase<JobWatchConfig>(r)) });
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
      await db.execute(
        `INSERT INTO job_watch_config (source, rss_url, enabled, profile_id)
         VALUES (?1, ?2, ?3, ?4)`,
        [config.source, config.rssUrl ?? null, config.enabled, profileId]
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
      set({ settings: await loadSettingsFromDb(profileId) });
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
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const settings = { ...get().settings, searchProfile: profile };
    await saveSettingsToDb(settings, profileId);
    set({ settings });
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
    const { offers, filters, settings } = get();

    const filtered = offers.filter(o => {
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

      const profile = settings.searchProfile;
      if (profile.blacklistedCompanies.length > 0 && o.company) {
        const companyLower = o.company.toLowerCase();
        if (profile.blacklistedCompanies.some(b => b.toLowerCase() === companyLower)) return false;
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
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':  return b.score - a.score;
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
}));
