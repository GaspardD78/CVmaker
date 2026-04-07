export type JobSource = 'apec' | 'wttj' | 'linkedin_rss' | 'france_travail';

/**
 * Structured search intent replacing flat positiveKeywords / negativeKeywords.
 *
 * Scoring layers:
 *   role.primary      → +15/match, capped +30   (strong role signal)
 *   domain.required   → +10/match, capped +20   (mandatory domain match)
 *   domain.preferred  → +5/match,  capped +10   (nice-to-have signal)
 *
 * Disqualifiers (score = 0):
 *   role.mustExclude + domain.excluded
 */
export interface SearchIntent {
  role: {
    primary:     string[];   // target role keywords
    mustExclude: string[];   // role keywords that disqualify the offer
  };
  domain: {
    required:  string[];    // must-have domain / tech terms
    preferred: string[];    // preferred domain / tech terms
    excluded:  string[];    // domain / tech terms to disqualify
  };
  salary: {
    target:      number | null;  // target annual salary (€)
    hideIfBelow: number | null;  // penalise offers whose salary is below this
  };
}

export const DEFAULT_SEARCH_INTENT: SearchIntent = {
  role:   { primary: [], mustExclude: [] },
  domain: { required: [], preferred: [], excluded: [] },
  salary: { target: null, hideIfBelow: null },
};

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
  /** Structured scoring intent — replaces the old flat positiveKeywords / negativeKeywords. */
  searchIntent: SearchIntent;
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
  searchIntent: DEFAULT_SEARCH_INTENT,
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

export type SortOption = 'score_desc' | 'date_newest' | 'date_oldest' | 'commute_asc' | 'salary_desc';

export interface JobWatchFilters {
  sources: JobSource[];
  minScore: number;
  maxCommuteMinutes: number | null; // null = illimité
  status: 'all' | 'unread' | 'archived';
  dateFrom: string | null;
  dateTo: string | null;
  contractTypes?: string[];
  maxAgeDays: number | null;
  sortBy: SortOption;
}

export const DEFAULT_FILTERS: JobWatchFilters = {
  sources: ['apec', 'wttj', 'linkedin_rss', 'france_travail'],
  minScore: 0,
  maxCommuteMinutes: null,
  status: 'all',
  dateFrom: null,
  dateTo: null,
  contractTypes: [],
  maxAgeDays: null,
  sortBy: 'score_desc',
};

export interface FilterPreset {
  name: string;
  filters: JobWatchFilters;
}

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
