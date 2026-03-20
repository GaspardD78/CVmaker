import type { ImportPayload, ImportEntryData, ImportProfileData } from './types';

const VALID_ENTRY_TYPES = new Set([
  'experience', 'education', 'skill', 'certification',
  'language', 'interest', 'project', 'volunteer',
]);

/**
 * Parses and validates a raw JSON string into an ImportPayload.
 * Throws a descriptive error on invalid input.
 */
export function parseImportJson(raw: string): ImportPayload {
  let parsed: unknown;
  try {
    // Strip markdown code fences if the LLM wrapped the JSON
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('JSON invalide. Vérifie que tu as copié la réponse complète du LLM.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Le JSON doit être un objet racine { profile, entries }.');
  }

  const obj = parsed as Record<string, unknown>;
  const result: ImportPayload = {};

  if (obj.profile !== undefined) {
    result.profile = validateProfile(obj.profile);
  }

  if (obj.entries !== undefined) {
    if (!Array.isArray(obj.entries)) {
      throw new Error('Le champ "entries" doit être un tableau.');
    }
    result.entries = obj.entries.map((e, i) => validateEntry(e, i));
  }

  if (!result.profile && (!result.entries || result.entries.length === 0)) {
    throw new Error('Le JSON ne contient ni "profile" ni "entries". Vérifie la réponse du LLM.');
  }

  return result;
}

function validateProfile(raw: unknown): ImportProfileData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('"profile" doit être un objet.');
  }
  const p = raw as Record<string, unknown>;
  const profile: ImportProfileData = {};

  const stringFields: (keyof ImportProfileData)[] = [
    'firstName', 'lastName', 'email', 'phone', 'address', 'city',
    'postalCode', 'country', 'linkedinUrl', 'githubUrl', 'portfolioUrl',
    'title', 'summary',
  ];

  for (const field of stringFields) {
    const val = p[field];
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string') {
        throw new Error(`profile.${field} doit être une chaîne de caractères.`);
      }
      if (val.trim()) profile[field] = val.trim();
    }
  }

  return profile;
}

function validateEntry(raw: unknown, index: number): ImportEntryData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`entries[${index}] doit être un objet.`);
  }
  const e = raw as Record<string, unknown>;

  if (!e.entryType || !VALID_ENTRY_TYPES.has(String(e.entryType))) {
    throw new Error(
      `entries[${index}].entryType invalide : "${e.entryType}". Valeurs acceptées : ${[...VALID_ENTRY_TYPES].join(', ')}.`,
    );
  }

  if (!e.title || typeof e.title !== 'string' || !String(e.title).trim()) {
    throw new Error(`entries[${index}].title est obligatoire.`);
  }

  const entry: ImportEntryData = {
    entryType: e.entryType as ImportEntryData['entryType'],
    title: String(e.title).trim(),
  };

  const optStr: (keyof ImportEntryData)[] = ['subtitle', 'location', 'startDate', 'endDate', 'description'];
  for (const field of optStr) {
    const val = e[field];
    if (val !== undefined && val !== null && typeof val === 'string' && val.trim()) {
      (entry as unknown as Record<string, unknown>)[field] = val.trim();
    }
  }

  if (e.isCurrent !== undefined && e.isCurrent !== null) {
    entry.isCurrent = Boolean(e.isCurrent);
  }

  if (Array.isArray(e.tags)) {
    entry.tags = e.tags
      .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
      .map(t => t.trim());
  }

  return entry;
}
