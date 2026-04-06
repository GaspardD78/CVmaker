import { useCallback, useMemo, useState } from 'react';
import { RefreshCw, Trash2, UserRound, ArrowUpDown, Archive, BookmarkCheck, CheckCircle, Settings, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useApplicationStore } from '@/stores/applicationStore';
import { useAuthStore } from '@/stores/authStore';
import { useJobWatcher } from '@/hooks/useJobWatcher';
import { useProfileStore } from '@/stores/profileStore';
import { JobOfferCard } from './JobOfferCard';
import type { JobOffer, JobSource, SortOption } from '@/types/job-watch';

const ALL_SOURCES: JobSource[] = ['apec', 'indeed', 'hellowork', 'wttj', 'linkedin_rss', 'france_travail'];
const SOURCE_LABELS: Record<JobSource, string> = {
  apec: 'APEC', indeed: 'Indeed', hellowork: 'HelloWork', wttj: 'WTTJ', linkedin_rss: 'LinkedIn', france_travail: 'France Travail',
};

const COMMUTE_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Illimité',  value: null },
  { label: '≤ 30 min',  value: 30   },
  { label: '≤ 45 min',  value: 45   },
  { label: '≤ 60 min',  value: 60   },
  { label: '≤ 75 min',  value: 75   },
  { label: '≤ 90 min',  value: 90   },
];

const AGE_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Tous',     value: null },
  { label: '1 jour',   value: 1    },
  { label: '3 jours',  value: 3    },
  { label: '7 jours',  value: 7    },
  { label: '30 jours', value: 30   },
];

const SORT_OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: 'Score',         value: 'score_desc'   },
  { label: 'Plus récentes', value: 'date_newest'  },
  { label: 'Plus anciennes',value: 'date_oldest'  },
  { label: 'Trajet court',  value: 'commute_asc'  },
  { label: 'Salaire',       value: 'salary_desc'  },
];

export function JobOffersView() {
  const {
    filteredOffers,
    filters,
    setFilters,
    isLoading,
    error,
    unreadCount,
    deleteArchivedOffers,
    setKanbanId,
    settings,
    configs,
    batchArchive,
    batchMarkRead,
  } = useJobWatchStore();

  const { createApplication } = useApplicationStore();
  const { currentUserId } = useAuthStore();
  const { triggerFetch, isFetching } = useJobWatcher();

  const { profile, entries } = useProfileStore();
  const profileSkills = useMemo(
    () => entries.filter(e => e.entryType === 'skill').map(e => e.title),
    [entries],
  );

  const offers = filteredOffers();
  const hasEnabledConfigs = configs.some(c => c.enabled === 1);
  const isFirstTime = configs.length === 0;

  const [savedFilters, setSavedFilters] = useState<{ minScore: number; status: typeof filters.status } | null>(null);
  const isTopMatchActive = savedFilters !== null;

  // ── Filters ────────────────────────────────────────────────────────────────

  const toggleTopMatch = () => {
    if (isTopMatchActive) {
      setFilters(savedFilters);
      setSavedFilters(null);
    } else {
      setSavedFilters({ minScore: filters.minScore, status: filters.status });
      setFilters({ minScore: 60 });
    }
  };

  const toggleSource = (source: JobSource) => {
    const current = filters.sources;
    const next = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    setFilters({ sources: next.length > 0 ? next : current });
  };

  const toggleContractType = (type: string) => {
    const current = filters.contractTypes || [];
    const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
    setFilters({ contractTypes: next });
  };

  // ── Import Kanban ──────────────────────────────────────────────────────────

  const handleImportKanban = useCallback(async (offer: JobOffer) => {
    if (!currentUserId) {
      toast.error('Profil non chargé');
      return;
    }
    try {
      await createApplication({
        profileId:   currentUserId,
        cvId:        null as unknown as string,
        companyName: offer.company  ?? 'Entreprise inconnue',
        jobTitle:    offer.title,
        jobUrl:      offer.url,
        source:      'job_board',
        sourceDetail: offer.source,
        status:      'draft',
        priority:    2,
        location:    offer.location ?? undefined,
        notes:       offer.descriptionSnippet ?? undefined,
        salaryMin:   offer.salaryMin ?? undefined,
        salaryMax:   offer.salaryMax ?? undefined,
      } as Parameters<typeof createApplication>[0]);

      // Retrieve the newly created application id
      const { useApplicationStore: appStore } = await import('@/stores/applicationStore');
      const apps = appStore.getState().applications;
      const newApp = apps.find(a => a.jobUrl === offer.url && a.companyName === (offer.company ?? 'Entreprise inconnue'));
      if (newApp) {
        await setKanbanId(offer.id, newApp.id);
      }

      toast.success('Offre importée dans le Kanban');
    } catch (err) {
      toast.error(`Erreur import : ${err instanceof Error ? err.message : 'inconnue'}`);
    }
  }, [currentUserId, createApplication, setKanbanId]);

  const handleDeleteArchived = async () => {
    await deleteArchivedOffers();
    toast.success('Offres archivées supprimées');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const navitiaEnabled = Boolean(settings.navitiaApiKey);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Offres
            {unreadCount() > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-blue-500 text-white">
                {unreadCount() > 99 ? '99+' : unreadCount()}
              </span>
            )}
          </h2>
          <span className="text-sm text-gray-400">({offers.length} affichée{offers.length > 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDeleteArchived}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Vider les archivées
          </button>
          <button
            onClick={() => triggerFetch(false)}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Collecte…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap gap-4">
        {/* Source checkboxes */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Sources</p>
          <div className="flex flex-wrap gap-2">
            {ALL_SOURCES.map(source => (
              <label key={source} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.sources.includes(source)}
                  onChange={() => toggleSource(source)}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">{SOURCE_LABELS[source]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Score min slider */}
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Score min : <span className="text-gray-800 dark:text-gray-100 font-semibold">{filters.minScore}</span>
            </p>
            <button
              onClick={toggleTopMatch}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                isTopMatchActive
                  ? 'bg-purple-600 text-white shadow-inner'
                  : 'border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300 dark:bg-purple-900/30'
              }`}
            >
              <UserRound className="w-3 h-3" />
              {isTopMatchActive ? 'Top Match (Actif)' : 'Top Match'}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            onChange={e => {
              if (isTopMatchActive) setSavedFilters(null);
              setFilters({ minScore: Number(e.target.value) });
            }}
            className="w-32 accent-blue-600"
          />
        </div>

        {/* Commute max */}
        {navitiaEnabled && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Trajet max</p>
            <div className="flex flex-wrap gap-1.5">
              {COMMUTE_OPTIONS.map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setFilters({ maxCommuteMinutes: opt.value })}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    filters.maxCommuteMinutes === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Statut</p>
          <div className="flex gap-1.5 items-center">
            {(['all', 'unread', 'archived'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilters({ status: s })}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  filters.status === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s === 'all' ? 'Toutes' : s === 'unread' ? 'Non lues' : 'Archivées'}
              </button>
            ))}
          </div>
        </div>

        {/* Contrats */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Contrats</p>
          <div className="flex flex-wrap gap-1.5">
            {['CDI', 'CDD', 'Freelance', 'Stage/Alternance'].map(type => (
              <button
                key={type}
                onClick={() => toggleContractType(type)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  filters.contractTypes?.includes(type)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Ancienneté */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Ancienneté</p>
          <div className="flex flex-wrap gap-1.5">
            {AGE_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setFilters({ maxAgeDays: opt.value })}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  filters.maxAgeDays === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Tri</p>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters({ sortBy: opt.value })}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  (filters.sortBy ?? 'score_desc') === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Batch actions */}
      {offers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={async () => {
              const ids = offers.filter(o => o.isRead === 0).map(o => o.id);
              if (ids.length === 0) { toast.info('Toutes les offres sont déjà lues'); return; }
              await batchMarkRead(ids);
              toast.success(`${ids.length} offre(s) marquée(s) comme lue(s)`);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <BookmarkCheck className="w-3 h-3" />
            Tout marquer comme lu
          </button>
          <button
            onClick={async () => {
              const threshold = filters.minScore > 0 ? filters.minScore : 30;
              const ids = offers.filter(o => o.score < threshold && o.isArchived === 0).map(o => o.id);
              if (ids.length === 0) { toast.info('Aucune offre à archiver sous ce score'); return; }
              await batchArchive(ids);
              toast.success(`${ids.length} offre(s) archivée(s) (score < ${threshold})`);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Archive className="w-3 h-3" />
            Archiver les offres faibles
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Offers list */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Chargement…</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-10">
          {isFirstTime ? (
            /* First-time onboarding */
            <div className="max-w-sm mx-auto space-y-4">
              <Zap className="w-10 h-10 mx-auto text-blue-400" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Bienvenue dans la Veille Emploi
              </h3>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 text-xs">
                  {profile?.title ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <Link to="/profile" className="text-blue-500 hover:underline">
                    Remplir votre profil
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">
                    Configurer votre recherche (onglet Configuration)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">
                    Lancer votre première collecte
                  </span>
                </div>
              </div>
            </div>
          ) : !hasEnabledConfigs ? (
            <div className="text-gray-400">
              <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune source active</p>
              <p className="text-xs mt-1">Activez au moins une source dans l'onglet Configuration</p>
            </div>
          ) : (
            <div className="text-gray-400">
              <p className="text-sm">Aucune offre correspondant aux filtres</p>
              <p className="text-xs mt-1">Cliquez sur « Actualiser » pour lancer une collecte</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {offers.map(offer => (
            <JobOfferCard
              key={offer.id}
              offer={offer}
              commuteMaxMinutes={settings.commuteMaxMinutes}
              onImportKanban={handleImportKanban}
              profileSkills={profileSkills}
            />
          ))}
        </div>
      )}
    </div>
  );
}
