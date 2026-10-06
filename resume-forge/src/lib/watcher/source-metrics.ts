/**
 * Mesures propres à une source, journalisées avec la collecte (spec 007).
 * Aujourd'hui : « Choisir le service public » (offres listées, retenues par le
 * post-filtre, enrichies, durée).
 */

export interface SourceMetrics {
  listed?: number;
  retained?: number;
  enriched?: number;
  listPages?: number;
  durationMs?: number;
}

export function parseSourceMetrics(raw: string | null | undefined): SourceMetrics | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as SourceMetrics) : null;
  } catch {
    return null;
  }
}

/** Ligne lisible, ou null quand il n'y a rien à dire. */
export function describeSourceMetrics(m: SourceMetrics | null): string | null {
  if (!m || m.listed === undefined) return null;
  const secs = m.durationMs !== undefined ? ` en ${Math.round(m.durationMs / 1000)} s` : '';
  return `${m.listed} listées, ${m.retained ?? 0} retenues, ${m.enriched ?? 0} enrichies${secs}`;
}
