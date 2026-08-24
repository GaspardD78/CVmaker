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
 * When `includeBigrams` is true, also returns significant bigrams (pairs of consecutive words).
 */
export function extractSignificantTerms(text: string, includeBigrams = false): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôùûüç\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ''))   // trim leading/trailing hyphens
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  if (!includeBigrams) return words;

  // Generate bigrams from significant words
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return [...words, ...bigrams];
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
  const terms = extractSignificantTerms(offerTitle, true); // include bigrams
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

// ── Time-decay for learned dictionaries ─────────────────────────────────────

/**
 * Applies exponential decay to a learned dictionary.
 * Multiplies all scores by 0.9 for each full 7-day period since `lastDecayedAt`.
 * Prunes terms that drop below a score of 1.
 * Returns the decayed dictionary and the new timestamp.
 */
export function decayLearnedDict(
  dict: LearnedDictionary,
  lastDecayedAt: string | null,
): { dict: LearnedDictionary; decayedAt: string } {
  const now = Date.now();
  const lastMs = lastDecayedAt ? new Date(lastDecayedAt).getTime() : now;
  const elapsedMs = now - lastMs;
  const weeksPassed = Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000));

  if (weeksPassed <= 0) {
    return { dict, decayedAt: lastDecayedAt ?? new Date().toISOString() };
  }

  const factor = Math.pow(0.9, weeksPassed);

  const decay = (d: Record<string, number>): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const [term, score] of Object.entries(d)) {
      const decayed = score * factor;
      if (decayed >= 1) result[term] = Math.round(decayed * 100) / 100;
    }
    return result;
  };

  return {
    dict: { positive: decay(dict.positive), negative: decay(dict.negative) },
    decayedAt: new Date().toISOString(),
  };
}

// ── Company reputation tracking ─────────────────────────────────────────────

/**
 * Updates a company reputation dictionary based on feedback action.
 * Positive actions increase rep, negative actions decrease it.
 */
export function processCompanyReputation(
  company: string | null,
  action: string,
  currentReputation: Record<string, number>,
): Record<string, number> {
  if (!company || !company.trim()) return currentReputation;
  const key = company.trim().toLowerCase();
  const rep = { ...currentReputation };

  if (action === 'kanban_import') {
    rep[key] = (rep[key] ?? 0) + 2;
  } else if (action === 'thumbs_up') {
    rep[key] = (rep[key] ?? 0) + 1;
  } else if (action === 'thumbs_down') {
    rep[key] = (rep[key] ?? 0) - 1;
  } else if (action === 'quick_archive') {
    rep[key] = (rep[key] ?? 0) - 2;
  }

  return rep;
}

/**
 * Returns companies with strongly negative reputation that the user
 * may want to add to the blacklist.
 */
export function getBlacklistSuggestions(
  reputation: Record<string, number>,
  threshold = -5,
): string[] {
  return Object.entries(reputation)
    .filter(([, score]) => score <= threshold)
    .sort(([, a], [, b]) => a - b)
    .map(([company]) => company);
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
export async function analyzeFeedback(alertId?: string | null): Promise<LearningResult> {
  // Dynamic import avoids pulling the Tauri SQL plugin into unit-test bundles
  // while still sharing this file between app and tests.
  const { getDb } = await import('@/lib/db');
  const db = await getDb();

  // Restreint à une piste quand elle est fournie : les suggestions d'une
  // exploration ne doivent pas être dictées par les rejets d'une autre.
  // Les feedbacks antérieurs au portefeuille (alert_id NULL) ne sont attribués
  // à aucune piste, donc jamais réutilisés rétroactivement.
  const rows = alertId
    ? await db.select<{ action: string; title: string; description_snippet: string | null }[]>(`
        SELECT f.action, o.title, o.description_snippet
        FROM job_offer_feedback f
        JOIN job_offers o ON o.id = f.offer_id
        WHERE f.action IN ('thumbs_down', 'quick_archive', 'kanban_import')
          AND f.alert_id = ?1
      `, [alertId])
    : await db.select<{ action: string; title: string; description_snippet: string | null }[]>(`
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
