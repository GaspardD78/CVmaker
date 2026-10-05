/**
 * Rejeu du scorer sur une offre DÉJÀ en base.
 *
 * `extraction` (confiance du titre et du contrat) n'est pas persisté. Les parseurs
 * déclarent un titre `high` dans la quasi-totalité des cas, et un contrat `high`
 * quand il est renseigné : on rejoue avec ces valeurs, ce qui évite de sous-évaluer
 * systématiquement les offres de 10 points (30 au lieu de 40 sur le titre).
 */

import { DEFAULT_EXTRACTION, type SearchProfile } from '@/types/job-watch';
import { computeScoreWithBreakdown, type LearnedSignals, type ScoreBreakdown } from './scorer';

export interface ReplayableOffer {
  title: string;
  snippet: string | null;
  publishedAt: string | null;
  company: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  contractType: string | null;
}

export function replayScore(
  o: ReplayableOffer,
  profile: SearchProfile,
  signals?: LearnedSignals,
): ScoreBreakdown {
  return computeScoreWithBreakdown({
    title: o.title, descriptionSnippet: o.snippet, publishedAt: o.publishedAt, company: o.company,
    salaryMin: o.salaryMin, salaryMax: o.salaryMax, contractType: o.contractType,
    extraction: {
      ...DEFAULT_EXTRACTION,
      titleConfidence: 'high',
      contractConfidence: o.contractType ? 'high' : 'none',
    },
  }, profile, signals);
}
