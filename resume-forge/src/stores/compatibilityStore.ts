import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import { computeCompatibilityScore, extractCVContent, hashString } from '@/lib/compatibility-scorer';
import type { CompatibilityScore } from '@/types/compatibility';
import type { CVBlock } from '@/types/cv';
import type { MasterEntry } from '@/types/profile';

interface CompatibilityState {
  /** Keyed by applicationId */
  scores: Record<string, CompatibilityScore>;
  computing: Record<string, boolean>;
  error: string | null;

  /** Load a persisted score for a given application (if one exists). */
  fetchScore: (applicationId: string) => Promise<void>;

  /**
   * Compute and persist a new score.
   * Requires the job description text + resolved CV data.
   */
  computeAndSave: (
    applicationId: string,
    cvId: string,
    jobDescription: string,
    blocks: CVBlock[],
    entries: MasterEntry[],
  ) => Promise<void>;

  /** Remove a score from store and DB (e.g. when job description is cleared). */
  deleteScore: (applicationId: string) => Promise<void>;

  /**
   * Return true when the stored score is stale — i.e. the CV content or job
   * description has changed since the score was computed.
   */
  isStale: (applicationId: string, jobDescription: string, blocks: CVBlock[], entries: MasterEntry[]) => boolean;
}

function rowToScore(row: Record<string, unknown>): CompatibilityScore {
  const raw = keysToCamelCase<Record<string, unknown>>(row);
  return {
    ...raw,
    details: typeof raw.details === 'string' ? JSON.parse(raw.details) : raw.details,
  } as CompatibilityScore;
}

export const useCompatibilityStore = create<CompatibilityState>((set, get) => ({
  scores: {},
  computing: {},
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

  computeAndSave: async (applicationId, cvId, jobDescription, blocks, entries) => {
    set(state => ({ computing: { ...state.computing, [applicationId]: true }, error: null }));
    try {
      const result = computeCompatibilityScore(jobDescription, blocks, entries);

      const detailsJson = JSON.stringify(result.details);
      const db = await getDb();

      // Upsert (application_id is UNIQUE)
      await db.execute(
        `INSERT INTO compatibility_scores
           (application_id, cv_id, score_global, score_skills, score_experience,
            score_education, score_keywords, details, cv_content_hash, job_description_hash, computed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
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
          result.scoreGlobal,
          result.scoreSkills,
          result.scoreExperience,
          result.scoreEducation,
          result.scoreKeywords,
          detailsJson,
          result.cvContentHash,
          result.jobDescriptionHash,
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
      set({ error: err instanceof Error ? err.message : 'Failed to compute score' });
      throw err;
    } finally {
      set(state => ({ computing: { ...state.computing, [applicationId]: false } }));
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

  isStale: (applicationId, jobDescription, blocks, entries) => {
    const score = get().scores[applicationId];
    if (!score) return false;
    const { contentHash } = extractCVContent(blocks, entries);
    const jobHash = hashString(jobDescription);
    return score.cvContentHash !== contentHash || score.jobDescriptionHash !== jobHash;
  },
}));
