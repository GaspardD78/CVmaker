/**
 * learning-engine.ts
 *
 * Two concerns:
 *  1. Pure functions for processing individual feedback events (no I/O — fully unit-testable).
 *  2. analyzeFeedback() — async DB query that aggregates historical feedback to surface
 *     actionable exclusion/bonus-term suggestions.
 */

export interface LearnedDictionary {
  positive: Record<string, number>;
  negative: Record<string, number>;
}

const STOP_WORDS = new Set([
  // French
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux',
  'pour', 'par', 'sur', 'dans', 'avec', 'est', 'sont', 'ont', 'a', 'se', 'ce',
  'qui', 'que', 'qu', 'ou', 'il', 'elle', 'ils', 'elles', 'nous', 'vous', 'je',
  'tu', 'me', 'te', 'lui', 'leur', 'y', 'ne', 'pas', 'plus', 'très', 'mais',
  'si', 'car', 'ni', 'or', 'donc', 'or', 'lorsque', 'quand', 'bien', 'aussi',
  'tout', 'tous', 'toutes', 'cette', 'cet', 'ces', 'mon', 'ton', 'son', 'nos',
  'vos', 'leurs', 'sa', 'ma', 'ta',
  // English
  'the', 'an', 'in', 'of', 'at', 'for', 'to', 'is', 'are', 'with', 'by', 'on',
  'and', 'as', 'be', 'was', 'were', 'from', 'it', 'its', 'this', 'that', 'you',
  'we', 'he', 'she', 'they', 'have', 'has', 'had', 'not', 'but', 'your', 'our',
  'their', 'will', 'can', 'do', 'does', 'did', 'may', 'all', 'if', 'so',
]);

/**
 * Extracts significant keywords from a text string.
 * Lowercases, strips punctuation, removes stop-words and short tokens.
 */
export function extractSignificantTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôùûüç\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ''))   // trim leading/trailing hyphens
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Updates the learned dictionary based on an action performed on an offer title.
 *
 * Weights:
 *   kanban_import → positive +2
 *   thumbs_up     → positive +1
 *   thumbs_down   → negative +1
 *   quick_archive → negative +2
 */
export function processFeedback(
  offerTitle: string,
  action: string,
  currentDict: LearnedDictionary,
): LearnedDictionary {
  const terms = extractSignificantTerms(offerTitle);
  if (terms.length === 0) return currentDict;

  const positive = { ...currentDict.positive };
  const negative = { ...currentDict.negative };

  const increment = (dict: Record<string, number>, weight: number) => {
    for (const term of terms) {
      dict[term] = (dict[term] ?? 0) + weight;
    }
  };

  if (action === 'kanban_import') {
    increment(positive, 2);
  } else if (action === 'thumbs_up') {
    increment(positive, 1);
  } else if (action === 'thumbs_down') {
    increment(negative, 1);
  } else if (action === 'quick_archive') {
    increment(negative, 2);
  }

  return { positive, negative };
}

/**
 * Returns keyword suggestions from the learned dictionary
 * where the cumulative score has reached the threshold.
 * Results are sorted by score descending.
 */
export function getKeywordSuggestions(
  dict: LearnedDictionary,
  threshold = 5,
): { positive: string[]; negative: string[] } {
  const filter = (d: Record<string, number>) =>
    Object.entries(d)
      .filter(([, score]) => score >= threshold)
      .sort(([, a], [, b]) => b - a)
      .map(([term]) => term);

  return {
    positive: filter(dict.positive),
    negative: filter(dict.negative),
  };
}

// ── Aggregate feedback analysis ──────────────────────────────────────────────

export interface LearningResult {
  /** Terms appearing in > 30 % of rejected offers. */
  suggestedExclusions: string[];
  /** Terms appearing in > 30 % of Kanban-imported offers. */
  suggestedBonusTerms: string[];
  /** Number of negative feedback events analysed. */
  totalNegative: number;
  /** Number of positive (kanban_import) feedback events analysed. */
  totalPositive: number;
}

/**
 * Queries the DB, aggregates feedback and returns term-frequency suggestions.
 *
 * Each term is counted at most once per offer (Set dedup per row) so a single
 * verbose snippet cannot inflate the frequency of a term artificially.
 *
 * Suggestions are only emitted when there are ≥ 3 data-points in that group
 * to avoid noisy recommendations at the start of usage.
 *
 * This function is intentionally async and should be called off the critical
 * rendering path (e.g. inside a useEffect, never during render).
 */
export async function analyzeFeedback(): Promise<LearningResult> {
  // Dynamic import avoids pulling the Tauri SQL plugin into unit-test bundles
  // while still sharing this file between app and tests.
  const { getDb } = await import('@/lib/db');
  const db = await getDb();

  const rows = await db.select<{
    action: string;
    title: string;
    description_snippet: string | null;
  }[]>(`
    SELECT f.action, o.title, o.description_snippet
    FROM job_offer_feedback f
    JOIN job_offers o ON o.id = f.offer_id
    WHERE f.action IN ('thumbs_down', 'quick_archive', 'kanban_import')
  `);

  const negativeTexts: string[] = [];
  const positiveTexts: string[] = [];

  for (const row of rows) {
    const text = `${row.title} ${row.description_snippet ?? ''}`.trim();
    if (row.action === 'thumbs_down' || row.action === 'quick_archive') {
      negativeTexts.push(text);
    } else if (row.action === 'kanban_import') {
      positiveTexts.push(text);
    }
  }

  /**
   * For each text, extract unique terms (Set per offer).
   * Then count across offers and keep those above the 30 % threshold.
   */
  const computeSuggestions = (texts: string[]): string[] => {
    if (texts.length < 3) return [];
    const termCounts = new Map<string, number>();
    for (const text of texts) {
      for (const term of new Set(extractSignificantTerms(text))) {
        termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
      }
    }
    const minCount = texts.length * 0.3;
    return [...termCounts.entries()]
      .filter(([, count]) => count > minCount)
      .sort(([, a], [, b]) => b - a)
      .map(([term]) => term);
  };

  return {
    suggestedExclusions: computeSuggestions(negativeTexts),
    suggestedBonusTerms: computeSuggestions(positiveTexts),
    totalNegative: negativeTexts.length,
    totalPositive: positiveTexts.length,
  };
}
