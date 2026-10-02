import type { EntryType } from '@/types/profile';
import { isSectionHeader, isSubHeader, normalizeLabel } from './cv-sections';
import { normalizeLanguageCode } from './cv-language';

/**
 * Shared types + validator for the JSON returned by the "CV ciblé" LLM prompt
 * (`generateFullCVMatchPrompt`). This is the single source of truth used by every
 * consumer flow (job-watch drawer, cv-builder AI panel) so the prompt, the type
 * and the parsing never drift apart.
 *
 * Design notes:
 * - Backward compatible: the historical schema `{ title, summary, entries:[{id,
 *   visible, description}] }` parses unchanged. New override fields and
 *   `suggestedEntries` are optional.
 * - Non destructive: overrides live on the generated CV (cv_blocks.override_data),
 *   never on the master entry. `aiEntryToOverrideData` only maps display fields.
 * - Robust: every field is validated/sanitised individually. Malformed sub-fields
 *   are dropped silently (clean fallback). We only throw when the payload is not
 *   valid JSON or not a JSON object, so callers keep their "JSON invalide" toast.
 */

const VALID_ENTRY_TYPES: readonly EntryType[] = [
  'experience',
  'education',
  'skill',
  'certification',
  'language',
  'interest',
  'project',
  'volunteer',
];

/** A reference to an existing master entry, with optional display overrides. */
export interface AiCvEntry {
  /** ID of an existing master entry. */
  id: string;
  /** Whether the entry should be shown. Only an explicit `false` hides it. */
  visible: boolean;
  /** Reworded description (markdown / bullet list). */
  description?: string;
  /**
   * Non-destructive override of the displayed primary label. Maps to `title`.
   * Works for ANY entry type: job title, reworded skill label, certification
   * name, interest label, etc.
   */
  titleOverride?: string;
  /**
   * Non-destructive override of the displayed company name (experiences).
   * Maps to `subtitle`. Kept for backward compatibility — prefer
   * `subtitleOverride` for non-experience entries.
   */
  companyOverride?: string;
  /**
   * Non-destructive override of the displayed secondary label. Maps to
   * `subtitle`. Works for any type: company, school, normalised language level
   * (e.g. "Courant - C1"), certification issuer, etc. Takes precedence over
   * `companyOverride` when both are present.
   */
  subtitleOverride?: string;
  /** Non-destructive verbatim override of the displayed dates. */
  datesOverride?: string;
}

/** A thematic grouping of skill entries proposed by the LLM (restructuration). */
export interface AiSkillGroup {
  /** Category label shown as a sub-section header (e.g. "Langages", "Outils"). */
  category: string;
  /** Ordered IDs of existing skill master entries belonging to this category. */
  entryIds: string[];
}

/** An entry suggested by the LLM that is NOT in the master profile yet. */
export interface AiCvSuggestedEntry {
  entryType: EntryType;
  title: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  /** Why the LLM thinks it's relevant — shown in the review UI, not persisted. */
  reason?: string;
}

/** Correspondance exigence de l'annonce / entrée du profil qui l'étaye (`null` : aucune preuve). */
export interface AiCvMatch {
  exigence: string;
  entryId: string | null;
}

/**
 * Analyse préalable de l'annonce, rendue par l'IA avant `entries` (schéma v2).
 * Sert au contrôle post-LLM (couverture, écarts) et à la langue du CV ; elle
 * n'est jamais écrite dans le CV.
 */
export interface AiCvAnalyse {
  /** Code ISO 639-1 de la langue de l'annonce (`fr`, `en`…), normalisé ; absent si illisible. */
  langueAnnonce?: string;
  indispensables: string[];
  importants: string[];
  correspondances: AiCvMatch[];
  /** Exigences indispensables sans preuve dans le profil : signalées, jamais comblées. */
  ecarts: string[];
}

export interface AiCvResponse {
  /** Version du schéma (2 = analyse + sectionLabels + warnings). Absente pour l'ancien schéma. */
  schemaVersion?: number;
  analyse?: AiCvAnalyse;
  title?: string;
  summary?: string;
  entries: AiCvEntry[];
  suggestedEntries: AiCvSuggestedEntry[];
  /**
   * Optional re-ordering of entries by relevance. List of master entry IDs in
   * the desired display order. Entries omitted here keep their relative order
   * after the ranked ones (within their own section). Restructuration — never
   * destructive (applied via cv_blocks sort_order only).
   */
  entryOrder?: string[];
  /**
   * Optional re-ordering of sections by relevance. List of section labels (e.g.
   * "Compétences", "Expériences Professionnelles") in the desired order.
   */
  sectionOrder?: string[];
  /**
   * Optional thematic regrouping of the skills section. Each group becomes a
   * sub-section header followed by its skill badges.
   */
  skillGroups?: AiSkillGroup[];
  /**
   * Libellés de sections dans la langue cible, par identifiant de section
   * (ex. `{ "Compétences": "Skills" }`). Appliqués via `sectionName` sur les
   * en-têtes du CV ; les identifiants internes ne changent pas.
   */
  sectionLabels?: Record<string, string>;
  /** Avertissements et questions de quantification de l'IA (affichés, jamais appliqués). */
  warnings?: string[];
}

/** Returns a trimmed non-empty string, or `undefined`. */
function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEntry(raw: unknown): AiCvEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = cleanString(record.id);
  if (!id) return null;

  const entry: AiCvEntry = {
    id,
    // Default to visible; only an explicit `false` hides the entry (legacy semantics).
    visible: record.visible !== false,
  };

  // Description may legitimately contain newlines/bullets — keep it as-is.
  if (typeof record.description === 'string') entry.description = record.description;

  const titleOverride = cleanString(record.titleOverride);
  if (titleOverride) entry.titleOverride = titleOverride;

  const companyOverride = cleanString(record.companyOverride);
  if (companyOverride) entry.companyOverride = companyOverride;

  const subtitleOverride = cleanString(record.subtitleOverride);
  if (subtitleOverride) entry.subtitleOverride = subtitleOverride;

  const datesOverride = cleanString(record.datesOverride);
  if (datesOverride) entry.datesOverride = datesOverride;

  return entry;
}

function parseSuggestedEntry(raw: unknown): AiCvSuggestedEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const title = cleanString(record.title);
  const entryType = cleanString(record.entryType) as EntryType | undefined;
  if (!title || !entryType || !VALID_ENTRY_TYPES.includes(entryType)) return null;

  const suggestion: AiCvSuggestedEntry = { entryType, title };

  const subtitle = cleanString(record.subtitle);
  if (subtitle) suggestion.subtitle = subtitle;

  const startDate = cleanString(record.startDate);
  if (startDate) suggestion.startDate = startDate;

  const endDate = cleanString(record.endDate);
  if (endDate) suggestion.endDate = endDate;

  if (typeof record.isCurrent === 'boolean') suggestion.isCurrent = record.isCurrent;

  if (typeof record.description === 'string' && record.description.trim()) {
    suggestion.description = record.description;
  }

  const reason = cleanString(record.reason);
  if (reason) suggestion.reason = reason;

  return suggestion;
}

/** Returns a deduplicated list of trimmed non-empty strings, or `undefined`. */
function parseStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const s = cleanString(item);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.length > 0 ? out : undefined;
}

function parseSkillGroup(raw: unknown): AiSkillGroup | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const category = cleanString(record.category);
  const entryIds = parseStringList(record.entryIds);
  if (!category || !entryIds) return null;
  return { category, entryIds };
}

function parseSkillGroups(raw: unknown): AiSkillGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const groups = raw.map(parseSkillGroup).filter((g): g is AiSkillGroup => g !== null);
  return groups.length > 0 ? groups : undefined;
}

function parseAnalyse(raw: unknown): AiCvAnalyse | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const correspondances = Array.isArray(record.correspondances)
    ? record.correspondances
        .map((item): AiCvMatch | null => {
          if (item === null || typeof item !== 'object') return null;
          const r = item as Record<string, unknown>;
          const exigence = cleanString(r.exigence);
          if (!exigence) return null;
          return { exigence, entryId: cleanString(r.entryId) ?? null };
        })
        .filter((m): m is AiCvMatch => m !== null)
    : [];
  const analyse: AiCvAnalyse = {
    indispensables: parseStringList(record.indispensables) ?? [],
    importants: parseStringList(record.importants) ?? [],
    correspondances,
    ecarts: parseStringList(record.ecarts) ?? [],
  };
  const lang = normalizeLanguageCode(record.langue_annonce ?? record.langueAnnonce);
  if (lang) analyse.langueAnnonce = lang;
  const hasContent =
    analyse.langueAnnonce !== undefined || analyse.indispensables.length > 0 || analyse.importants.length > 0 ||
    analyse.correspondances.length > 0 || analyse.ecarts.length > 0;
  return hasContent ? analyse : undefined;
}

function parseSectionLabels(raw: unknown): Record<string, string> | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = cleanString(value);
    if (key.trim() && label) out[key.trim()] = label;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Extrait le premier objet JSON équilibré d'un texte (la réponse d'un LLM peut
 * contenir du texte avant/après, des fences markdown, des accolades parasites).
 * Respecte les chaînes JSON (accolades et guillemets échappés). Retourne `null`
 * si aucun objet valide n'est trouvé.
 */
export function extractJsonObject(text: string): string | null {
  const MAX_STARTS = 25;
  let attempts = 0;
  for (let start = text.indexOf('{'); start !== -1 && attempts < MAX_STARTS; start = text.indexOf('{', start + 1)) {
    attempts++;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            const parsed: unknown = JSON.parse(candidate);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return candidate;
          } catch {
            /* candidat invalide : on essaie l'accolade suivante */
          }
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Parses and validates the raw LLM output. Tolerates markdown code fences and
 * surrounding prose (the first balanced JSON object is extracted); unknown
 * fields are ignored.
 * @throws {SyntaxError} when no valid JSON object can be found.
 */
export function parseAiCvResponse(raw: string): AiCvResponse {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const extracted = extractJsonObject(cleaned);
    if (extracted === null) throw new SyntaxError('JSON invalide');
    parsed = JSON.parse(extracted);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('La réponse de l\'IA doit être un objet JSON');
  }

  const obj = parsed as Record<string, unknown>;

  const entries = Array.isArray(obj.entries)
    ? obj.entries.map(parseEntry).filter((e): e is AiCvEntry => e !== null)
    : [];

  const suggestedEntries = Array.isArray(obj.suggestedEntries)
    ? obj.suggestedEntries
        .map(parseSuggestedEntry)
        .filter((s): s is AiCvSuggestedEntry => s !== null)
    : [];

  const response: AiCvResponse = {
    title: cleanString(obj.title),
    summary: cleanString(obj.summary),
    entries,
    suggestedEntries,
  };

  if (typeof obj.schemaVersion === 'number' && Number.isFinite(obj.schemaVersion)) {
    response.schemaVersion = obj.schemaVersion;
  }

  const analyse = parseAnalyse(obj.analyse);
  if (analyse) response.analyse = analyse;

  const entryOrder = parseStringList(obj.entryOrder);
  if (entryOrder) response.entryOrder = entryOrder;

  const sectionOrder = parseStringList(obj.sectionOrder);
  if (sectionOrder) response.sectionOrder = sectionOrder;

  const skillGroups = parseSkillGroups(obj.skillGroups);
  if (skillGroups) response.skillGroups = skillGroups;

  const sectionLabels = parseSectionLabels(obj.sectionLabels);
  if (sectionLabels) response.sectionLabels = sectionLabels;

  const warnings = parseStringList(obj.warnings);
  if (warnings) response.warnings = warnings;

  return response;
}

/**
 * Builds the `override_data` patch for a CV block from an AI entry, merging over
 * any existing overrides (additive / non-destructive). Display fields map onto the
 * generic merge keys consumed at render time (`{ ...entry, ...overrideData }`):
 * - `titleOverride`   → `title`
 * - `companyOverride` → `subtitle`
 * - `datesOverride`   → `datesOverride` (rendered verbatim when present)
 */
export function aiEntryToOverrideData(
  aiEntry: AiCvEntry,
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...(existing ?? {}) };

  if (aiEntry.description !== undefined) patch.description = aiEntry.description;
  if (aiEntry.titleOverride !== undefined) patch.title = aiEntry.titleOverride;
  if (aiEntry.companyOverride !== undefined) patch.subtitle = aiEntry.companyOverride;
  // Generic secondary-label override; wins over companyOverride when both are set.
  if (aiEntry.subtitleOverride !== undefined) patch.subtitle = aiEntry.subtitleOverride;
  if (aiEntry.datesOverride !== undefined) patch.datesOverride = aiEntry.datesOverride;

  return patch;
}

// ── Non-destructive restructuration (ordering + skill grouping) ──────────────

/** Minimal shape of a CV block needed to compute a new flat ordering. */
export interface OrderableBlock {
  id: string;
  blockType: 'section_header' | 'entry_ref' | 'custom_text';
  sectionName: string | null;
  entryId: string | null;
  /** `level: 'sub'` marque un sous-en-tête ; `sectionKey` l'identifiant interne d'une section renommée. */
  overrideData?: Record<string, unknown> | null;
}

/** A resolved skill group: its sub-header block (existing or just created) + its entry IDs. */
export interface SkillGroupPlan {
  /** ID of the sub-header block (`level: 'sub'`) acting as this group's label. */
  headerBlockId: string;
  /** Ordered IDs of the skill master entries in this group. */
  entryIds: string[];
}

/**
 * Stable sort by an optional numeric rank. Items with a defined rank come first
 * (in rank order); items without keep their original relative order, after the
 * ranked ones.
 */
function stableRank<T>(arr: T[], rankOf: (x: T) => number | undefined): T[] {
  return arr
    .map((x, i) => ({ x, i, r: rankOf(x) }))
    .sort((a, b) => {
      if (a.r === undefined && b.r === undefined) return a.i - b.i;
      if (a.r === undefined) return 1;
      if (b.r === undefined) return -1;
      return a.r - b.r || a.i - b.i;
    })
    .map(o => o.x);
}

/** Names under which a section header can be referenced by `sectionOrder`. */
function sectionAliases(header: OrderableBlock, labels: Record<string, string> | undefined): string[] {
  const names = new Set<string>();
  const add = (v: unknown) => { if (typeof v === 'string' && v.trim()) names.add(normalizeLabel(v)); };
  add(header.sectionName);
  add(header.overrideData?.sectionKey);
  if (labels) {
    const own = [header.sectionName, header.overrideData?.sectionKey].filter((v): v is string => typeof v === 'string');
    for (const [from, to] of Object.entries(labels)) {
      if (own.some(o => normalizeLabel(o) === normalizeLabel(from))) add(to);
    }
  }
  return [...names];
}

/**
 * Computes a new flat ordering of cv_blocks IDs from the AI restructuration
 * directives. Pure and non-destructive: it only reshuffles existing block IDs
 * (consumed by `reorderCvBlocks`) — nothing is created or deleted here.
 *
 * Contract:
 * - Section headers are blocks that are NOT sub-headers; sub-headers
 *   (`overrideData.level === 'sub'`) never start a section.
 * - `skillsHeaderId` is the section header of the skills section, which keeps its
 *   label. Every `skillGroups[i].headerBlockId` (a sub-header block) is pulled out
 *   of wherever it sits and embedded under that section, followed by its skills.
 *   Skills outside any group stay first (no label), stale sub-headers last.
 * - Every input block ID appears exactly once in the output.
 */
export function planCvBlockOrder(
  blocks: OrderableBlock[],
  opts: {
    entryOrder?: string[];
    sectionOrder?: string[];
    /** Libellés cibles par identifiant de section : `sectionOrder` peut employer l'un ou l'autre. */
    sectionLabels?: Record<string, string>;
    skillsHeaderId?: string;
    skillGroups?: SkillGroupPlan[];
  },
): string[] {
  const groups = opts.skillGroups ?? [];
  const groupHeaderIds = new Set(groups.map(g => g.headerBlockId));
  const pulledHeaders = new Map<string, OrderableBlock>();

  interface Section { header: OrderableBlock | null; items: OrderableBlock[]; }
  const preamble: OrderableBlock[] = [];
  let sections: Section[] = [];
  let current: Section | null = null;

  // 1. Partition into sections (sub-headers do not start one); skill group
  //    sub-headers are pulled aside, to be re-embedded under the skills section.
  for (const b of blocks) {
    if (b.blockType === 'section_header' && groupHeaderIds.has(b.id)) {
      pulledHeaders.set(b.id, b);
      continue;
    }
    if (isSectionHeader(b)) {
      current = { header: b, items: [] };
      sections.push(current);
    } else if (current) {
      current.items.push(b);
    } else {
      preamble.push(b);
    }
  }

  // 2. Re-order entries within each section (and within each sub-header segment).
  if (opts.entryOrder?.length) {
    const rank = new Map(opts.entryOrder.map((id, i) => [id, i] as const));
    const rankOf = (b: OrderableBlock) => (b.entryId != null ? rank.get(b.entryId) : undefined);
    for (const s of sections) {
      const out: OrderableBlock[] = [];
      let segment: OrderableBlock[] = [];
      const flush = () => { out.push(...stableRank(segment, rankOf)); segment = []; };
      for (const it of s.items) {
        if (isSubHeader(it)) { flush(); out.push(it); } else segment.push(it);
      }
      flush();
      s.items = out;
    }
  }

  // 3. Regroup the skills section under its category sub-headers.
  if (groups.length && opts.skillsHeaderId) {
    const skills = sections.find(s => s.header && s.header.id === opts.skillsHeaderId);
    if (skills) {
      const byEntryId = new Map<string, OrderableBlock>();
      for (const it of skills.items) if (it.entryId && !byEntryId.has(it.entryId)) byEntryId.set(it.entryId, it);
      const used = new Set<string>();
      const grouped: OrderableBlock[] = [];
      for (const g of groups) {
        const hb = pulledHeaders.get(g.headerBlockId);
        if (hb) grouped.push(hb);
        for (const eid of g.entryIds) {
          const it = byEntryId.get(eid);
          if (it && !used.has(it.id)) {
            grouped.push(it);
            used.add(it.id);
          }
        }
      }
      const leftover = skills.items.filter(it => !used.has(it.id));
      const stale = leftover.filter(isSubHeader);
      const ungrouped = leftover.filter(it => !isSubHeader(it));
      skills.items = [...ungrouped, ...grouped, ...stale];
      for (const id of groupHeaderIds) pulledHeaders.delete(id);
    }
  }

  // 4. Re-order sections.
  if (opts.sectionOrder?.length) {
    const rank = new Map(opts.sectionOrder.map((name, i) => [normalizeLabel(name), i] as const));
    sections = stableRank(sections, s => {
      if (!s.header) return undefined;
      const ranks = sectionAliases(s.header, opts.sectionLabels)
        .map(n => rank.get(n))
        .filter((r): r is number => r !== undefined);
      return ranks.length > 0 ? Math.min(...ranks) : undefined;
    });
  }

  // 5. Flatten.
  const out: string[] = preamble.map(b => b.id);
  for (const s of sections) {
    if (s.header) out.push(s.header.id);
    for (const it of s.items) out.push(it.id);
  }
  // Safety net: never drop a block (e.g. a sub-header whose skills section is missing).
  const emitted = new Set(out);
  for (const b of blocks) if (!emitted.has(b.id)) out.push(b.id);
  return out;
}
