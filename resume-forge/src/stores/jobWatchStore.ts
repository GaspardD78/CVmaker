import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import {
  JobOffer,
  JobWatchConfig,
  JobWatchSettings,
  JobWatchFilters,
  SearchIntent,
  DEFAULT_JOB_WATCH_SETTINGS,
  DEFAULT_SEARCH_INTENT,
  DEFAULT_FILTERS,
  JobSource,
} from '@/types/job-watch';
import { processFeedback, processCompanyReputation, LearnedDictionary } from '@/lib/watcher/learning-engine';

// ── Settings helpers ────────────────────────────────────────────────────────

async function loadSettingsFromDb(): Promise<JobWatchSettings> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM job_watch_settings'
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const parseJson = <T>(v: string | undefined, fallback: T): T => {
    if (!v) return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  };

  // Resolve SearchIntent — prefer the structured key; fall back to migrating
  // legacy flat keyword arrays for installations upgrading from Sprint 1.
  let searchIntent: SearchIntent = parseJson<SearchIntent>(map['search_intent'], DEFAULT_SEARCH_INTENT);
  if (
    !map['search_intent'] &&
    (map['positive_keywords'] || map['negative_keywords'])
  ) {
    searchIntent = {
      ...DEFAULT_SEARCH_INTENT,
      role: {
        primary:     parseJson<string[]>(map['positive_keywords'], []),
        mustExclude: parseJson<string[]>(map['negative_keywords'], []),
      },
    };
  }

  return {
    fetchIntervalHours:   parseInt(map['fetch_interval_hours']  ?? '4', 10),
    emailDigestEnabled:   (map['email_digest_enabled']  ?? '1') === '1',
    emailDigestTime:       map['email_digest_time']      ?? '08:00',
    emailSmtpHost:         map['email_smtp_host']        ?? '',
    emailSmtpPort:        parseInt(map['email_smtp_port'] ?? '587', 10),
    emailSmtpUser:         map['email_smtp_user']        ?? '',
    emailSmtpPassword:     map['email_smtp_password']    ?? '',
    emailTo:               map['email_to']               ?? '',
    searchIntent,
    navitiaApiKey:         map['navitia_api_key']         ?? '',
    commuteOriginAddress:  map['commute_origin_address']  ?? '',
    commuteDepartureTime:  map['commute_departure_time']  ?? '09:00',
    commuteMaxMinutes:    parseInt(map['commute_max_minutes'] ?? '75', 10),
    ftClientId:            map['ft_client_id']            ?? '',
    ftClientSecret:        map['ft_client_secret']        ?? '',
    ftAccessToken:         map['ft_access_token']         ?? '',
    ftTokenExpiresAt:      map['ft_token_expires_at']     ?? '',
    blacklistedCompanies: parseJson<string[]>(map['blacklisted_companies'], []),
  };
}

async function saveSettingsToDb(settings: JobWatchSettings): Promise<void> {
  const db = await getDb();
  const entries: Array<[string, string]> = [
    ['fetch_interval_hours',   String(settings.fetchIntervalHours)],
    ['email_digest_enabled',   settings.emailDigestEnabled ? '1' : '0'],
    ['email_digest_time',      settings.emailDigestTime],
    ['email_smtp_host',        settings.emailSmtpHost],
    ['email_smtp_port',        String(settings.emailSmtpPort)],
    ['email_smtp_user',        settings.emailSmtpUser],
    ['email_smtp_password',    settings.emailSmtpPassword],
    ['email_to',               settings.emailTo],
    ['search_intent',          JSON.stringify(settings.searchIntent)],
    ['navitia_api_key',        settings.navitiaApiKey],
    ['commute_origin_address', settings.commuteOriginAddress],
    ['commute_departure_time', settings.commuteDepartureTime],
    ['commute_max_minutes',    String(settings.commuteMaxMinutes)],
    ['ft_client_id',           settings.ftClientId],
    ['ft_client_secret',       settings.ftClientSecret],
    ['ft_access_token',        settings.ftAccessToken],
    ['ft_token_expires_at',    settings.ftTokenExpiresAt],
    ['blacklisted_companies',  JSON.stringify(settings.blacklistedCompanies)],
  ];
  for (const [key, value] of entries) {
    await db.execute(
      `INSERT INTO job_watch_settings (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = ?2`,
      [key, value]
    );
  }
}

// ── Store interface ──────────────────────────────────────────────────────────

interface JobWatchState {
  offers: JobOffer[];
  configs: JobWatchConfig[];
  settings: JobWatchSettings;
  filters: JobWatchFilters;
  isLoading: boolean;
  isFetching: boolean;
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
  /**
   * Record a user feedback action on an offer.
   * @param timeToAction - seconds the user took to act (measured from card display).
   *   If omitted the store falls back to time-since-fetch.
   */
  submitFeedback: (offerId: string, action: string, timeToAction?: number) => Promise<void>;
  batchArchive: (ids: string[]) => Promise<void>;
  batchMarkRead: (ids: string[]) => Promise<void>;

  // Configs
  fetchConfigs: () => Promise<void>;
  upsertConfig: (config: Omit<JobWatchConfig, 'id' | 'createdAt' | 'lastFetchedAt'> & { id?: string }) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  updateLastFetchedAt: (configId: string) => Promise<void>;

  // Settings
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: JobWatchSettings) => Promise<void>;

  // UI state
  setFilters: (filters: Partial<JobWatchFilters>) => void;
  setFetching: (v: boolean) => void;
  setError: (msg: string | null) => void;

  // Computed
  filteredOffers: () => JobOffer[];
  unreadCount: () => number;
}

// ── Store implementation ─────────────────────────────────────────────────────

export const useJobWatchStore = create<JobWatchState>((set, get) => ({
  offers: [],
  configs: [],
  settings: DEFAULT_JOB_WATCH_SETTINGS,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  isFetching: false,
  error: null,
  lastFetchedAt: null,

  initialize: async () => {
    await Promise.all([
      get().fetchOffers(),
      get().fetchConfigs(),
      get().fetchSettings(),
    ]);
  },

  // ── Offers ────────────────────────────────────────────────────────────────

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
      set({ offers });
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
        offer.source,
        offer.url,
        offer.hash,
        offer.title,
        offer.company ?? null,
        offer.location ?? null,
        offer.locationLat ?? null,
        offer.locationLon ?? null,
        offer.contractType ?? null,
        offer.descriptionSnippet ?? null,
        offer.publishedAt ?? null,
        offer.score,
        offer.commuteMinutes ?? null,
        offer.commuteStatus,
        offer.salaryMin ?? null,
        offer.salaryMax ?? null,
        offer.salaryRaw ?? null,
        offer.isRead,
        offer.isArchived,
        offer.kanbanId ?? null,
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
    await db.execute(
      `UPDATE job_offers SET kanban_id = ?1 WHERE id = ?2`,
      [kanbanId, offerId]
    );
    set(state => ({
      offers: state.offers.map(o => o.id === offerId ? { ...o, kanbanId } : o),
    }));
  },

  deleteArchivedOffers: async () => {
    const db = await getDb();
    await db.execute(`DELETE FROM job_offers WHERE is_archived = 1`);
    set(state => ({ offers: state.offers.filter(o => o.isArchived === 0) }));
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
    // Use caller-supplied timeToAction when available (measured from card display);
    // otherwise fall back to time-since-fetch as a coarse approximation.
    const resolvedTimeToAction = timeToAction !== undefined
      ? timeToAction
      : offer
        ? Math.floor((Date.now() - new Date(offer.fetchedAt).getTime()) / 1000)
        : null;

    // 1. Persist the feedback row
    await db.execute(
      `INSERT INTO job_offer_feedback (offer_id, action, time_to_action) VALUES (?1, ?2, ?3)`,
      [offerId, action, resolvedTimeToAction]
    );

    // 2. Side-effects on the offer state
    if (action === 'thumbs_down' || action === 'quick_archive') {
      await get().markArchived(offerId, true);
    } else if (action === 'thumbs_up') {
      await get().markRead(offerId);
    }

    // 3. Update learned dictionary & company reputation in the background (fire & forget)
    if (offer?.title) {
      (async () => {
        try {
          const rows = await db.select<{ key: string; value: string }[]>(
            `SELECT key, value FROM job_watch_settings WHERE key IN ('learned_dict_positive', 'learned_dict_negative', 'company_reputation')`
          );
          const map: Record<string, string> = {};
          for (const r of rows) map[r.key] = r.value;

          // Update learned dictionary
          const currentDict: LearnedDictionary = {
            positive: map['learned_dict_positive'] ? JSON.parse(map['learned_dict_positive']) : {},
            negative: map['learned_dict_negative'] ? JSON.parse(map['learned_dict_negative']) : {},
          };
          const updated = processFeedback(offer.title, action, currentDict);
          await db.execute(
            `INSERT INTO job_watch_settings (key, value) VALUES ('learned_dict_positive', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1`,
            [JSON.stringify(updated.positive)]
          );
          await db.execute(
            `INSERT INTO job_watch_settings (key, value) VALUES ('learned_dict_negative', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1`,
            [JSON.stringify(updated.negative)]
          );

          // Update company reputation
          const currentRep: Record<string, number> = map['company_reputation'] ? JSON.parse(map['company_reputation']) : {};
          const updatedRep = processCompanyReputation(offer.company, action, currentRep);
          await db.execute(
            `INSERT INTO job_watch_settings (key, value) VALUES ('company_reputation', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1`,
            [JSON.stringify(updatedRep)]
          );
        } catch { /* silent — learning updates are non-critical */ }
      })();
    }
  },

  // ── Configs ───────────────────────────────────────────────────────────────

  fetchConfigs: async () => {
    const db = await getDb();
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const raw = profileId
      ? await db.select<Record<string, unknown>[]>(
          `SELECT * FROM job_watch_config WHERE profile_id = ?1 ORDER BY source`,
          [profileId],
        )
      : await db.select<Record<string, unknown>[]>(
          `SELECT * FROM job_watch_config WHERE profile_id IS NULL ORDER BY source`,
        );
    const configs = raw.map(r => {
      const c = keysToCamelCase<Record<string, unknown>>(r) as Record<string, unknown>;
      return {
        ...c,
        keywords:        typeof c['keywords']        === 'string' ? JSON.parse(c['keywords']        as string) : (c['keywords']        ?? []),
        excludeKeywords: typeof c['excludeKeywords']  === 'string' ? JSON.parse(c['excludeKeywords']  as string) : (c['excludeKeywords']  ?? []),
        contractTypes:   typeof c['contractTypes']    === 'string' ? JSON.parse(c['contractTypes']    as string) : (c['contractTypes']    ?? []),
      } as JobWatchConfig;
    });
    set({ configs });
  },

  upsertConfig: async (config) => {
    const db = await getDb();
    const { useAuthStore } = await import('@/stores/authStore');
    const profileId = useAuthStore.getState().currentUserId;
    const snake = keysToSnakeCase<Record<string, unknown>>({
      ...config,
      keywords:        JSON.stringify(config.keywords),
      excludeKeywords: JSON.stringify(config.excludeKeywords),
      contractTypes:   JSON.stringify(config.contractTypes),
    });

    if (config.id) {
      await db.execute(
        `UPDATE job_watch_config SET
          source=?1, keywords=?2, exclude_keywords=?3, location=?4, radius_km=?5,
          contract_types=?6, rss_url=?7, ft_dept_code=?8, enabled=?9
         WHERE id=?10 AND (profile_id = ?11 OR (profile_id IS NULL AND ?11 IS NULL))`,
        [
          snake['source'], snake['keywords'], snake['exclude_keywords'] ?? '[]',
          snake['location'] ?? null, snake['radius_km'], snake['contract_types'],
          snake['rss_url'] ?? null, snake['ft_dept_code'] ?? null, snake['enabled'],
          config.id, profileId,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO job_watch_config
          (source, keywords, exclude_keywords, location, radius_km, contract_types, rss_url, ft_dept_code, enabled, profile_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
        [
          snake['source'], snake['keywords'], snake['exclude_keywords'] ?? '[]',
          snake['location'] ?? null, snake['radius_km'], snake['contract_types'],
          snake['rss_url'] ?? null, snake['ft_dept_code'] ?? null, snake['enabled'],
          profileId,
        ]
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

  // ── Settings ──────────────────────────────────────────────────────────────

  fetchSettings: async () => {
    try {
      const settings = await loadSettingsFromDb();
      set({ settings });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erreur chargement paramètres' });
    }
  },

  saveSettings: async (settings) => {
    await saveSettingsToDb(settings);
    set({ settings });
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setFilters: (filters) => {
    set(state => ({ filters: { ...state.filters, ...filters } }));
  },

  setFetching: (v) => set({ isFetching: v }),

  setError: (msg) => set({ error: msg }),

  // ── Computed ──────────────────────────────────────────────────────────────

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

      if (settings.blacklistedCompanies.length > 0 && o.company) {
        const companyLower = o.company.toLowerCase();
        if (settings.blacklistedCompanies.some(b => b.toLowerCase() === companyLower)) return false;
      }

      if (filters.maxAgeDays !== null && o.publishedAt) {
        const ageMs = Date.now() - new Date(o.publishedAt).getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (ageDays > filters.maxAgeDays) return false;
      }

      if (filters.contractTypes && filters.contractTypes.length > 0) {
        const textToSearch = `${o.contractType || ''} ${o.title || ''}`.toLowerCase();
        const hasMatch = filters.contractTypes.some(type => {
          const t = type.toLowerCase();
          if (t === 'cdi') return textToSearch.includes('cdi');
          if (t === 'cdd') return textToSearch.includes('cdd');
          if (t === 'freelance') return textToSearch.includes('freelance') || textToSearch.includes('indépendant') || textToSearch.includes('contractor');
          if (t === 'stage/alternance') return textToSearch.includes('stage') || textToSearch.includes('alternance') || textToSearch.includes('apprentissage') || textToSearch.includes('internship') || textToSearch.includes('professionnalisation');
          return false;
        });
        if (!hasMatch) return false;
      }

      return true;
    });

    // Apply sorting
    const sortBy = filters.sortBy ?? 'score_desc';
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':
          return b.score - a.score;
        case 'date_newest':
          return (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? '');
        case 'date_oldest':
          return (a.fetchedAt ?? '').localeCompare(b.fetchedAt ?? '');
        case 'commute_asc':
          return (a.commuteMinutes ?? 9999) - (b.commuteMinutes ?? 9999);
        case 'salary_desc':
          return (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0);
        default:
          return 0;
      }
    });

    return filtered;
  },

  unreadCount: () => get().offers.filter(o => o.isRead === 0 && o.isArchived === 0).length,
}));
