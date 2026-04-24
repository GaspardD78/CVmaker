/**
 * AI Filter — deterministic rule layer applied on top of the scorer.
 *
 * Phase 3 of the First2Apply integration. Users describe their intent in
 * natural language, run the generated prompt through any LLM of their
 * choice (ChatGPT, Claude, Gemini…) and paste the returned JSON back into
 * the app. No API key, no backend call — the LLM runs outside the app and
 * its output is applied locally as a pure data rule.
 *
 * Design goals:
 *   - Deterministic: same rule + same offer → same adjustment.
 *   - Auditable: every clause is explicit JSON, the user can edit it by hand.
 *   - Bounded: hard caps prevent a malformed rule from wrecking the scoring.
 *
 * The rule is layered between Couche 0 (hard disqualifiers) and Couche 1
 * (title match) of the scorer:
 *   1. `excludeIf*` arrays act as extra hard disqualifiers (→ score 0).
 *   2. `boostIf*` / `penalizeIf*` contribute a bounded delta.
 */
export const AI_FILTER_SCHEMA_VERSION = '1.0';

/** A single weighted pattern — regex or substring, matched case-insensitively. */
export interface WeightedPattern {
  /** Pattern to match (substring, case-insensitive). Regex if wrapped in /…/. */
  pattern: string;
  /** Weight delta applied if the pattern matches. Clamped by maxBoost/maxPenalty. */
  weight: number;
  /** Optional reason surfaced in the scoring breakdown for transparency. */
  reason?: string;
}

export interface AIFilterRule {
  /** Schema version for forward compatibility. */
  version: typeof AI_FILTER_SCHEMA_VERSION;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Optional description of the intent that produced the rule. */
  description?: string;
  /** ISO 8601 UTC creation timestamp. */
  createdAt?: string;

  // ── Hard exclusions (→ score 0, disqualified) ────────────────────────────
  excludeIfTitle?: string[];
  excludeIfCompany?: string[];
  excludeIfDescription?: string[];
  excludeIfLocation?: string[];

  // ── Soft adjustments (bounded delta) ─────────────────────────────────────
  boostIfTitleContains?: WeightedPattern[];
  boostIfDescriptionContains?: WeightedPattern[];
  boostIfCompany?: WeightedPattern[];

  penalizeIfTitleContains?: WeightedPattern[];
  penalizeIfDescriptionContains?: WeightedPattern[];

  /** Cap on total positive contribution (default 20). */
  maxBoost?: number;
  /** Cap on total negative contribution (default 20, stored as positive). */
  maxPenalty?: number;
}

export interface AIFilterMatch {
  pattern: string;
  weight: number;
  reason?: string;
}

export interface AIFilterResult {
  /** True if any `excludeIf*` clause matched (offer should be disqualified). */
  disqualified: boolean;
  disqualifyReason?: string;
  /** Bounded score delta (sum of boosts and penalties, clamped). */
  delta: number;
  /** Diagnostic list of every matching clause, for UI surfacing. */
  matches: AIFilterMatch[];
}

// ── Pattern matching ──────────────────────────────────────────────────────────

/**
 * Turns a user-provided pattern into a matcher. Recognises regex syntax
 * when the pattern is wrapped in /…/flags, otherwise falls back to a
 * case-insensitive substring search.
 */
function compile(pattern: string): (text: string) => boolean {
  if (!pattern || pattern.length === 0) return () => false;
  const regexMatch = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
  if (regexMatch) {
    try {
      const flags = regexMatch[2].includes('i') ? regexMatch[2] : regexMatch[2] + 'i';
      const re = new RegExp(regexMatch[1], flags);
      return (text) => re.test(text);
    } catch {
      // Malformed regex → fallback to substring
    }
  }
  const needle = pattern.toLowerCase();
  return (text) => text.toLowerCase().includes(needle);
}

function matchAny(patterns: string[] | undefined, text: string): string | null {
  if (!patterns || patterns.length === 0 || !text) return null;
  for (const p of patterns) {
    if (compile(p)(text)) return p;
  }
  return null;
}

function applyWeighted(
  patterns: WeightedPattern[] | undefined,
  text: string,
  sign: 1 | -1,
  matches: AIFilterMatch[],
): number {
  if (!patterns || patterns.length === 0 || !text) return 0;
  let total = 0;
  for (const { pattern, weight, reason } of patterns) {
    if (typeof weight !== 'number' || !Number.isFinite(weight)) continue;
    if (compile(pattern)(text)) {
      const delta = sign * Math.abs(weight);
      total += delta;
      matches.push({ pattern, weight: delta, reason });
    }
  }
  return total;
}

// ── Rule validation & normalisation ───────────────────────────────────────────

/**
 * Validates and normalises an AI filter rule parsed from user input.
 * Throws a descriptive error when the JSON does not match the schema.
 */
export function validateAIFilterRule(raw: unknown): AIFilterRule {
  if (!raw || typeof raw !== 'object') {
    throw new Error('La règle doit être un objet JSON.');
  }
  const r = raw as Record<string, unknown>;

  if (r.version !== AI_FILTER_SCHEMA_VERSION) {
    throw new Error(`Version non supportée: attendue "${AI_FILTER_SCHEMA_VERSION}", reçue "${String(r.version)}".`);
  }
  if (typeof r.name !== 'string' || r.name.trim().length === 0) {
    throw new Error('Le champ "name" est requis.');
  }

  const asStringArray = (key: string): string[] | undefined => {
    if (r[key] === undefined || r[key] === null) return undefined;
    if (!Array.isArray(r[key])) throw new Error(`Le champ "${key}" doit être un tableau de chaînes.`);
    return (r[key] as unknown[]).map(v => {
      if (typeof v !== 'string') throw new Error(`Tous les éléments de "${key}" doivent être des chaînes.`);
      return v;
    });
  };

  const asWeightedArray = (key: string): WeightedPattern[] | undefined => {
    if (r[key] === undefined || r[key] === null) return undefined;
    if (!Array.isArray(r[key])) throw new Error(`Le champ "${key}" doit être un tableau.`);
    return (r[key] as unknown[]).map((v, i) => {
      if (!v || typeof v !== 'object') {
        throw new Error(`"${key}[${i}]" doit être un objet { pattern, weight }.`);
      }
      const w = v as Record<string, unknown>;
      if (typeof w.pattern !== 'string' || w.pattern.length === 0) {
        throw new Error(`"${key}[${i}].pattern" doit être une chaîne non vide.`);
      }
      if (typeof w.weight !== 'number' || !Number.isFinite(w.weight)) {
        throw new Error(`"${key}[${i}].weight" doit être un nombre fini.`);
      }
      return {
        pattern: w.pattern,
        weight: w.weight,
        reason: typeof w.reason === 'string' ? w.reason : undefined,
      };
    });
  };

  return {
    version: AI_FILTER_SCHEMA_VERSION,
    name: r.name.trim(),
    description: typeof r.description === 'string' ? r.description : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    excludeIfTitle: asStringArray('excludeIfTitle'),
    excludeIfCompany: asStringArray('excludeIfCompany'),
    excludeIfDescription: asStringArray('excludeIfDescription'),
    excludeIfLocation: asStringArray('excludeIfLocation'),
    boostIfTitleContains: asWeightedArray('boostIfTitleContains'),
    boostIfDescriptionContains: asWeightedArray('boostIfDescriptionContains'),
    boostIfCompany: asWeightedArray('boostIfCompany'),
    penalizeIfTitleContains: asWeightedArray('penalizeIfTitleContains'),
    penalizeIfDescriptionContains: asWeightedArray('penalizeIfDescriptionContains'),
    maxBoost: typeof r.maxBoost === 'number' && r.maxBoost >= 0 ? r.maxBoost : undefined,
    maxPenalty: typeof r.maxPenalty === 'number' && r.maxPenalty >= 0 ? r.maxPenalty : undefined,
  };
}

// ── Application against an offer ──────────────────────────────────────────────

export interface FilterableOffer {
  title: string;
  company: string | null;
  descriptionSnippet: string | null;
  location: string | null;
}

const DEFAULT_MAX_BOOST = 20;
const DEFAULT_MAX_PENALTY = 20;

export function applyAIFilter(
  rule: AIFilterRule | null | undefined,
  offer: FilterableOffer,
): AIFilterResult {
  const empty: AIFilterResult = { disqualified: false, delta: 0, matches: [] };
  if (!rule) return empty;

  const title = offer.title ?? '';
  const company = offer.company ?? '';
  const description = offer.descriptionSnippet ?? '';
  const location = offer.location ?? '';

  // ── Hard exclusions ────────────────────────────────────────────────────────
  const excl =
    (matchAny(rule.excludeIfTitle, title) && { where: 'titre', pattern: matchAny(rule.excludeIfTitle, title)! }) ||
    (matchAny(rule.excludeIfCompany, company) && { where: 'entreprise', pattern: matchAny(rule.excludeIfCompany, company)! }) ||
    (matchAny(rule.excludeIfDescription, description) && { where: 'description', pattern: matchAny(rule.excludeIfDescription, description)! }) ||
    (matchAny(rule.excludeIfLocation, location) && { where: 'lieu', pattern: matchAny(rule.excludeIfLocation, location)! });

  if (excl) {
    return {
      disqualified: true,
      disqualifyReason: `AI filter: "${excl.pattern}" dans ${excl.where}`,
      delta: 0,
      matches: [],
    };
  }

  // ── Soft adjustments ──────────────────────────────────────────────────────
  const matches: AIFilterMatch[] = [];
  let boost = 0;
  let penalty = 0;

  boost += applyWeighted(rule.boostIfTitleContains, title, 1, matches);
  boost += applyWeighted(rule.boostIfDescriptionContains, description, 1, matches);
  boost += applyWeighted(rule.boostIfCompany, company, 1, matches);

  penalty += applyWeighted(rule.penalizeIfTitleContains, title, -1, matches);
  penalty += applyWeighted(rule.penalizeIfDescriptionContains, description, -1, matches);

  const maxBoost = rule.maxBoost ?? DEFAULT_MAX_BOOST;
  const maxPenalty = rule.maxPenalty ?? DEFAULT_MAX_PENALTY;

  const cappedBoost = Math.min(maxBoost, boost);
  const cappedPenalty = Math.max(-maxPenalty, penalty); // penalty is already negative

  return {
    disqualified: false,
    delta: cappedBoost + cappedPenalty,
    matches,
  };
}

// ── Prompt generator ──────────────────────────────────────────────────────────

/**
 * Builds the instruction that the user pastes into their LLM of choice.
 * The prompt spells out the exact JSON schema and asks the model to
 * return only JSON — any prose is rejected by `validateAIFilterRule`.
 */
export function buildAIFilterPrompt(userIntent: string): string {
  return `Tu es un assistant qui traduit une intention de recherche d'emploi en une règle de filtrage JSON déterministe.

# INTENTION DE L'UTILISATEUR
${userIntent.trim()}

# TÂCHE
Génère un objet JSON strictement conforme au schéma ci-dessous. Renvoie UNIQUEMENT le JSON, sans texte avant ni après, sans commentaires Markdown.

# SCHÉMA (TypeScript)
\`\`\`typescript
interface AIFilterRule {
  version: "${AI_FILTER_SCHEMA_VERSION}";
  name: string;                          // nom court, ex: "Dev React senior remote"
  description?: string;                  // reprise concise de l'intention
  createdAt?: string;                    // ISO 8601, optionnel

  // Exclusions strictes (disqualifient l'offre si une correspondance est trouvée)
  excludeIfTitle?: string[];             // ex: ["stage", "alternance", "apprenti"]
  excludeIfCompany?: string[];           // ex: ["BNP", "Société Générale"]
  excludeIfDescription?: string[];
  excludeIfLocation?: string[];

  // Bonus / malus bornés (weight positif, appliqué avec signe par l'app)
  boostIfTitleContains?: Array<{ pattern: string; weight: number; reason?: string }>;
  boostIfDescriptionContains?: Array<{ pattern: string; weight: number; reason?: string }>;
  boostIfCompany?: Array<{ pattern: string; weight: number; reason?: string }>;
  penalizeIfTitleContains?: Array<{ pattern: string; weight: number; reason?: string }>;
  penalizeIfDescriptionContains?: Array<{ pattern: string; weight: number; reason?: string }>;

  maxBoost?: number;    // plafond total des boosts, défaut 20
  maxPenalty?: number;  // plafond total des pénalités, défaut 20
}
\`\`\`

# CONTRAINTES
- Les \`pattern\` sont des sous-chaînes insensibles à la casse par défaut. Pour une regex, encadre-la de \`/…/flags\`, ex: \`"/senior|lead/i"\`.
- Les \`weight\` sont des entiers entre 1 et 15.
- Privilégie 3 à 8 exclusions et 3 à 6 boosts/pénalités ciblés. Pas de listes exhaustives.
- N'utilise pas la \`description\` pour des signaux de compétences techniques qui figurent déjà dans le titre (redondant).
- Sois spécifique : préfère \`"développeur junior"\` à \`"junior"\` seul.

# EXEMPLE
Intention: "Je cherche un poste senior en React/TypeScript, idéalement en remote, pas d'alternance ni de stage, éviter les banques et assurances."

Sortie attendue:
\`\`\`json
{
  "version": "${AI_FILTER_SCHEMA_VERSION}",
  "name": "React senior remote",
  "description": "Senior React/TS remote — exclure alternance, stage, banque, assurance",
  "excludeIfTitle": ["stage", "alternance", "apprenti", "junior"],
  "excludeIfCompany": ["BNP", "Société Générale", "Crédit Agricole", "AXA", "Allianz"],
  "boostIfTitleContains": [
    { "pattern": "senior", "weight": 10, "reason": "Séniorité souhaitée" },
    { "pattern": "lead", "weight": 8 },
    { "pattern": "/remote|télétravail/i", "weight": 6, "reason": "Remote préféré" }
  ],
  "penalizeIfDescriptionContains": [
    { "pattern": "sur site", "weight": 5, "reason": "Préférence remote" }
  ],
  "maxBoost": 20,
  "maxPenalty": 15
}
\`\`\`

Maintenant, produis le JSON pour l'intention fournie.`;
}
