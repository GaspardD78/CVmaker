export type JobSource = 'apec' | 'indeed' | 'hellowork' | 'wttj' | 'linkedin_rss' | 'france_travail';

export type CommuteStatus = 'pending' | 'ok' | 'error' | 'not_found';

export interface JobOffer {
  id: string;
  source: JobSource;
  url: string;
  hash: string;
  title: string;
  company: string | null;
  location: string | null;
  locationLat: number | null;
  locationLon: number | null;
  contractType: string | null;
  descriptionSnippet: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  score: number;
  commuteMinutes: number | null;
  commuteStatus: CommuteStatus;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryRaw: string | null;
  isRead: number;       // 0 | 1
  isArchived: number;   // 0 | 1
  archivedAt: string | null;
  kanbanId: string | null;
}

export interface JobOfferFeedback {
  id: string;
  offerId: string;
  action: 'kanban_import' | 'thumbs_up' | 'thumbs_down' | 'quick_archive';
  timeToAction: number | null;
  createdAt: string;
}

export interface JobWatchConfig {
  id: string;
  source: JobSource;
  keywords: string[];           // JSON array
  excludeKeywords: string[];    // JSON array — mots à exclure de la recherche
  location: string | null;
  radiusKm: number;
  contractTypes: string[];      // JSON array
  rssUrl: string | null;
  ftDeptCode: string | null;
  enabled: number;              // 0 | 1
  lastFetchedAt: string | null;
  createdAt: string;
}

export interface JobWatchSettings {
  fetchIntervalHours: number;
  emailDigestEnabled: boolean;
  emailDigestTime: string;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpUser: string;
  emailSmtpPassword: string;
  emailTo: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
  navitiaApiKey: string;
  commuteOriginAddress: string;
  commuteDepartureTime: string;
  commuteMaxMinutes: number;
  ftClientId: string;
  ftClientSecret: string;
  ftAccessToken: string;
  ftTokenExpiresAt: string;
  blacklistedCompanies: string[];
}

export const DEFAULT_JOB_WATCH_SETTINGS: JobWatchSettings = {
  fetchIntervalHours: 4,
  emailDigestEnabled: true,
  emailDigestTime: '08:00',
  emailSmtpHost: '',
  emailSmtpPort: 587,
  emailSmtpUser: '',
  emailSmtpPassword: '',
  emailTo: '',
  positiveKeywords: [],
  negativeKeywords: [],
  navitiaApiKey: '',
  commuteOriginAddress: '',
  commuteDepartureTime: '09:00',
  commuteMaxMinutes: 75,
  ftClientId: '',
  ftClientSecret: '',
  ftAccessToken: '',
  ftTokenExpiresAt: '',
  blacklistedCompanies: [],
};

export interface JobWatchFilters {
  sources: JobSource[];
  minScore: number;
  maxCommuteMinutes: number | null; // null = illimité
  status: 'all' | 'unread' | 'archived';
  dateFrom: string | null;
  dateTo: string | null;
  contractTypes?: string[];
  maxAgeDays: number | null;
}

export const DEFAULT_FILTERS: JobWatchFilters = {
  sources: ['apec', 'indeed', 'hellowork', 'wttj', 'linkedin_rss', 'france_travail'],
  minScore: 0,
  maxCommuteMinutes: null,
  status: 'all',
  dateFrom: null,
  dateTo: null,
  contractTypes: [],
  maxAgeDays: null,
};

/** Raw offer coming out of a parser, before dedup/scoring/commute enrichment */
export interface RawJobOffer {
  source: JobSource;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  locationLat?: number | null;
  locationLon?: number | null;
  contractType: string | null;
  descriptionSnippet: string | null;
  publishedAt: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryRaw?: string | null;
}
