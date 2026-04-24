/**
 * Unified contract-type normalisation for all parsers.
 * Handles English API values (JSON-LD, RSS), French labels, and regex extraction
 * from free text.
 */

/** Ordered rules: first match wins */
const RULES: { re: RegExp; label: string }[] = [
  // Exact FR labels
  { re: /\bCDI\b/,                                      label: 'CDI' },
  { re: /\bCDD\b/,                                      label: 'CDD' },
  { re: /\bFreelance\b/i,                               label: 'Freelance' },
  { re: /\bAlternance\b|\bApprentissage\b/i,            label: 'Alternance' },
  { re: /\bStage\b/i,                                   label: 'Stage' },
  { re: /\bFonctionnaire\b|\bTitulaire\b/i,             label: 'Fonctionnaire' },
  { re: /\bContractuel\b/i,                             label: 'CDD' },
  // English API values (JSON-LD, LinkedIn, Indeed, Jobicy…)
  { re: /full[_-]?time/i,                               label: 'CDI' },
  { re: /part[_-]?time/i,                               label: 'CDD' },
  { re: /\bcontract(?:or)?\b/i,                         label: 'Freelance' },
  { re: /\btemporary\b|\btemp\b/i,                      label: 'CDD' },
  { re: /\bintern(?:ship)?\b/i,                         label: 'Stage' },
  { re: /\bapprentice(?:ship)?\b/i,                     label: 'Alternance' },
];

/**
 * Normalise a raw employment-type string to a canonical French label.
 * Returns null when the value is absent or unrecognised.
 */
export function normalizeContractType(raw: string | undefined | null): string | null {
  if (!raw) return null;
  for (const { re, label } of RULES) {
    if (re.test(raw)) return label;
  }
  return raw.trim() || null;
}

/**
 * Extract a contract type by scanning free-form text (title + description).
 * Use this when the source doesn't provide a dedicated field.
 */
export function extractContractFromText(text: string): string | null {
  return normalizeContractType(text) === text.trim() ? null : normalizeContractType(text);
}
