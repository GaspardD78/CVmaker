/**
 * learning-engine.ts
 *
 * Pure functions for behavioral learning from job offer feedback.
 * No DB or Store access — fully unit-testable.
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
