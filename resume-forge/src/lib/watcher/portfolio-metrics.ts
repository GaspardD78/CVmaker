/**
 * Métriques du portefeuille — calculées localement, sans IA.
 *
 * Le recouvrement entre pistes est une mesure, pas une opinion : deux pistes
 * qui ramènent 80 % des mêmes offres consomment un quart du budget de collecte
 * pour rien tout en donnant l'illusion d'une recherche large. L'application
 * doit pouvoir le dire seule, avant même qu'un assistant n'intervienne.
 *
 * L'IA n'entre en jeu qu'ensuite, pour interpréter ces chiffres et proposer
 * des ajustements (cf. `ai-portfolio.ts`).
 */

import { getDb } from '@/lib/db';
import type { JobWatchAlert } from '@/types/job-watch';

/** Fenêtre d'observation par défaut, en jours. */
export const METRICS_WINDOW_DAYS = 30;

/** Seuil au-delà duquel un recouvrement est signalé sans passer par l'IA. */
export const OVERLAP_WARNING_THRESHOLD = 60;

export interface AlertMetrics {
  alertId: string;
  name: string;
  /** Offres captées par la piste sur la fenêtre. */
  total: number;
  /** Offres captées par cette piste et par aucune autre. */
  exclusive: number;
  /** Part des offres lues, en pourcentage entier. */
  readRate: number;
  /** Part des offres importées dans le Kanban. */
  kanbanRate: number;
  /** Part des offres archivées sans avoir été ouvertes. */
  quickArchiveRate: number;
  /** Score médian de la piste. */
  medianScore: number;
}

export interface OverlapMetric {
  alertIdA: string;
  alertIdB: string;
  nameA: string;
  nameB: string;
  shared: number;
  /**
   * `shared / MIN(total_a, total_b)`, en pourcentage entier.
   *
   * On rapporte au plus petit des deux volumes : sinon une petite piste
   * entièrement incluse dans une grosse afficherait un recouvrement
   * trompeusement faible, alors qu'elle n'apporte strictement rien.
   */
  sharedPercent: number;
}

export interface PortfolioMetrics {
  windowDays: number;
  perAlert: AlertMetrics[];
  overlaps: OverlapMetric[];
}

/** Une ligne de rattachement enrichie de l'état de son offre. */
export interface MetricRow {
  alertId: string;
  offerId: string;
  score: number;
  isRead: number;
  hasKanban: boolean;
  quickArchived: boolean;
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * Agrège les métriques du portefeuille. Fonction pure : c'est ici que se joue
 * la définition de chaque indicateur, donc c'est ici qu'on la teste.
 *
 * Les pistes sans aucune offre sur la fenêtre restent présentes avec des
 * compteurs à zéro : une piste muette est une information, pas une absence.
 */
export function computeMetricsFromRows(
  rows: MetricRow[],
  alerts: Array<Pick<JobWatchAlert, 'id' | 'name' | 'position'>>,
  windowDays = METRICS_WINDOW_DAYS,
): PortfolioMetrics {
  const ordered = [...alerts].sort((a, b) => a.position - b.position);
  const known = new Set(ordered.map(a => a.id));
  const relevant = rows.filter(r => known.has(r.alertId));

  // Nombre de pistes par offre — sert au calcul des offres exclusives.
  const alertsPerOffer = new Map<string, number>();
  for (const row of relevant) {
    alertsPerOffer.set(row.offerId, (alertsPerOffer.get(row.offerId) ?? 0) + 1);
  }

  const byAlert = new Map<string, MetricRow[]>(ordered.map(a => [a.id, []]));
  for (const row of relevant) byAlert.get(row.alertId)!.push(row);

  const perAlert: AlertMetrics[] = ordered.map(alert => {
    const alertRows = byAlert.get(alert.id)!;
    const total = alertRows.length;
    return {
      alertId:          alert.id,
      name:             alert.name,
      total,
      exclusive:        alertRows.filter(r => alertsPerOffer.get(r.offerId) === 1).length,
      readRate:         percent(alertRows.filter(r => r.isRead === 1).length, total),
      kanbanRate:       percent(alertRows.filter(r => r.hasKanban).length, total),
      quickArchiveRate: percent(alertRows.filter(r => r.quickArchived).length, total),
      medianScore:      median(alertRows.map(r => r.score)),
    };
  });

  const offersOf = new Map<string, Set<string>>(
    ordered.map(a => [a.id, new Set(byAlert.get(a.id)!.map(r => r.offerId))]),
  );

  const overlaps: OverlapMetric[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const setA = offersOf.get(a.id)!;
      const setB = offersOf.get(b.id)!;
      if (setA.size === 0 || setB.size === 0) continue;
      let shared = 0;
      for (const offerId of setA) if (setB.has(offerId)) shared += 1;
      overlaps.push({
        alertIdA: a.id, alertIdB: b.id,
        nameA: a.name, nameB: b.name,
        shared,
        sharedPercent: percent(shared, Math.min(setA.size, setB.size)),
      });
    }
  }
  overlaps.sort((x, y) => y.sharedPercent - x.sharedPercent);

  return { windowDays, perAlert, overlaps };
}

/** Charge les lignes de la fenêtre puis délègue le calcul à la fonction pure. */
export async function computePortfolioMetrics(
  alerts: Array<Pick<JobWatchAlert, 'id' | 'name' | 'position'>>,
  profileId: string | null,
  windowDays = METRICS_WINDOW_DAYS,
): Promise<PortfolioMetrics> {
  const db = await getDb();
  const since = `-${windowDays} days`;

  const sql = `
    SELECT l.alert_id       AS alertId,
           l.offer_id       AS offerId,
           l.score          AS score,
           o.is_read        AS isRead,
           o.kanban_id      AS kanbanId,
           (SELECT COUNT(*) FROM job_offer_feedback f
             WHERE f.offer_id = o.id AND f.action = 'quick_archive') AS quickArchived
    FROM job_offer_alerts l
    JOIN job_offers o ON o.id = l.offer_id
    WHERE o.fetched_at >= datetime('now', ?1)
      AND ${profileId ? 'o.profile_id = ?2' : 'o.profile_id IS NULL'}
  `;

  const rows = await db.select<Array<{
    alertId: string; offerId: string; score: number;
    isRead: number; kanbanId: string | null; quickArchived: number;
  }>>(sql, profileId ? [since, profileId] : [since]);

  return computeMetricsFromRows(
    rows.map(r => ({
      alertId: r.alertId,
      offerId: r.offerId,
      score: r.score ?? 0,
      isRead: r.isRead ?? 0,
      hasKanban: r.kanbanId !== null,
      quickArchived: (r.quickArchived ?? 0) > 0,
    })),
    alerts,
    windowDays,
  );
}
