import { useState, useMemo, useRef } from 'react';
import { ExternalLink, Clock, Star, Archive, BookmarkCheck, Train, MapPin, Euro, ThumbsUp, ThumbsDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useNavigate } from 'react-router-dom';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import type { JobOffer, JobSource } from '@/types/job-watch';
import { computeLightProfileMatch } from '@/lib/watcher/scorer';
import { generateFullCVMatchPrompt } from '@/lib/prompt-templates';

const SOURCE_LABELS: Record<JobSource, string> = {
  apec:          'APEC',
  wttj:          'WTTJ',
  linkedin_rss:  'LinkedIn',
  france_travail:'France Travail',
};

const SOURCE_COLORS: Record<JobSource, string> = {
  apec:          'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  wttj:          'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  linkedin_rss:  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  france_travail:'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
    score >= 40 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      <Star className="w-3 h-3" />
      {score}
    </span>
  );
}

interface CommuteBadgeProps {
  minutes: number | null;
  status: JobOffer['commuteStatus'];
  maxMinutes: number | null;
}

function CommuteBadge({ minutes, status, maxMinutes }: CommuteBadgeProps) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800">
        <Train className="w-3 h-3" /> En attente
      </span>
    );
  }
  if (status === 'not_found') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800">
        <MapPin className="w-3 h-3" /> Non précisé
      </span>
    );
  }
  if (status === 'error' || minutes === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800">
        <Train className="w-3 h-3" /> Non calculé
      </span>
    );
  }

  const isOver = maxMinutes !== null && minutes > maxMinutes;
  const color  = isOver
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      <Train className="w-3 h-3" />
      {minutes} min
    </span>
  );
}

function SalaryBadge({ salaryMin, salaryMax, salaryRaw }: Pick<JobOffer, 'salaryMin' | 'salaryMax' | 'salaryRaw'>) {
  if (!salaryMin && !salaryRaw) return null;

  let label: string;
  if (salaryMin && salaryMax && salaryMin !== salaryMax) {
    const fmt = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`;
    label = `${fmt(salaryMin)} – ${fmt(salaryMax)}`;
  } else if (salaryMin) {
    label = salaryMin >= 1000 ? `${Math.round(salaryMin / 1000)}k€` : `${salaryMin}€`;
  } else {
    label = salaryRaw!.slice(0, 30);
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
      <Euro className="w-3 h-3" />
      {label}
    </span>
  );
}

/**
 * Badge showing how many of the user's skills appear in the offer text.
 * Label kept neutral — "Compétences" — to avoid confusion with the scoring
 * engine's `score` field shown in `ScoreBadge`.
 */
function SkillMatchBadge({ match }: { match: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
      title="Pourcentage de vos compétences présentes dans l'offre"
    >
      Compétences : {match}%
    </span>
  );
}

interface JobOfferCardProps {
  offer: JobOffer;
  commuteMaxMinutes: number | null;
  onImportKanban: (offer: JobOffer) => void;
  profileSkills?: string[];
}

export function JobOfferCard({ offer, commuteMaxMinutes, onImportKanban, profileSkills = [] }: JobOfferCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { markRead, markArchived, submitFeedback } = useJobWatchStore();
  const { profile, entries } = useProfileStore();
  const navigate = useNavigate();

  const displayedAt = useRef<number>(Date.now());
  const getTimeToAction = () => Math.floor((Date.now() - displayedAt.current) / 1000);

  const handleOpen = async () => {
    if (offer.isRead === 0) await markRead(offer.id);
    await openUrl(offer.url);
  };

  const handleMarkRead = async () => {
    await markRead(offer.id);
    toast.success('Marquée comme lue');
  };

  const handleArchive = async () => {
    await markArchived(offer.id, true);
    toast.success('Offre archivée');
  };

  const handleThumbsUp = async () => {
    await submitFeedback(offer.id, 'thumbs_up', getTimeToAction());
    toast.success('Offre appréciée');
  };

  const handleThumbsDown = async () => {
    await submitFeedback(offer.id, 'thumbs_down', getTimeToAction());
    toast.success('Offre ignorée');
  };

  const handleImportKanban = async () => {
    await submitFeedback(offer.id, 'kanban_import', getTimeToAction());
    onImportKanban(offer);
  };

  const handleQuickArchive = () => {
    submitFeedback(offer.id, 'quick_archive', getTimeToAction());
    toast.info('Offre archivée');
  };

  const handleCreateTargetedCV = async () => {
    if (!profile) {
      toast.error('Profil non chargé');
      return;
    }
    const offerText = `${offer.title}\n${offer.company ?? ''}\n${offer.location ?? ''}\n${offer.descriptionSnippet ?? ''}`;
    const prompt = generateFullCVMatchPrompt(profile, entries, offerText);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Prompt copié ! Collez-le dans votre IA puis importez le résultat dans le CV builder.');
      navigate('/cv');
    } catch {
      toast.error('Erreur lors de la copie du prompt');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleThumbsUp();
    } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleQuickArchive();
    } else if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      handleImportKanban();
    }
  };

  const isUnread   = offer.isRead === 0;
  const isArchived = offer.isArchived === 1;
  const hasKanban  = offer.kanbanId !== null;
  const isPepite   =
    offer.score >= 85 &&
    isUnread &&
    (offer.commuteMinutes === null ||
     commuteMaxMinutes === null ||
     offer.commuteMinutes <= commuteMaxMinutes);

  const skillMatch = useMemo(
    () => computeLightProfileMatch(`${offer.title} ${offer.descriptionSnippet ?? ''}`, profileSkills),
    [offer.title, offer.descriptionSnippet, profileSkills],
  );

  const fetchedDate = new Date(offer.fetchedAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        isPepite
          ? 'border-2 border-yellow-400 dark:border-yellow-500 shadow-lg shadow-yellow-100 dark:shadow-yellow-900/30 bg-gradient-to-b from-yellow-50/60 to-white dark:from-yellow-900/10 dark:to-gray-800'
          : isUnread
            ? 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 shadow-sm'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm'
      } ${isArchived ? 'opacity-60' : ''}`}
    >
      {/* Pépite banner */}
      {isPepite && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-400/20 dark:bg-yellow-500/10 border-b border-yellow-300 dark:border-yellow-600/40 rounded-t-lg">
          <span className="text-sm">🌟</span>
          <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 tracking-wide">
            Offre Pépite
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isUnread && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="Non lue" />
              )}
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                {offer.title}
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {[offer.company, offer.location].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Date + inline feedback */}
          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            {!isArchived && (
              <>
                <button
                  onClick={handleThumbsUp}
                  title="J'aime cette offre (→)"
                  className="p-1 rounded text-gray-300 hover:text-green-500 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleThumbsDown}
                  title="Pas intéressé (← ou A)"
                  className="p-1 rounded text-gray-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <span className="text-xs text-gray-400 ml-1">{fetchedDate}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[offer.source as JobSource]}`}>
            {SOURCE_LABELS[offer.source as JobSource] ?? offer.source}
          </span>
          <ScoreBadge score={offer.score} />
          <CommuteBadge
            minutes={offer.commuteMinutes}
            status={offer.commuteStatus}
            maxMinutes={commuteMaxMinutes}
          />
          <SalaryBadge
            salaryMin={offer.salaryMin}
            salaryMax={offer.salaryMax}
            salaryRaw={offer.salaryRaw}
          />
          {offer.contractType && (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {offer.contractType}
            </span>
          )}
          {hasKanban && (
            <span className="px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              Dans le Kanban
            </span>
          )}
          {profileSkills.length > 0 && skillMatch > 0 && (
            <SkillMatchBadge match={skillMatch} />
          )}
        </div>

        {/* Description snippet */}
        {offer.descriptionSnippet && (
          <div className="mt-2">
            <p className={`text-xs text-gray-500 dark:text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {offer.descriptionSnippet}
            </p>
            {offer.descriptionSnippet.length > 120 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-xs text-blue-500 hover:text-blue-700 mt-0.5"
              >
                {expanded ? 'Réduire' : 'Voir plus'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {/* Primary */}
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ouvrir
        </button>

        {/* Secondary */}
        {!hasKanban && (
          <button
            onClick={handleImportKanban}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Kanban
          </button>
        )}

        {isPepite && profile && (
          <button
            onClick={handleCreateTargetedCV}
            title="Générer un prompt pour créer un CV ciblé sur cette offre"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            CV ciblé
          </button>
        )}

        {/* Tertiary — icon-only, right-aligned */}
        <div className="ml-auto flex items-center gap-1">
          {isUnread && (
            <button
              onClick={handleMarkRead}
              title="Marquer comme lue"
              className="p-1.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
            </button>
          )}
          {!isArchived && (
            <button
              onClick={handleArchive}
              title="Archiver"
              className="p-1.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
