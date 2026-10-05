import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { getDb } from '@/lib/db';
import {
  buildBlacklistSuggestions, companyKey, type CompanyOffer, type FeedbackEvent,
} from '@/lib/watcher/blacklist-suggestions';
import type { JobOfferWithAlerts, JobWatchAlert } from '@/types/job-watch';

interface Props {
  alert: JobWatchAlert;
  offers: JobOfferWithAlerts[];
}

/**
 * Suggestions de blacklist d'une piste (spec 006, phase 9) : titres rejetés
 * visibles, deux portées (entreprise ou type de poste), confirmation avant
 * action et annulation possible.
 */
export function BlacklistSuggestions({ alert, offers }: Props) {
  const updateAlert = useJobWatchStore(s => s.updateAlert);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ offer_id: string; action: string; created_at: string }[]>(
          `SELECT offer_id, action, created_at FROM job_offer_feedback WHERE alert_id = ?1`,
          [alert.id],
        );
        if (!cancelled) {
          setFeedback(rows.map(r => ({ offerId: r.offer_id, action: r.action, createdAt: r.created_at })));
        }
      } catch {
        if (!cancelled) setFeedback([]);
      }
    })();
    return () => { cancelled = true; };
  }, [alert.id, offers.length]);

  const companyOffers = useMemo<CompanyOffer[]>(
    () => offers
      .filter(o => o.alerts.some(l => l.alertId === alert.id))
      .map(o => ({
        id: o.id, title: o.title, company: o.company, isRead: o.isRead,
        kanbanId: o.kanbanId, fetchedAt: o.fetchedAt,
      })),
    [offers, alert.id],
  );

  const suggestions = useMemo(
    () => buildBlacklistSuggestions({
      offers: companyOffers,
      feedback,
      jobTitles: alert.searchProfile.jobTitles,
      titlesUpdatedAt: alert.titlesUpdatedAt ?? null,
      blacklistedCompanies: alert.searchProfile.blacklistedCompanies,
    }).filter(s => !dismissed.has(s.key)),
    [companyOffers, feedback, alert, dismissed],
  );

  if (suggestions.length === 0) return null;

  const dismiss = (key: string) => setDismissed(prev => new Set([...prev, key]));

  const blacklistCompany = async (company: string, key: string) => {
    const ok = window.confirm(
      `Blacklister « ${company} » sur la piste « ${alert.name} » ?\n\n` +
      'Toutes ses offres, y compris celles qui correspondent à vos intitulés, seront masquées et écartées à la collecte. ' +
      'Vous pourrez annuler juste après.',
    );
    if (!ok) return;
    const previous = alert.searchProfile.blacklistedCompanies;
    await updateAlert(alert.id, {
      searchProfile: { ...alert.searchProfile, blacklistedCompanies: [...previous, company] },
    });
    dismiss(key);
    toast.success(`« ${company} » blacklistée`, {
      action: {
        label: 'Annuler',
        onClick: () => {
          void updateAlert(alert.id, {
            searchProfile: { ...alert.searchProfile, blacklistedCompanies: previous },
          });
        },
      },
    });
  };

  const ignoreJobType = async (company: string, key: string, suggestedTerm: string | null) => {
    const term = window.prompt(
      `Terme de titre à ignorer chez « ${company} » (les autres postes de cette entreprise restent visibles) :`,
      suggestedTerm ?? '',
    )?.trim();
    if (!term) return;
    const previous = alert.searchProfile.companyTitleExclusions ?? [];
    await updateAlert(alert.id, {
      searchProfile: {
        ...alert.searchProfile,
        companyTitleExclusions: [...previous, { company, term }],
      },
    });
    dismiss(key);
    toast.success(`Les postes « ${term} » de « ${company} » seront ignorés`, {
      action: {
        label: 'Annuler',
        onClick: () => {
          void updateAlert(alert.id, {
            searchProfile: { ...alert.searchProfile, companyTitleExclusions: previous },
          });
        },
      },
    });
  };

  return (
    <div className="space-y-1.5">
      {suggestions.map(s => (
        <div
          key={s.key}
          className="rounded border border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-800 dark:text-red-300 space-y-1"
        >
          <div className="flex items-start justify-between gap-2">
            <p>
              Vous rejetez souvent les offres de « {s.company} » ({s.rejectedCount} rejet{s.rejectedCount > 1 ? 's' : ''}).
              {' '}Ce sont peut-être des <strong>types de postes</strong> plutôt que l'entreprise.
            </p>
            <button
              onClick={() => dismiss(s.key)}
              aria-label="Ignorer"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <ul className="list-disc pl-4 text-red-700/90 dark:text-red-300/90">
            {s.rejectedTitles.slice(0, 5).map(t => (
              <li key={t.title}>{t.title}{t.count > 1 ? ` (× ${t.count})` : ''}</li>
            ))}
            {s.rejectedTitles.length > 5 && <li>… et {s.rejectedTitles.length - 5} autre(s)</li>}
          </ul>
          <div className="flex flex-wrap gap-3 pt-0.5">
            <button
              onClick={() => void ignoreJobType(s.company, s.key, s.suggestedTerm)}
              className="font-semibold underline underline-offset-2"
            >
              Ignorer ce type de poste chez elle
            </button>
            <button
              onClick={() => void blacklistCompany(s.company, s.key)}
              className="font-semibold underline underline-offset-2"
            >
              Blacklister l'entreprise
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export { companyKey };
