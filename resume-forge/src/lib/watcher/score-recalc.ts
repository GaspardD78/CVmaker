/**
 * Recalcul des scores après un changement de version du scorer (spec 006, phase 7).
 *
 * Les offres collectées avant la version courante portent des scores d'une
 * autre échelle (décimaux, formule antérieure) : les comparer au seuil ou
 * aux offres récentes fausse les métriques. Ce module les recalcule en tâche
 * de fond, par lots, pour les 60 derniers jours, avec progression.
 *
 * Aucune offre, aucun retour, aucun dictionnaire appris n'est supprimé ni
 * modifié : seuls `score` et `score_version` sont réécrits, piste par piste
 * (`job_offer_alerts`) puis au niveau de l'offre (meilleur score de ses pistes).
 */

import { DEFAULT_EXTRACTION, type JobWatchAlert } from '@/types/job-watch';
import { computeScore, SCORER_VERSION } from './scorer';
import { signalsOf } from './fetcher';

/** Fenêtre de recalcul : les offres plus anciennes ne sont pas retouchées. */
export const RECALC_WINDOW_DAYS = 60;
const BATCH_SIZE = 50;

type Db = {
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export interface RecalcProgress {
  done: number;
  total: number;
}

export interface RecalcResult {
  /** Offres dont au moins un score a été recalculé. */
  recalculated: number;
  /** Offres sans piste exploitable : laissées telles quelles. */
  skipped: number;
}

interface OfferRow {
  id: string;
  title: string;
  company: string | null;
  description_snippet: string | null;
  published_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  contract_type: string | null;
}

function scopeClause(profileId: string | null): { sql: string; params: unknown[] } {
  return profileId
    ? { sql: 'profile_id = ?', params: [profileId] }
    : { sql: 'profile_id IS NULL', params: [] };
}

function sinceIso(now: number, windowDays: number): string {
  return new Date(now - windowDays * 86_400_000).toISOString();
}

/**
 * Nombre d'offres à recalculer. `fetched_at` est comparé au format SQLite
 * (`YYYY-MM-DD HH:MM:SS`) en ne gardant que la date, pour éviter qu'un `T`
 * ne décale la comparaison de chaînes.
 */
/** Seuil de version : `force` inclut aussi les offres déjà à jour (bouton « Recalculer »). */
function versionThreshold(force: boolean): number {
  return force ? SCORER_VERSION + 1 : SCORER_VERSION;
}

export async function countOffersToRecalc(
  db: Db, profileId: string | null, now: number = Date.now(), force = false,
): Promise<number> {
  const scope = scopeClause(profileId);
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM job_offers
     WHERE score_version < ? AND substr(fetched_at, 1, 10) >= ? AND ${scope.sql}
       AND EXISTS (SELECT 1 FROM job_offer_alerts l WHERE l.offer_id = job_offers.id)`,
    [versionThreshold(force), sinceIso(now, RECALC_WINDOW_DAYS).slice(0, 10), ...scope.params],
  );
  return rows[0]?.n ?? 0;
}

export interface RecalcOptions {
  alerts: JobWatchAlert[];
  profileId: string | null;
  db: Db;
  onProgress?: (progress: RecalcProgress) => void;
  now?: number;
  /** Recalcule aussi les offres déjà à la version courante. */
  force?: boolean;
  /** Injectable pour les tests. */
  score?: typeof computeScore;
}

export async function recalculateScores(opts: RecalcOptions): Promise<RecalcResult> {
  const { alerts, profileId, db, onProgress } = opts;
  const now = opts.now ?? Date.now();
  const score = opts.score ?? computeScore;
  const alertById = new Map(alerts.map(a => [a.id, a]));
  const scope = scopeClause(profileId);
  const since = sinceIso(now, RECALC_WINDOW_DAYS).slice(0, 10);

  const force = opts.force ?? false;
  const total = await countOffersToRecalc(db, profileId, now, force);
  onProgress?.({ done: 0, total });

  let done = 0;
  let recalculated = 0;
  let skipped = 0;
  let lastId = '';

  for (;;) {
    // Pagination par identifiant : une offre sans piste exploitable resterait
    // éligible indéfiniment si l'on se contentait de relire « version < courante ».
    const batch = await db.select<OfferRow[]>(
      `SELECT id, title, company, description_snippet, published_at, salary_min, salary_max, contract_type
       FROM job_offers
       WHERE score_version < ? AND substr(fetched_at, 1, 10) >= ? AND ${scope.sql} AND id > ?
         AND EXISTS (SELECT 1 FROM job_offer_alerts l WHERE l.offer_id = job_offers.id)
       ORDER BY id LIMIT ${BATCH_SIZE}`,
      [versionThreshold(force), since, ...scope.params, lastId],
    );
    if (batch.length === 0) break;

    for (const offer of batch) {
      lastId = offer.id;
      const links = await db.select<{ alert_id: string }[]>(
        `SELECT alert_id FROM job_offer_alerts WHERE offer_id = ?`, [offer.id],
      );

      let best = -1;
      for (const { alert_id } of links) {
        const alert = alertById.get(alert_id);
        if (!alert) continue;
        const value = score(
          {
            title: offer.title,
            company: offer.company,
            descriptionSnippet: offer.description_snippet,
            publishedAt: offer.published_at,
            salaryMin: offer.salary_min,
            salaryMax: offer.salary_max,
            contractType: offer.contract_type,
            // La fiabilité d'extraction n'est pas stockée en base : on la
            // suppose bonne (titre) et on ne pénalise un contrat différent que
            // si l'offre en déclare un.
            extraction: {
              ...DEFAULT_EXTRACTION,
              titleConfidence: 'high',
              contractConfidence: offer.contract_type ? 'high' : 'none',
            },
          },
          alert.searchProfile,
          signalsOf(alert),
        );
        await db.execute(
          `UPDATE job_offer_alerts SET score = ?, score_version = ? WHERE offer_id = ? AND alert_id = ?`,
          [value, SCORER_VERSION, offer.id, alert_id],
        );
        best = Math.max(best, value);
      }

      if (best >= 0) {
        await db.execute(
          `UPDATE job_offers SET score = ?, score_version = ? WHERE id = ?`,
          [best, SCORER_VERSION, offer.id],
        );
        recalculated += 1;
      } else {
        skipped += 1;
      }
      done += 1;
    }
    onProgress?.({ done, total });
    // Laisse respirer l'interface entre deux lots.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return { recalculated, skipped };
}
