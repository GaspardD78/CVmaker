/**
 * Mesures propres à une source, journalisées avec la collecte (spec 007).
 * « Choisir le service public » (offres listées, retenues par le post-filtre,
 * enrichies, durée) et France Travail (reçues / retenues, par partenaire).
 */

/** Offres reçues / retenues pour une origine (France Travail ou un partenaire). */
export interface PartnerCount {
  received: number;
  retained: number;
}

export interface SourceMetrics {
  listed?: number;
  retained?: number;
  enriched?: number;
  listPages?: number;
  capped?: boolean;
  durationMs?: number;
  /** France Travail : par origine (« France Travail » ou nom du partenaire). */
  byPartner?: Record<string, PartnerCount>;
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
  const cap = m.capped ? ' — plafond de requêtes de liste atteint, collecte interrompue' : '';
  if (m.byPartner) {
    const rows = Object.entries(m.byPartner)
      .sort((a, b) => b[1].received - a[1].received)
      .map(([name, c]) => `${name} ${c.retained}/${c.received}`);
    return `${m.listed} reçues, ${m.retained ?? 0} retenues${secs}${cap}${rows.length ? ` — par origine (retenues/reçues) : ${rows.join(', ')}` : ''}`;
  }
  return `${m.listed} listées, ${m.retained ?? 0} retenues, ${m.enriched ?? 0} enrichies${secs}${cap}`;
}
