/**
 * Couverture par source, pour les prompts d'analyse IA (spec 006, phase 10).
 *
 * Un diagnostic fondé sur un échantillon presque entièrement issu d'une seule
 * source (WTTJ : startups, titres anglais) conclut sur la source, pas sur la
 * recherche. On donne donc à l'IA le statut de chaque source, sa part dans
 * l'échantillon analysé, un avertissement de biais au-delà de 70 %, et la
 * consigne de ne régler aucune source défaillante avant de l'avoir réparée.
 */

import type { FetchLog, JobSource } from '@/types/job-watch';
import { RECOMMENDED_SOURCES, SOURCE_LABELS } from './sources';
import {
  FAILING_STATUSES, legacyToSourceStatus, SOURCE_STATUS_LABELS, type SourceStatus,
} from './source-status';

/** Part d'une source au-delà de laquelle l'échantillon est jugé biaisé. */
export const BIAS_THRESHOLD = 0.7;

export interface CoverageRow {
  source: JobSource;
  label: string;
  status: SourceStatus;
  fetched: number;
  newOffers: number;
  /** Offres de l'échantillon analysé issues de cette source. */
  sampleCount: number;
  /** Part de l'échantillon, en %. */
  sharePct: number;
}

export interface SourceCoverage {
  rows: CoverageRow[];
  sampleSize: number;
  /** Source dominant l'échantillon, s'il y en a une au-delà du seuil. */
  biased: { label: string; sharePct: number } | null;
  /** Sources à réparer ou à activer d'abord. */
  toFix: Array<{ label: string; status: SourceStatus }>;
}

export interface CoverageInput {
  /** Dernière collecte par source pour la piste analysée. */
  lastLogBySource: Map<JobSource, Pick<FetchLog, 'status' | 'sourceStatus' | 'offersFetched' | 'offersNew'>>;
  /** Sources activées pour la piste. */
  configuredSources: ReadonlySet<JobSource>;
  /** Sources des offres de l'échantillon analysé (une entrée par offre). */
  sampleSources: string[];
  sources?: JobSource[];
}

export function buildSourceCoverage(input: CoverageInput): SourceCoverage {
  const sampleSize = input.sampleSources.length;
  const counts = new Map<string, number>();
  for (const source of input.sampleSources) counts.set(source, (counts.get(source) ?? 0) + 1);

  const rows: CoverageRow[] = (input.sources ?? RECOMMENDED_SOURCES).map(source => {
    const log = input.lastLogBySource.get(source);
    const status: SourceStatus = log
      ? (log.sourceStatus ?? legacyToSourceStatus(log.status))
      : input.configuredSources.has(source) ? 'en_attente' : 'non_configuree';
    const sampleCount = counts.get(source) ?? 0;
    return {
      source,
      label: SOURCE_LABELS[source],
      status,
      fetched: log?.offersFetched ?? 0,
      newOffers: log?.offersNew ?? 0,
      sampleCount,
      sharePct: sampleSize > 0 ? Math.round((sampleCount / sampleSize) * 100) : 0,
    };
  });

  const dominant = [...rows].sort((a, b) => b.sampleCount - a.sampleCount)[0];
  const biased = dominant && sampleSize > 0 && dominant.sampleCount / sampleSize > BIAS_THRESHOLD
    ? { label: dominant.label, sharePct: dominant.sharePct }
    : null;

  const toFix = rows
    .filter(r => FAILING_STATUSES.has(r.status) || r.status === 'non_configuree')
    .map(r => ({ label: r.label, status: r.status }));

  return { rows, sampleSize, biased, toFix };
}

/** Section Markdown ajoutée au contexte des prompts d'analyse. */
export function renderCoverageSection(coverage: SourceCoverage): string {
  const lines = coverage.rows.map(r => {
    const base = `- ${r.label} : ${SOURCE_STATUS_LABELS[r.status]}`;
    if (r.status === 'non_configuree') return `${base} (non activée pour cette piste)`;
    return `${base} — ${r.fetched} récupérée${r.fetched > 1 ? 's' : ''}, ${r.newOffers} nouvelle${r.newOffers > 1 ? 's' : ''}, ${r.sharePct} % de l'échantillon analysé`;
  });

  const parts = [
    `## Couverture par source (échantillon analysé : ${coverage.sampleSize} offre${coverage.sampleSize > 1 ? 's' : ''})`,
    lines.join('\n'),
  ];
  if (coverage.biased) {
    parts.push(`Avertissement : échantillon biaisé : ${coverage.biased.sharePct} % de ${coverage.biased.label}. Les constats ne valent pas pour les autres sources.`);
  }
  if (coverage.toFix.length > 0) {
    parts.push(`Sources à réparer ou activer d'abord : ${coverage.toFix.map(f => `${f.label} (${SOURCE_STATUS_LABELS[f.status]})`).join(', ')}.`);
  }
  parts.push(
    'Consigne : ne propose AUCUN réglage (mots-clés, exclusions, seuils) pour une source en erreur ou bloquée ; ' +
    'signale d\'abord les sources à réparer ou à activer, puis analyse seulement les sources qui répondent.',
  );
  return `\n${parts.join('\n')}\n`;
}
