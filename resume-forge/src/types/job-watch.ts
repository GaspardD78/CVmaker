export type JobSource =
  | 'apec'
  | 'wttj'
  | 'linkedin_rss'       // legacy — kept for existing configs, superseded by 'linkedin'
  | 'linkedin'           // WebView scraping with user session (Phase 2)
  | 'indeed'             // WebView scraping (Phase 2)
  | 'hellowork'          // WebView scraping (Phase 2)
  | 'jobicy'
  | 'france_travail'
  | 'emploi_territorial'
  | 'mantiks';           // @deprecated — paid API, low usage

// ── Extraction metadata ──────────────────────────────────────────────────────

/**
 * Confidence metadata attached to each raw offer by the parser.
 * Used by the scorer to weight field matches appropriately:
 * - high  = data came from a structured API field or JSON-LD (reliable)
 * - medium = data parsed from HTML with reasonable heuristics
 * - low   = data guessed via regex fallback (unreliable)
 * - none  = field absent / could not be extracted
 */
export interface ExtractionMetadata {
  titleSource: 'api' | 'json_ld' | 'html_primary' | 'html_fallback' | 'regex';
  titleConfidence: 'high' | 'medium' | 'low';
  locationSource: 'api_coords' | 'api_text' | 'json_ld' | 'html' | 'regex' | 'none';
  locationConfidence: 'high' | 'medium' | 'low' | 'none';
  contractSource: 'api' | 'json_ld' | 'html' | 'regex' | 'none';
  contractConfidence: 'high' | 'medium' | 'low' | 'none';
}

export const DEFAULT_EXTRACTION: ExtractionMetadata = {
  titleSource:        'html_primary',
  titleConfidence:    'medium',
  locationSource:     'none',
  locationConfidence: 'none',
  contractSource:     'none',
  contractConfidence: 'none',
};

// ── Search Profile ───────────────────────────────────────────────────────────

/**
 * SearchProfile is the single source of truth for:
 *   1. What is sent to each source's search API (query params)
 *   2. How offers are scored (field-aware matching)
 *
 * It replaces the old dual-config approach where:
 *   - job_watch_config.keywords → API query
 *   - job_watch_settings.search_intent → scoring
 * These two were often misconfigured independently, causing false positives.
 */
export interface SearchProfile {
  /** Human-readable label shown in the UI */
  name: string;

  // ── What I'm looking for ─────────────────────────────────────────────────
  /** Target job titles / role keywords. Used in API queries AND scored heavily if found in offer title. */
  jobTitles: string[];       // e.g. ["Recruteur", "Talent Acquisition Manager", "RRH"]

  /** Technical skills / tools. Weighted but not disqualifying if absent. */
  skills: string[];          // e.g. ["ATS", "LinkedIn Recruiter", "sourcing"]

  /** Industry / sector signals. Soft bonus if present. */
  domains: string[];         // e.g. ["Tech", "SaaS", "FinTech", "Scale-up"]

  // ── What I don't want ────────────────────────────────────────────────────
  /** Title/role terms that immediately disqualify an offer (score → 0). */
  excludeTitles: string[];   // e.g. ["stagiaire", "alternant", "commercial", "bénévole"]

  /** Domain/sector terms that disqualify an offer (score → 0). */
  excludeDomains: string[];  // e.g. ["BTP", "Restauration", "VPC"]

  // ── Location ─────────────────────────────────────────────────────────────
  location: {
    /** Display label shown in UI (e.g. "Paris (75)") */
    label: string;
    /** City name used for WTTJ and fallback queries */
    city: string;
    /** INSEE code (5 digits) for France Travail API — required for that source */
    inseeCode: string;
    /** Department code(s) for APEC (e.g. ["75", "92", "93"]) */
    departmentCodes: string[];
    /** Search radius in km (used by FT + APEC) */
    radiusKm: number;
  };

  // ── Contract ─────────────────────────────────────────────────────────────
  /** Contract types to look for. Empty = all types. */
  contractTypes: string[];   // e.g. ["CDI"] or ["CDI", "Freelance"]

  // ── Salary ───────────────────────────────────────────────────────────────
  salary: {
    /** Absolute floor — offers below this are heavily penalised (-30 pts) */
    min: number | null;      // e.g. 35000
    /** Target — offers at or above target get a bonus */
    target: number | null;   // e.g. 45000
  };

  // ── Scoring behaviour ────────────────────────────────────────────────────
  scoring: {
    /**
     * Controls how strictly the scorer penalises missing / mismatched fields.
     *
     * strict   — jobTitle MUST appear in offer title; wrong contract = score 0
     * balanced — jobTitle preferred in title; wrong contract = -20 pts (not 0)
     * loose    — old behaviour: score starts at 50, pure keyword matching
     */
    mode: 'strict' | 'balanced' | 'loose';
  };

  // ── Company blacklist ─────────────────────────────────────────────────────
  /** Companies to always exclude from results (score → 0). */
  blacklistedCompanies: string[];

  // ── APEC-specific ─────────────────────────────────────────────────────────
  /**
   * Libellés de fonctions APEC sélectionnés (ex. ["Chargé de recrutement", "Développement RH"]).
   * Traduits en IDs entiers via `APEC_FONCTIONS` et poussés dans le paramètre
   * `fonctions` de l'API `rechercheOffre`. Filtre exact côté serveur — élimine
   * les offres hors-cible sans reposer sur `motsCles` (qui cherche dans
   * titre + description et génère du bruit).
   * Vide = aucun filtre fonctions envoyé à l'API.
   */
  apecFonctions: string[];

  /** Secteurs APEC sélectionnés */
  apecSecteurs?: string[];

  /** Options de télétravail APEC sélectionnées */
  apecTeletravail?: string[];

  /** Tranches de salaires APEC sélectionnées */
  apecSalaires?: string[];
}

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  name: 'Ma recherche',
  jobTitles: [],
  skills: [],
  domains: [],
  excludeTitles: [],
  excludeDomains: [],
  location: {
    label: '',
    city: '',
    inseeCode: '',
    departmentCodes: [],
    radiusKm: 30,
  },
  contractTypes: ['CDI'],
  salary: { min: null, target: null },
  scoring: { mode: 'balanced' },
  blacklistedCompanies: [],
  apecFonctions: [],
  apecSecteurs: [],
  apecTeletravail: [],
  apecSalaires: [],
};

// ── Legacy SearchIntent (kept for backward-compat migration only) ─────────────

/**
 * @deprecated Use SearchProfile instead.
 * Kept only for reading old data during migration in jobWatchStore.ts.
 */
export interface SearchIntent {
  role: {
    primary:     string[];
    mustExclude: string[];
  };
  domain: {
    required:  string[];
    preferred: string[];
    excluded:  string[];
  };
  salary: {
    target:      number | null;
    hideIfBelow: number | null;
  };
}

export const DEFAULT_SEARCH_INTENT: SearchIntent = {
  role:   { primary: [], mustExclude: [] },
  domain: { required: [], preferred: [], excluded: [] },
  salary: { target: null, hideIfBelow: null },
};

// ── Job offer types ───────────────────────────────────────────────────────────

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

/**
 * Per-source configuration — now much simpler.
 * Search parameters (keywords, location, contract) are derived from SearchProfile.
 * Only source-specific technical params stay here.
 */
export interface JobWatchConfig {
  id: string;
  source: JobSource;
  /** URL RSS for linkedin_rss (required) and optional override for apec/wttj */
  rssUrl: string | null;
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
  /** Unified search profile — single source of truth for query params AND scoring */
  searchProfile: SearchProfile;
  navitiaApiKey: string;
  commuteOriginAddress: string;
  commuteDepartureTime: string;
  commuteMaxMinutes: number;
  ftClientId: string;
  ftClientSecret: string;
  ftAccessToken: string;
  ftTokenExpiresAt: string;
  /**
   * @deprecated Brave Search API n'a plus de plan gratuit ; le X-ray LinkedIn
   * utilise désormais DuckDuckGo HTML (cf. `parsers/linkedin-xray.ts`), aucune
   * clé n'est requise. Le champ reste pour ne pas casser les configs SQL
   * existantes mais sa valeur est ignorée.
   */
  braveSearchApiKey: string;
  /** Score minimum en dessous duquel une offre n'est pas sauvegardée en DB (0-60, défaut 20) */
  minSaveScore: number;
}

export const DEFAULT_JOB_WATCH_SETTINGS: JobWatchSettings = {
  fetchIntervalHours: 4,
  emailDigestEnabled: false,
  emailDigestTime: '08:00',
  emailSmtpHost: '',
  emailSmtpPort: 587,
  emailSmtpUser: '',
  emailSmtpPassword: '',
  emailTo: '',
  searchProfile: DEFAULT_SEARCH_PROFILE,
  navitiaApiKey: '',
  commuteOriginAddress: '',
  commuteDepartureTime: '09:00',
  commuteMaxMinutes: 75,
  ftClientId: '',
  ftClientSecret: '',
  ftAccessToken: '',
  ftTokenExpiresAt: '',
  braveSearchApiKey: '',
  minSaveScore: 20,
};

// ── Fetch log ─────────────────────────────────────────────────────────────────

/** Log d'une collecte pour une source donnée, persisté dans job_watch_fetch_log */
export interface FetchLog {
  id: string;
  source: JobSource;
  fetchedAt: string;      // ISO 8601 UTC
  /** Offres renvoyées par la source (avant tout filtrage local) */
  offersFetched: number;
  /** Offres effectivement insérées en base */
  offersNew: number;
  /** Offres rejetées car déjà connues (hash) ou doublon cross-source */
  offersDuplicate: number;
  /** Offres rejetées par le filtre minSaveScore */
  offersFiltered: number;
  status: 'success' | 'error' | 'empty';
  errorMessage: string | null;
  durationMs: number;
}

export type SortOption = 'score_desc' | 'date_newest' | 'date_oldest' | 'commute_asc' | 'salary_desc';

export interface JobWatchFilters {
  sources: JobSource[];
  minScore: number;
  maxCommuteMinutes: number | null;
  status: 'all' | 'unread' | 'archived';
  dateFrom: string | null;
  dateTo: string | null;
  contractTypes?: string[];
  maxAgeDays: number | null;
  sortBy: SortOption;
}

export const DEFAULT_FILTERS: JobWatchFilters = {
  sources: ['apec', 'wttj', 'linkedin', 'linkedin_rss', 'indeed', 'hellowork', 'france_travail', 'emploi_territorial'],
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
  /** Extraction quality metadata — populated by parsers */
  extraction: ExtractionMetadata;
}
