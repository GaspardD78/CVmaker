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
  /** Non-destructive override of the displayed job title. */
  titleOverride?: string;
  /** Non-destructive override of the displayed company name. */
  companyOverride?: string;
  /** Non-destructive verbatim override of the displayed dates. */
  datesOverride?: string;
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

  return {
    title: cleanString(obj.title),
    summary: cleanString(obj.summary),
    entries,
    suggestedEntries,
  };
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
  if (aiEntry.datesOverride !== undefined) patch.datesOverride = aiEntry.datesOverride;

  return patch;
}
