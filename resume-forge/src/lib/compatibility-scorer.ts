import { CVBlock } from '@/types/cv';
import { MasterEntry } from '@/types/profile';
import { getCanonical, getAllVariants } from './tech-synonyms';
import type {
  AxisScore,
  MatchedKeyword,
  MissingKeyword,
  Advice,
  CompatibilityScoreDetails,
} from '@/types/compatibility';

// ---------------------------------------------------------------------------
// Tuning constants — adjust here without touching the algorithm
// ---------------------------------------------------------------------------

/** Minimum token length (chars). Tokens shorter than this are discarded. */
export const MIN_KEYWORD_LENGTH = 4;

/**
 * Minimum normalised TF weight for a job-description term to be considered
 * a keyword. Weight is relative to the most frequent term (0–1 scale).
 * Used as default in scoreAxis; prefer adaptiveMinWeight() at call sites.
 */
export const MIN_KEYWORD_WEIGHT = 0.25;

/**
 * Returns a minWeight threshold adapted to the number of words in the job
 * description. Short ads are nosier (higher threshold); long ads contain
 * rare-but-important terms (lower threshold).
 */
export function adaptiveMinWeight(jobDescriptionLength: number): number {
  if (jobDescriptionLength < 150) return 0.40;
  if (jobDescriptionLength < 300) return 0.30;
  if (jobDescriptionLength < 500) return 0.20;
  return 0.15;
}

// ---------------------------------------------------------------------------
// Stop words (French + English) — filtered before TF computation
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  // ── Déterminants / pronoms français ────────────────────────────────────────
  'le','la','les','de','du','des','un','une','et','en','au','aux','ce','se','sa',
  'ses','son','qui','que','qu','ou','où','à','par','sur','sous','dans','avec',
  'pour','pas','ne','il','ils','elle','elles','nous','vous','je','tu','on',
  'vos','nos','mon','mes','votre','notre','leur','leurs','cette','cet','ces',
  'tel','tels','telle','telles','tout','tous','toute','toutes',
  // ── Adverbes / conjonctions / prépositions ──────────────────────────────────
  'mais','car','donc','très','plus','bien','même','aussi','ainsi','comme',
  'dont','lors','puis','afin','soit','selon','entre','vers','avant','après',
  'pendant','depuis','jusque','sans','chez','via','dès','sauf','chaque',
  'plusieurs','quelques','autre','autres','peu','beaucoup','environ','notamment',
  'voire','sinon','quand','lorsque','tandis','plutôt','toujours','souvent',
  'jamais','parfois','encore','déjà','trop','assez','moins','mieux',
  // ── Être / avoir / faire — formes conjuguées manquantes ────────────────────
  'être','avoir','faire','aller','pouvoir','vouloir','devoir',
  'suis','êtes','sommes','sont',
  'sera','serai','seras','serons','serez','seront',
  'serais','serait','serions','seriez','seraient',
  'avez','avons','ayez','ayons','aurez','aurons','aurai','auras','auront',
  'aurais','aurait','aurions','auriez','auraient',
  'fais','fait','faites','font','feras','ferez','feront','ferai','ferons',
  'soient','soions','soit',
  'étais','était','étions','étiez','étaient',
  // ── Verbes de formule d'annonce (conjugués) ────────────────────────────────
  'cherche','cherches','cherchez','cherchons','cherchent',
  'souhaite','souhaites','souhaitez','souhaitons','souhaitent',
  'rejoindre','rejoins','rejoint','rejoignez','rejoignons','rejoignent',
  'propose','proposes','proposez','proposons','proposent',
  'offrons','offrent','offrez',
  'recherchez','recherchons','recherchent',
  'intégrer','intégrez','intégrons','intègrent','intègre',
  'assurer','assurez','assurons','assurent','assure',
  'contribuer','contribuez','contribuons','contribuent','contribue',
  'participer','participez','participons','participent','participe',
  'collaborer','collaborez','collaborons','collaborent','collabore',
  'travailler','travaillez','travaillons','travaillent','travaille',
  'réaliser','réalisez','réalisons','réalisent','réalise',
  'gérer','gérez','gérons','gèrent','gère',
  'piloter','pilotez','pilotons','pilotent','pilote',
  'animer','animez','animons','animent','anime',
  'définir','définissez','définissons','définissent','définit',
  'mettre','mettez','mettons','mettent','mets',
  'permettre','permettez','permettons','permettent',
  'rejoignant','intégrant','contribuant','travaillant',
  // ── Mots génériques d'annonce RH (sans valeur de matching) ─────────────────
  'pleine','poste','profil','candidat','candidature','contexte',
  'idéal','idéale','idéaux','solent',
  // ── Anglais ─────────────────────────────────────────────────────────────────
  'the','a','an','and','or','of','to','in','is','it','its','for','on','at',
  'be','this','that','are','as','was','with','by','from','we','you','he','she',
  'they','have','has','had','not','but','if','will','can','may','our','your',
  'their','also','more','any','all','new','use','used','using','work','team',
  'strong','such','both','each','many','about','into','over','after','while',
  'where','when','who','what','which','how','than','then','do','does','did',
  'been','being','would','could','should','up','out','so','no','my','there',
  'these','those','very','well','just','get','one','two','three','year','years',
  'able','must','shall','need','want','like','good','best','great','make',
  'sure','help','join','look','take','give','come','know','keep','build',
]);

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Split text into lowercase tokens, stripping punctuation and stop words.
 * Returns individual words only (multi-word synonyms are handled separately).
 */
function tokenize(text: string, minKeywordLength = MIN_KEYWORD_LENGTH): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëîïôùûüçæœ/-]/g, ' ')
    .split(/[\s]+/)
    .map(t => t.replace(/^[-/]+|[-/]+$/g, ''))
    .filter(t => t.length >= minKeywordLength && !STOP_WORDS.has(t));
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * Fast non-cryptographic hash (djb2) — used only for stale-detection.
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep 32-bit unsigned
  }
  return hash.toString(36);
}

// ---------------------------------------------------------------------------
// TF with positional boosting
// ---------------------------------------------------------------------------

/**
 * Build a weighted term-frequency map from the job description.
 * Terms in the first third of the text receive a 1.5× positional boost
 * (they are more likely to be in the title / lead paragraph).
 * Returns a map of canonical-term → normalised weight ∈ (0, 1].
 */
function computeWeightedTF(
  text: string,
  synonymMap?: Map<string, string>,
  minKeywordLength = MIN_KEYWORD_LENGTH,
): Map<string, number> {
  const words = tokenize(text, minKeywordLength);
  const third = Math.floor(words.length / 3);
  const freq = new Map<string, number>();

  // Unigrams
  for (let i = 0; i < words.length; i++) {
    const canonical = getCanonical(words[i], synonymMap);
    const boost = i < third ? 1.5 : 1.0;
    freq.set(canonical, (freq.get(canonical) ?? 0) + boost);
  }

  // Bigrams (for two-word synonyms like "machine learning", "deep learning"…)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    const canonical = getCanonical(bigram, synonymMap);
    if (canonical !== bigram) {
      // Only count bigrams that are known synonyms to avoid noise
      const boost = i < third ? 1.5 : 1.0;
      freq.set(canonical, (freq.get(canonical) ?? 0) + boost * 2);
    }
  }

  // Normalise by maximum value
  const max = Math.max(...freq.values(), 1);
  const normalised = new Map<string, number>();
  for (const [term, count] of freq) {
    let weight = count / max;
    // Floor for rare (≤ 2 occurrences) but long (≥ 6 chars) terms: these are
    // likely specific technical keywords (e.g. "CyberArk", "EBIOS", "SailPoint")
    // that must not fall below the adaptive threshold just because they appear once.
    if (count <= 2 && term.length >= 6 && weight < 0.30) {
      weight = 0.30;
    }
    normalised.set(term, weight);
  }
  return normalised;
}

// ---------------------------------------------------------------------------
// CV content extraction
// ---------------------------------------------------------------------------

export interface CVEntry {
  entryId: string;
  title: string;
  subtitle: string;
  description: string;
  /** Full concatenated text for tokenisation */
  text: string;
}

function extractEntriesByType(
  blocks: CVBlock[],
  entries: MasterEntry[],
  types: string[],
): CVEntry[] {
  const visible = blocks
    .filter(b => b.isVisible && b.blockType === 'entry_ref' && b.entryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const result: CVEntry[] = [];
  for (const block of visible) {
    const entry = entries.find(e => e.id === block.entryId);
    if (!entry || !types.includes(entry.entryType)) continue;

    const data = { ...entry, ...(block.overrideData as Partial<MasterEntry>) };
    const title       = (data.title as string)       || entry.title       || '';
    const subtitle    = (data.subtitle as string)     || entry.subtitle    || '';
    const description = (data.description as string) || entry.description || '';
    const tags        = Array.isArray(entry.tags) ? entry.tags.join(' ') : '';

    result.push({
      entryId: entry.id,
      title,
      subtitle,
      description,
      text: `${title} ${subtitle} ${description} ${tags}`,
    });
  }
  return result;
}

export interface CVContent {
  skillEntries:      CVEntry[];
  experienceEntries: CVEntry[];
  educationEntries:  CVEntry[];
  allText: string;
  contentHash: string;
}

export function extractCVContent(blocks: CVBlock[], entries: MasterEntry[]): CVContent {
  const skillEntries      = extractEntriesByType(blocks, entries, ['skill', 'language', 'interest']);
  const experienceEntries = extractEntriesByType(blocks, entries, ['experience', 'project', 'volunteer']);
  const educationEntries  = extractEntriesByType(blocks, entries, ['education', 'certification']);

  const allText = [
    ...skillEntries,
    ...experienceEntries,
    ...educationEntries,
  ].map(e => e.text).join(' ');

  return { skillEntries, experienceEntries, educationEntries, allText, contentHash: hashString(allText) };
}

// ---------------------------------------------------------------------------
// Axis scoring
// ---------------------------------------------------------------------------

/**
 * For each weighted job term, check whether it (or any synonym) appears in
 * the given CV text. Builds matched / missing lists and computes a 0–100 score.
 *
 * @param minWeight  Terms below this threshold are ignored (noise filter).
 * @param synonymMap Optional user synonym map to use instead of the global one.
 * @param minKeywordLength Minimum token length for tokenisation.
 */
function scoreAxis(
  jobTerms: Map<string, number>,
  cvText: string,
  cvEntries: CVEntry[],
  minWeight = MIN_KEYWORD_WEIGHT,
  synonymMap?: Map<string, string>,
  minKeywordLength = MIN_KEYWORD_LENGTH,
): AxisScore {
  // Build token set for fast lookup (canonicalised)
  const cvTokens = new Set(tokenize(cvText, minKeywordLength).map(t => getCanonical(t, synonymMap)));
  // Also add bigrams from CV text for multi-word synonym matching
  const cvWords = tokenize(cvText, minKeywordLength);
  for (let i = 0; i < cvWords.length - 1; i++) {
    const bigram = `${cvWords[i]} ${cvWords[i + 1]}`;
    const canonical = getCanonical(bigram, synonymMap);
    if (canonical !== bigram) cvTokens.add(canonical);
  }

  const matched: MatchedKeyword[] = [];
  const missing: MissingKeyword[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const [term, weight] of jobTerms) {
    if (weight < minWeight) continue;
    totalWeight += weight;

    const variants = getAllVariants(term, synonymMap);
    let found = false;

    for (const variant of variants) {
      const canonicalVariant = getCanonical(variant, synonymMap);
      if (cvTokens.has(canonicalVariant)) {
        // Identify which entry contains this match
        let cvRef: MatchedKeyword['cvRef'];
        for (const entry of cvEntries) {
          const entryTokens = new Set(tokenize(entry.text, minKeywordLength).map(t => getCanonical(t, synonymMap)));
          if (entryTokens.has(canonicalVariant)) {
            cvRef = { entryId: entry.entryId, entryTitle: entry.title };
            break;
          }
        }

        matched.push({
          jobTerm: term,
          cvTerm: variant,
          isSynonym: variant !== term,
          weight,
          cvRef,
        });
        matchedWeight += weight;
        found = true;
        break;
      }
    }

    if (!found) {
      missing.push({ jobTerm: term, weight });
    }
  }

  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  return { score, matched, missing };
}

// ---------------------------------------------------------------------------
// Advice generation (anti-hallucination: only references actual CV content)
// ---------------------------------------------------------------------------

function buildAdvice(
  skillsAxis:     AxisScore,
  experienceAxis: AxisScore,
  educationAxis:  AxisScore,
  keywordsAxis:   AxisScore,
  synonymMap?: Map<string, string>,
): Advice[] {
  const advice: Advice[] = [];

  // --- 1. Synonym expansion hints (where CV uses a non-canonical form) ---
  const allMatched = [
    ...skillsAxis.matched.map(m => ({ ...m, axis: 'skills' as const })),
    ...experienceAxis.matched.map(m => ({ ...m, axis: 'experience' as const })),
    ...educationAxis.matched.map(m => ({ ...m, axis: 'education' as const })),
  ].sort((a, b) => b.weight - a.weight); // highest-weight first

  const seenSynonymTerms = new Set<string>();
  let synonymExpansionCount = 0;

  for (const m of allMatched) {
    if (!m.isSynonym) continue;
    if (seenSynonymTerms.has(m.jobTerm)) continue;
    if (synonymExpansionCount >= 5) break;

    seenSynonymTerms.add(m.jobTerm);
    synonymExpansionCount++;

    const context = m.cvRef ? ` dans "${m.cvRef.entryTitle}"` : '';
    advice.push({
      type: 'synonym_expansion',
      severity: 'low',
      axis: m.axis,
      message: `Tu utilises "${m.cvTerm}"${context} — l'annonce mentionne "${m.jobTerm}". Pour les ATS, ajoute aussi le terme exact.`,
      cvRef: m.cvRef,
    });
  }

  // --- 2. Missing keyword alerts (deduplicated across axes, highest weight wins) ---
  type MissingWithAxis = MissingKeyword & { axis: Advice['axis'] };
  const rawMissing: MissingWithAxis[] = [
    ...skillsAxis.missing.map(m => ({ ...m, axis: 'skills' as const })),
    ...experienceAxis.missing.map(m => ({ ...m, axis: 'experience' as const })),
    ...educationAxis.missing.map(m => ({ ...m, axis: 'education' as const })),
    ...keywordsAxis.missing.map(m => ({ ...m, axis: 'keywords' as const })),
  ];

  // Keep only the highest-weight axis entry per term
  const bestPerTerm = new Map<string, MissingWithAxis>();
  for (const m of rawMissing) {
    const existing = bestPerTerm.get(m.jobTerm);
    if (!existing || m.weight > existing.weight) bestPerTerm.set(m.jobTerm, m);
  }

  for (const { jobTerm, weight, axis } of bestPerTerm.values()) {
    const severity = weight > 0.7 ? 'high' : weight > 0.35 ? 'medium' : 'low';
    const axisLabel =
      axis === 'skills'     ? 'tes compétences' :
      axis === 'experience' ? 'tes expériences' :
      axis === 'education'  ? 'ta formation'    : 'ton CV';

    const actionable = getAllVariants(jobTerm, synonymMap).length > 1;
    const message = actionable
      ? `«${jobTerm}» est absent de ${axisLabel} — tu peux le couvrir en ajoutant une de ses variantes connues.`
      : `«${jobTerm}» est mentionné dans l'annonce mais absent de ${axisLabel} (terme spécifique sans équivalent connu dans ton CV).`;

    advice.push({
      type: 'missing_keyword',
      severity,
      axis,
      actionable,
      message,
    });
  }

  // Sort: high → medium → low, then synonym_expansion last
  const sevOrder = { high: 0, medium: 1, low: 2 };
  const typeOrder = { missing_keyword: 0, synonym_expansion: 1 };
  advice.sort((a, b) =>
    sevOrder[a.severity] - sevOrder[b.severity] ||
    typeOrder[a.type]    - typeOrder[b.type],
  );

  return advice.slice(0, 25);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScoringResult {
  scoreGlobal:     number;
  scoreSkills:     number;
  scoreExperience: number;
  scoreEducation:  number;
  scoreKeywords:   number;
  details:         CompatibilityScoreDetails;
  cvContentHash:      string;
  jobDescriptionHash: string;
}

export interface ScoringOptions {
  /** Override the minimum token length for tokenisation (default: MIN_KEYWORD_LENGTH = 4) */
  minKeywordLength?: number;
  /** Optional user synonym map built via buildSynonymMap() */
  synonymMap?: Map<string, string>;
}

/**
 * Compute a full compatibility score between a job description and a CV.
 *
 * Weights:
 *   Skills      35 %
 *   Experience  35 %
 *   Education   15 %
 *   Keywords    15 %   (global coverage across the entire CV)
 */
export function computeCompatibilityScore(
  jobDescription: string,
  blocks: CVBlock[],
  entries: MasterEntry[],
  options?: ScoringOptions,
): ScoringResult {
  const minKeywordLength = options?.minKeywordLength ?? MIN_KEYWORD_LENGTH;
  const synonymMap = options?.synonymMap;

  const cvContent  = extractCVContent(blocks, entries);
  const jobTerms   = computeWeightedTF(jobDescription, synonymMap, minKeywordLength);
  const wordCount  = jobDescription.split(/\s+/).length;
  const minWeight  = adaptiveMinWeight(wordCount);

  const skillsAxis     = scoreAxis(jobTerms, cvContent.skillEntries.map(e => e.text).join(' '),      cvContent.skillEntries,     minWeight, synonymMap, minKeywordLength);
  const experienceAxis = scoreAxis(jobTerms, cvContent.experienceEntries.map(e => e.text).join(' '), cvContent.experienceEntries, minWeight, synonymMap, minKeywordLength);
  const educationAxis  = scoreAxis(jobTerms, cvContent.educationEntries.map(e => e.text).join(' '),  cvContent.educationEntries,  minWeight, synonymMap, minKeywordLength);
  const keywordsAxis   = scoreAxis(jobTerms, cvContent.allText, [
    ...cvContent.skillEntries,
    ...cvContent.experienceEntries,
    ...cvContent.educationEntries,
  ], minWeight, synonymMap, minKeywordLength);

  const scoreGlobal = Math.round(
    skillsAxis.score     * 0.35 +
    experienceAxis.score * 0.35 +
    educationAxis.score  * 0.15 +
    keywordsAxis.score   * 0.15,
  );

  const details: CompatibilityScoreDetails = {
    axes: {
      skills:     skillsAxis,
      experience: experienceAxis,
      education:  educationAxis,
      keywords:   keywordsAxis,
    },
    advice: buildAdvice(skillsAxis, experienceAxis, educationAxis, keywordsAxis, synonymMap),
  };

  return {
    scoreGlobal,
    scoreSkills:     skillsAxis.score,
    scoreExperience: experienceAxis.score,
    scoreEducation:  educationAxis.score,
    scoreKeywords:   keywordsAxis.score,
    details,
    cvContentHash:      cvContent.contentHash,
    jobDescriptionHash: hashString(jobDescription),
  };
}
