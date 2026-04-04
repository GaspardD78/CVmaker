import { useCallback, useState } from 'react';
import { RefreshCw, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useApplicationStore } from '@/stores/applicationStore';
import { useAuthStore } from '@/stores/authStore';
import { useJobWatcher } from '@/hooks/useJobWatcher';
import { JobOfferCard } from './JobOfferCard';
import type { JobOffer, JobSource } from '@/types/job-watch';

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
  } = useJobWatchStore();

  const { createApplication } = useApplicationStore();
  const { currentUserId } = useAuthStore();
  const { triggerFetch, isFetching } = useJobWatcher();

  const offers = filteredOffers();

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

  const toggleContract = (type: string) => {
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

        {/* Type de contrat */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Contrats</p>
          <div className="flex flex-wrap gap-2">
            {['CDI', 'CDD', 'Freelance', 'Stage/Alternance'].map(ct => (
              <button
                key={ct}
                onClick={() => toggleContract(ct)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  (filters.contractTypes || []).includes(ct)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {ct}
              </button>
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
      </div>

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
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">Aucune offre correspondant aux filtres</p>
          <p className="text-xs mt-1">Cliquez sur « Actualiser » pour lancer une collecte</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {offers.map(offer => (
            <JobOfferCard
              key={offer.id}
              offer={offer}
              commuteMaxMinutes={settings.commuteMaxMinutes}
              onImportKanban={handleImportKanban}
            />
          ))}
        </div>
      )}
    </div>
  );
}
