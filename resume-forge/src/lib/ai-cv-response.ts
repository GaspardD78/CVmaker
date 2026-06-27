import type { EntryType } from '@/types/profile';

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

export interface AiCvResponse {
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

/**
 * Parses and validates the raw LLM output. Strips markdown code fences.
 * @throws {SyntaxError} when the payload is not valid JSON or not a JSON object.
 */
export function parseAiCvResponse(raw: string): AiCvResponse {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new SyntaxError('JSON invalide');
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

  const entryOrder = parseStringList(obj.entryOrder);
  if (entryOrder) response.entryOrder = entryOrder;

  const sectionOrder = parseStringList(obj.sectionOrder);
  if (sectionOrder) response.sectionOrder = sectionOrder;

  const skillGroups = parseSkillGroups(obj.skillGroups);
  if (skillGroups) response.skillGroups = skillGroups;

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
}

/** A resolved skill group: the (already created) header block + its entry IDs. */
export interface SkillGroupPlan {
  /** ID of the section_header block acting as this group's sub-header. */
  headerBlockId: string;
  /** Ordered IDs of the skill master entries in this group. */
  entryIds: string[];
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
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

/**
 * Computes a new flat ordering of cv_blocks IDs from the AI restructuration
 * directives. Pure and non-destructive: it only reshuffles existing block IDs
 * (consumed by `reorderCvBlocks`) — nothing is created or deleted here.
 *
 * Contract:
 * - `skillGroups[0].headerBlockId` MUST be the EXISTING skills section header
 *   (renamed to the first category by the caller). The remaining groups'
 *   `headerBlockId` are newly created sub-header blocks; they are pulled out of
 *   the section flow and re-embedded inside the skills section.
 * - Every input block ID is guaranteed to appear exactly once in the output.
 */
export function planCvBlockOrder(
  blocks: OrderableBlock[],
  opts: {
    entryOrder?: string[];
    sectionOrder?: string[];
    skillGroups?: SkillGroupPlan[];
  },
): string[] {
  const groups = opts.skillGroups ?? [];
  const subHeaderIds = new Set(groups.slice(1).map(g => g.headerBlockId));
  const subHeaderById = new Map<string, OrderableBlock>();

  interface Section { header: OrderableBlock | null; items: OrderableBlock[]; }
  const preamble: OrderableBlock[] = [];
  let sections: Section[] = [];
  let current: Section | null = null;

  // 1. Partition into sections, pulling category sub-headers aside.
  for (const b of blocks) {
    if (b.blockType === 'section_header' && subHeaderIds.has(b.id)) {
      subHeaderById.set(b.id, b);
      continue; // re-embedded by skill grouping, not a section boundary
    }
    if (b.blockType === 'section_header') {
      current = { header: b, items: [] };
      sections.push(current);
    } else if (current) {
      current.items.push(b);
    } else {
      preamble.push(b);
    }
  }

  // 2. Re-order entries within each section.
  if (opts.entryOrder?.length) {
    const rank = new Map(opts.entryOrder.map((id, i) => [id, i] as const));
    for (const s of sections) {
      s.items = stableRank(s.items, b => (b.entryId != null ? rank.get(b.entryId) : undefined));
    }
  }

  // 3. Regroup the skills section into thematic sub-sections.
  if (groups.length) {
    const skills = sections.find(s => s.header && s.header.id === groups[0].headerBlockId);
    if (skills) {
      const byEntryId = new Map<string, OrderableBlock>();
      for (const it of skills.items) if (it.entryId) byEntryId.set(it.entryId, it);
      const used = new Set<string>();
      const rebuilt: OrderableBlock[] = [];
      groups.forEach((g, gi) => {
        if (gi > 0) {
          const hb = subHeaderById.get(g.headerBlockId);
          if (hb) rebuilt.push(hb);
        }
        for (const eid of g.entryIds) {
          const it = byEntryId.get(eid);
          if (it && !used.has(it.id)) {
            rebuilt.push(it);
            used.add(it.id);
          }
        }
      });
      // Leftover skills (ungrouped) keep their original order at the end.
      for (const it of skills.items) if (!used.has(it.id)) rebuilt.push(it);
      skills.items = rebuilt;
    }
  }

  // 4. Re-order sections.
  if (opts.sectionOrder?.length) {
    const rank = new Map(opts.sectionOrder.map((name, i) => [normalizeLabel(name), i] as const));
    sections = stableRank(sections, s =>
      s.header?.sectionName != null ? rank.get(normalizeLabel(s.header.sectionName)) : undefined,
    );
  }

  // 5. Flatten.
  const out: string[] = preamble.map(b => b.id);
  for (const s of sections) {
    if (s.header) out.push(s.header.id);
    for (const it of s.items) out.push(it.id);
  }
  // Safety net: never drop a block (e.g. an orphan sub-header).
  const emitted = new Set(out);
  for (const b of blocks) if (!emitted.has(b.id)) out.push(b.id);
  return out;
}
