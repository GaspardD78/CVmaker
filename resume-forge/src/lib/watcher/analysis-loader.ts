/**
 * Lecture en base des données d'une analyse IA (spec 005).
 *
 * Une seule requête par piste : une ligne par offre (les feedbacks sont agrégés
 * dans la requête), ce qui évite les doublons qu'un LEFT JOIN sur les feedbacks
 * produisait (défaut 5). Le dédoublonnage de repli est fait par
 * `buildWatchAnalysisContext`.
 */

import { getDb } from '@/lib/db';
import type { JobWatchAlert } from '@/types/job-watch';
import type { MasterEntry, Profile } from '@/types/profile';
import {
  buildCandidateInput, DEFAULT_PERIOD_DAYS, type FeedbackAction, type WatchAnalysisInput,
  type WatchAnalysisOfferInput,
} from './analysis-context';

interface Row {
  id: string; source: string; title: string; company: string | null; location: string | null;
  contractType: string | null; salaryMin: number | null; salaryMax: number | null; salaryRaw: string | null;
  publishedAt: string | null; fetchedAt: string; score: number | null; snippet: string | null;
  isRead: number | null; kanbanId: string | null; actions: string | null;
}

const KNOWN_ACTIONS = new Set<FeedbackAction>(['kanban_import', 'thumbs_up', 'thumbs_down', 'quick_archive']);

/** Offres de la piste sur la période, avec leurs actions. Hors périmètre : offres d'autres pistes. */
export async function loadAlertOffers(
  alertId: string,
  profileId: string | null,
  periodDays = DEFAULT_PERIOD_DAYS,
): Promise<WatchAnalysisOfferInput[]> {
  const db = await getDb();
  const params: unknown[] = [alertId, `-${periodDays} days`];
  if (profileId) params.push(profileId);
  const rows = await db.select<Row[]>(`
    SELECT o.id AS id, o.source AS source, o.title AS title, o.company AS company,
           o.location AS location, o.contract_type AS contractType,
           o.salary_min AS salaryMin, o.salary_max AS salaryMax, o.salary_raw AS salaryRaw,
           o.published_at AS publishedAt, o.fetched_at AS fetchedAt, l.score AS score,
           o.description_snippet AS snippet, o.is_read AS isRead, o.kanban_id AS kanbanId,
           (SELECT GROUP_CONCAT(f.action) FROM job_offer_feedback f
             WHERE f.offer_id = o.id AND f.alert_id = l.alert_id) AS actions
    FROM job_offer_alerts l
    JOIN job_offers o ON o.id = l.offer_id
    WHERE l.alert_id = ?1
      AND o.fetched_at >= datetime('now', ?2)
      AND ${profileId ? 'o.profile_id = ?3' : 'o.profile_id IS NULL'}
    ORDER BY o.fetched_at DESC
  `, params);

  return rows.map(r => ({
    id: r.id, source: r.source, title: r.title, company: r.company, location: r.location,
    contractType: r.contractType, salaryMin: r.salaryMin, salaryMax: r.salaryMax, salaryRaw: r.salaryRaw,
    publishedAt: r.publishedAt, fetchedAt: r.fetchedAt, storedScore: r.score ?? 0, snippet: r.snippet,
    isRead: (r.isRead ?? 0) === 1, kanban: r.kanbanId !== null,
    actions: (r.actions ?? '').split(',').filter((a): a is FeedbackAction => KNOWN_ACTIONS.has(a as FeedbackAction)),
  }));
}

/** Rassemble toutes les entrées de `buildWatchAnalysisContext` pour une piste. */
export async function loadWatchAnalysisInput(args: {
  alert: JobWatchAlert;
  allAlerts: JobWatchAlert[];
  profile: Profile | null;
  entries: MasterEntry[];
  profileId: string | null;
  periodDays?: number;
}): Promise<WatchAnalysisInput> {
  const { alert, allAlerts, profile, entries, profileId, periodDays = DEFAULT_PERIOD_DAYS } = args;
  const now = new Date();
  return {
    now, periodDays,
    alert: {
      id: alert.id, name: alert.name, kind: alert.kind, searchProfile: alert.searchProfile,
      learnedDict: alert.learnedDict, companyReputation: alert.companyReputation, aiFilterRule: alert.aiFilterRule,
    },
    otherAlerts: allAlerts.filter(a => a.id !== alert.id).sort((a, b) => a.position - b.position)
      .map(a => ({ id: a.id, name: a.name, searchProfile: a.searchProfile })),
    candidate: buildCandidateInput(profile, entries, now),
    offers: await loadAlertOffers(alert.id, profileId, periodDays),
  };
}
