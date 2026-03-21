import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import type { AIAnalysis, CompatibilityScore, CompatibilityScoreDetails } from '@/types/compatibility';

/** Raw JSON returned by the AI, pasted by the user. */
export interface AIAnalysisRaw {
  score_global: number;
  scores: {
    competences: number;
    experience: number;
    formation: number;
    couverture: number;
  };
  points_forts: string[];
  points_friction: string[];
  recommandations: string[];
  mots_cles_manquants: string[];
  mots_cles_presents: string[];
  synthese: string;
}

interface CompatibilityState {
  /** Keyed by applicationId */
  scores: Record<string, CompatibilityScore>;
  saving: Record<string, boolean>;
  error: string | null;

  /** Load a persisted score for a given application (if one exists). */
  fetchScore: (applicationId: string) => Promise<void>;

  /**
   * Parse an AI-generated JSON analysis and persist it as a CompatibilityScore.
   */
  saveFromAI: (
    applicationId: string,
    cvId: string,
    raw: AIAnalysisRaw,
  ) => Promise<void>;

  /** Remove a score from store and DB. */
  deleteScore: (applicationId: string) => Promise<void>;
}

function rowToScore(row: Record<string, unknown>): CompatibilityScore {
  const raw = keysToCamelCase<Record<string, unknown>>(row);
  return {
    ...raw,
    details: typeof raw.details === 'string' ? JSON.parse(raw.details) : raw.details,
  } as CompatibilityScore;
}

export const useCompatibilityStore = create<CompatibilityState>((set) => ({
  scores: {},
  saving: {},
  error: null,

  fetchScore: async (applicationId) => {
    try {
      const db = await getDb();
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM compatibility_scores WHERE application_id = ?1',
        [applicationId],
      );
      if (rows.length > 0) {
        const score = rowToScore(rows[0]);
        set(state => ({ scores: { ...state.scores, [applicationId]: score } }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch score' });
    }
  },

  saveFromAI: async (applicationId, cvId, raw) => {
    set(state => ({ saving: { ...state.saving, [applicationId]: true }, error: null }));
    try {
      const emptyAxis = { score: 0, matched: [], missing: [] };

      const aiAnalysis: AIAnalysis = {
        source: 'ai',
        strengths: raw.points_forts ?? [],
        frictionPoints: raw.points_friction ?? [],
        recommendations: raw.recommandations ?? [],
        missingKeywords: raw.mots_cles_manquants ?? [],
        presentKeywords: raw.mots_cles_presents ?? [],
        summary: raw.synthese ?? '',
      };

      const details: CompatibilityScoreDetails = {
        axes: {
          skills:     { ...emptyAxis, score: raw.scores.competences },
          experience: { ...emptyAxis, score: raw.scores.experience },
          education:  { ...emptyAxis, score: raw.scores.formation },
          keywords:   { ...emptyAxis, score: raw.scores.couverture },
        },
        advice: [],
        aiAnalysis,
      };

      const db = await getDb();
      await db.execute(
        `INSERT INTO compatibility_scores
           (application_id, cv_id, score_global, score_skills, score_experience,
            score_education, score_keywords, details, cv_content_hash, job_description_hash, computed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ai', 'ai', datetime('now'))
         ON CONFLICT(application_id) DO UPDATE SET
           cv_id                = excluded.cv_id,
           score_global         = excluded.score_global,
           score_skills         = excluded.score_skills,
           score_experience     = excluded.score_experience,
           score_education      = excluded.score_education,
           score_keywords       = excluded.score_keywords,
           details              = excluded.details,
           cv_content_hash      = excluded.cv_content_hash,
           job_description_hash = excluded.job_description_hash,
           computed_at          = excluded.computed_at`,
        [
          applicationId,
          cvId,
          raw.score_global,
          raw.scores.competences,
          raw.scores.experience,
          raw.scores.formation,
          raw.scores.couverture,
          JSON.stringify(details),
        ],
      );

      // Reload from DB to get the generated id
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM compatibility_scores WHERE application_id = ?1',
        [applicationId],
      );
      if (rows.length > 0) {
        const score = rowToScore(rows[0]);
        set(state => ({ scores: { ...state.scores, [applicationId]: score } }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to save AI analysis' });
      throw err;
    } finally {
      set(state => ({ saving: { ...state.saving, [applicationId]: false } }));
    }
  },

  deleteScore: async (applicationId) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM compatibility_scores WHERE application_id = ?1', [applicationId]);
      set(state => {
        const scores = { ...state.scores };
        delete scores[applicationId];
        return { scores };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete score' });
    }
  },
}));
