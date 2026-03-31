import { useState } from 'react';
import { ExternalLink, Clock, Star, Archive, BookmarkCheck, Train, MapPin, Euro } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import type { JobOffer, JobSource } from '@/types/job-watch';

const SOURCE_LABELS: Record<JobSource, string> = {
  apec:          'APEC',
  indeed:        'Indeed',
  hellowork:     'HelloWork',
  wttj:          'WTTJ',
  linkedin_rss:  'LinkedIn',
  france_travail:'France Travail',
};

const SOURCE_COLORS: Record<JobSource, string> = {
  apec:          'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  indeed:        'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  hellowork:     'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
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
        <MapPin className="w-3 h-3" /> Localisation non précisée
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

interface JobOfferCardProps {
  offer: JobOffer;
  commuteMaxMinutes: number | null;
  onImportKanban: (offer: JobOffer) => void;
}

export function JobOfferCard({ offer, commuteMaxMinutes, onImportKanban }: JobOfferCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { markRead, markArchived } = useJobWatchStore();

  const handleOpen = async () => {
    if (offer.isRead === 0) await markRead(offer.id);
    window.open(offer.url, '_blank', 'noopener,noreferrer');
  };

  const handleMarkRead = async () => {
    await markRead(offer.id);
    toast.success('Marquée comme lue');
  };

  const handleArchive = async () => {
    await markArchived(offer.id, true);
    toast.success('Offre archivée');
  };

  const handleImport = () => onImportKanban(offer);

  const isUnread    = offer.isRead === 0;
  const isArchived  = offer.isArchived === 1;
  const hasKanban   = offer.kanbanId !== null;

  const fetchedDate = new Date(offer.fetchedAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm transition-all ${
        isUnread
          ? 'border-blue-200 dark:border-blue-700'
          : 'border-gray-200 dark:border-gray-700'
      } ${isArchived ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Title + unread dot */}
            <div className="flex items-center gap-2">
              {isUnread && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="Non lue" />
              )}
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                {offer.title}
              </h3>
            </div>
            {/* Company + location */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {[offer.company, offer.location].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{fetchedDate}</span>
        </div>

        {/* Badges row */}
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
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ouvrir
        </button>

        {offer.isRead === 0 && (
          <button
            onClick={handleMarkRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            Marquer lue
          </button>
        )}

        {!hasKanban && (
          <button
            onClick={handleImport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Importer Kanban
          </button>
        )}

        {!isArchived && (
          <button
            onClick={handleArchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            Archiver
          </button>
        )}
      </div>
    </div>
  );
}
