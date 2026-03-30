import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import {
  JobOffer,
  JobWatchConfig,
  JobWatchSettings,
  JobWatchFilters,
  DEFAULT_JOB_WATCH_SETTINGS,
  DEFAULT_FILTERS,
  JobSource,
} from '@/types/job-watch';

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

  return {
    fetchIntervalHours:   parseInt(map['fetch_interval_hours']  ?? '4', 10),
    emailDigestEnabled:   (map['email_digest_enabled']  ?? '1') === '1',
    emailDigestTime:       map['email_digest_time']      ?? '08:00',
    emailSmtpHost:         map['email_smtp_host']        ?? '',
    emailSmtpPort:        parseInt(map['email_smtp_port'] ?? '587', 10),
    emailSmtpUser:         map['email_smtp_user']        ?? '',
    emailSmtpPassword:     map['email_smtp_password']    ?? '',
    emailTo:               map['email_to']               ?? '',
    positiveKeywords:     parseJson<string[]>(map['positive_keywords'], []),
    negativeKeywords:     parseJson<string[]>(map['negative_keywords'], []),
    navitiaApiKey:         map['navitia_api_key']         ?? '',
    commuteOriginAddress:  map['commute_origin_address']  ?? '',
    commuteDepartureTime:  map['commute_departure_time']  ?? '09:00',
    commuteMaxMinutes:    parseInt(map['commute_max_minutes'] ?? '75', 10),
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
    ['positive_keywords',      JSON.stringify(settings.positiveKeywords)],
    ['negative_keywords',      JSON.stringify(settings.negativeKeywords)],
    ['navitia_api_key',        settings.navitiaApiKey],
    ['commute_origin_address', settings.commuteOriginAddress],
    ['commute_departure_time', settings.commuteDepartureTime],
    ['commute_max_minutes',    String(settings.commuteMaxMinutes)],
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
  markRead: (id: number) => Promise<void>;
  markArchived: (id: number, archived: boolean) => Promise<void>;
  setKanbanId: (offerId: number, kanbanId: string) => Promise<void>;
  deleteArchivedOffers: () => Promise<void>;

  // Configs
  fetchConfigs: () => Promise<void>;
  upsertConfig: (config: Omit<JobWatchConfig, 'id' | 'createdAt' | 'lastFetchedAt'> & { id?: number }) => Promise<void>;
  deleteConfig: (id: number) => Promise<void>;
  updateLastFetchedAt: (configId: number) => Promise<void>;

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
      const raw = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM job_offers ORDER BY fetched_at DESC LIMIT 500`
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
        (source, url, hash, title, company, location, contract_type,
         description_snippet, published_at, score, commute_minutes, commute_status,
         is_read, is_archived, kanban_id)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`,
      [
        offer.source,
        offer.url,
        offer.hash,
        offer.title,
        offer.company ?? null,
        offer.location ?? null,
        offer.contractType ?? null,
        offer.descriptionSnippet ?? null,
        offer.publishedAt ?? null,
        offer.score,
        offer.commuteMinutes ?? null,
        offer.commuteStatus,
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
    await db.execute(
      `UPDATE job_offers SET is_archived = ?1 WHERE id = ?2`,
      [archived ? 1 : 0, id]
    );
    set(state => ({
      offers: state.offers.map(o => o.id === id ? { ...o, isArchived: archived ? 1 : 0 } : o),
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

  // ── Configs ───────────────────────────────────────────────────────────────

  fetchConfigs: async () => {
    const db = await getDb();
    const raw = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM job_watch_config ORDER BY source`
    );
    const configs = raw.map(r => {
      const c = keysToCamelCase<Record<string, unknown>>(r) as Record<string, unknown>;
      return {
        ...c,
        keywords:      typeof c['keywords']      === 'string' ? JSON.parse(c['keywords']      as string) : (c['keywords']      ?? []),
        contractTypes: typeof c['contractTypes']  === 'string' ? JSON.parse(c['contractTypes']  as string) : (c['contractTypes']  ?? []),
      } as JobWatchConfig;
    });
    set({ configs });
  },

  upsertConfig: async (config) => {
    const db = await getDb();
    const snake = keysToSnakeCase<Record<string, unknown>>({
      ...config,
      keywords:      JSON.stringify(config.keywords),
      contractTypes: JSON.stringify(config.contractTypes),
    });

    if (config.id) {
      await db.execute(
        `UPDATE job_watch_config SET
          source=?1, keywords=?2, location=?3, radius_km=?4,
          contract_types=?5, rss_url=?6, enabled=?7
         WHERE id=?8`,
        [
          snake['source'], snake['keywords'], snake['location'] ?? null,
          snake['radius_km'], snake['contract_types'], snake['rss_url'] ?? null,
          snake['enabled'], config.id,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO job_watch_config
          (source, keywords, location, radius_km, contract_types, rss_url, enabled)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`,
        [
          snake['source'], snake['keywords'], snake['location'] ?? null,
          snake['radius_km'], snake['contract_types'], snake['rss_url'] ?? null,
          snake['enabled'],
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
    const { offers, filters } = get();
    return offers.filter(o => {
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
      return true;
    });
  },

  unreadCount: () => get().offers.filter(o => o.isRead === 0 && o.isArchived === 0).length,
}));
