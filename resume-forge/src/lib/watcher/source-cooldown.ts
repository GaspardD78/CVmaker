/**
 * Repos imposé à une source qui nous a refusés (spec 006, phase 2).
 *
 * Quand un site répond 403 / 429 / page de pare-feu, réessayer à chaque cycle
 * revient à marteler un service qui a dit non : au mieux c'est inutile, au pire
 * cela durcit le blocage. On marque donc la source « en pause » pour une durée
 * fixe, persistée en base (elle survit au redémarrage), et on l'affiche.
 */

import type { JobSource } from '@/types/job-watch';
import type { SourceFailure } from './source-status';

const HOUR_MS = 3_600_000;

/** Durée de repos après un refus, par source. Les sources absentes n'ont pas de pause. */
export const COOLDOWN_MS: Partial<Record<JobSource, number>> = {
  apec:               24 * HOUR_MS,
  emploi_territorial: 24 * HOUR_MS,
  choisir_service_public: 6 * HOUR_MS,
};

type Db = {
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export interface Cooldown {
  blockedUntil: string;
  reason: string | null;
}

/** Date de fin de pause à poser après cet échec, ou null s'il n'y a pas lieu d'en poser une. */
export function cooldownUntil(
  source: JobSource,
  failure: SourceFailure,
  now: number = Date.now(),
): string | null {
  const duration = COOLDOWN_MS[source];
  if (!duration || failure.kind !== 'bloquee') return null;
  return new Date(now + duration).toISOString();
}

export function isCoolingDown(cooldown: Cooldown | undefined, now: number = Date.now()): boolean {
  return Boolean(cooldown) && new Date(cooldown!.blockedUntil).getTime() > now;
}

export function formatCooldownMessage(source: JobSource, cooldown: Cooldown): string {
  const until = new Date(cooldown.blockedUntil);
  const hhmm = until.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return `${source} en pause jusqu'au ${hhmm} (refus des requêtes automatiques) — aucune nouvelle tentative avant.`;
}

export async function loadCooldowns(db: Db): Promise<Map<JobSource, Cooldown>> {
  try {
    const rows = await db.select<{ source: string; blocked_until: string; reason: string | null }[]>(
      `SELECT source, blocked_until, reason FROM job_watch_source_cooldown`,
    );
    return new Map(rows.map(r => [r.source as JobSource, { blockedUntil: r.blocked_until, reason: r.reason }]));
  } catch {
    return new Map();
  }
}

export async function saveCooldown(
  db: Db, source: JobSource, blockedUntil: string, reason: string | null,
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO job_watch_source_cooldown (source, blocked_until, reason) VALUES (?1, ?2, ?3)
       ON CONFLICT(source) DO UPDATE SET blocked_until = excluded.blocked_until, reason = excluded.reason`,
      [source, blockedUntil, reason],
    );
  } catch (err) {
    console.warn('[fetcher] saveCooldown error (non-fatal):', err);
  }
}

export async function clearCooldown(db: Db, source: JobSource): Promise<void> {
  try {
    await db.execute(`DELETE FROM job_watch_source_cooldown WHERE source = ?1`, [source]);
  } catch (err) {
    console.warn('[fetcher] clearCooldown error (non-fatal):', err);
  }
}
