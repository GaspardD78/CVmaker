/**
 * selector-debug.ts — AI-assisted CSS selector debugger for WebView parsers.
 *
 * When a WebView parser (LinkedIn, Indeed, HelloWork) receives HTML but
 * extracts 0 job cards, it calls `setCapturedDebugHtml`. The UI then lets
 * the user generate a documented prompt, paste it into any LLM, and import
 * the returned JSON to override the failing selectors — without any API key
 * and without recompiling the app.
 *
 * Override lifecycle:
 *   1. Fetch → 0 cards → `setCapturedDebugHtml(source, html, url)`
 *   2. User generates prompt from `buildSelectorDebugPrompt`
 *   3. User pastes LLM response → `validateSelectorOverride`
 *   4. Override saved to `job_watch_settings` key `selector_override_{source}`
 *   5. Next fetch: `runParser` reads override from store and passes it to the parser
 *   6. Parser uses override selectors in place of hardcoded defaults
 */

export const SELECTOR_OVERRIDE_VERSION = '1.0';

/** Sources that use WebView scraping and may benefit from selector overrides */
export const WEBVIEW_SOURCES = new Set<string>(['linkedin', 'indeed', 'hellowork']);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectorOverride {
  version: typeof SELECTOR_OVERRIDE_VERSION;
  /** Source identifier, e.g. 'linkedin' */
  source: string;
  /** ISO 8601 timestamp of when the override was created */
  updatedAt: string;
  /** CSS selector to wait for on page load (passed to Rust scrape_with_session) */
  waitSelector?: string | null;
  /** CSS selector for individual job card elements */
  cardSelector?: string | null;
  /** CSS selector for title within a card */
  titleSelector?: string | null;
  /** CSS selector for company name within a card */
  companySelector?: string | null;
  /** CSS selector for location within a card */
  locationSelector?: string | null;
  /** CSS selector for the offer link within a card */
  linkSelector?: string | null;
}

export interface DebugCapture {
  /** Trimmed HTML (scripts/styles removed, capped at ~12 KB) */
  html: string;
  url: string;
  timestamp: string;
}

// ── In-memory HTML capture ────────────────────────────────────────────────────
// Stores the last HTML received per WebView source. Ephemeral — cleared on reload.

const capturedHtml = new Map<string, DebugCapture>();

export function setCapturedDebugHtml(source: string, rawHtml: string, url: string): void {
  capturedHtml.set(source, {
    html: trimHtmlForDebug(rawHtml),
    url,
    timestamp: new Date().toISOString(),
  });
}

export function getCapturedDebugHtml(source: string): DebugCapture | undefined {
  return capturedHtml.get(source);
}

export function clearCapturedDebugHtml(source: string): void {
  capturedHtml.delete(source);
}

// ── HTML trimming ─────────────────────────────────────────────────────────────

const MAX_DEBUG_BYTES = 12_000;

function trimHtmlForDebug(html: string): string {
  // Drop tags that add noise without adding structural information
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract body content to skip <head> boilerplate
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text);
  if (bodyMatch) text = bodyMatch[1];

  // Collapse excessive whitespace
  text = text.replace(/\s{3,}/g, '  ').trim();

  // Hard cap to keep prompts within LLM context limits
  return text.length > MAX_DEBUG_BYTES
    ? text.slice(0, MAX_DEBUG_BYTES) + '\n<!-- … tronqué -->'
    : text;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Parses and validates a `SelectorOverride` from an LLM response.
 * Throws with a human-readable message on any schema violation.
 */
export function validateSelectorOverride(raw: unknown): SelectorOverride {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('La réponse doit être un objet JSON.');
  }
  const r = raw as Record<string, unknown>;

  if (r.version !== SELECTOR_OVERRIDE_VERSION) {
    throw new Error(
      `Version non supportée: attendue "${SELECTOR_OVERRIDE_VERSION}", reçue "${String(r.version ?? 'undefined')}".`
    );
  }
  if (typeof r.source !== 'string' || r.source.trim().length === 0) {
    throw new Error('Le champ "source" est requis et doit être une chaîne non vide.');
  }

  const asNullableString = (key: string): string | null | undefined => {
    const v = r[key];
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== 'string') throw new Error(`"${key}" doit être une chaîne ou null.`);
    return v.trim() || null;
  };

  return {
    version: SELECTOR_OVERRIDE_VERSION,
    source: r.source.trim(),
    updatedAt: new Date().toISOString(),
    waitSelector:    asNullableString('waitSelector'),
    cardSelector:    asNullableString('cardSelector'),
    titleSelector:   asNullableString('titleSelector'),
    companySelector: asNullableString('companySelector'),
    locationSelector: asNullableString('locationSelector'),
    linkSelector:    asNullableString('linkSelector'),
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export interface CurrentSelectors {
  waitSelector?: string;
  cardSelector?: string;
  titleSelector?: string;
  companySelector?: string;
  locationSelector?: string;
  linkSelector?: string;
}

/**
 * Builds the instruction prompt to paste into any LLM (ChatGPT, Claude, Gemini…).
 * Includes the trimmed HTML snippet and the exact JSON schema to return.
 */
export function buildSelectorDebugPrompt(
  source: string,
  url: string,
  html: string,
  current: CurrentSelectors,
): string {
  return `Tu es un expert en scraping HTML et en sélecteurs CSS.

Un parser d'offres d'emploi pour le site "${source}" ne trouve plus aucune offre.
La page a bien été chargée (HTML reçu), mais les sélecteurs CSS actuels ne matchent plus aucun élément.

## Informations

**Site** : ${source}
**URL scrapée** : ${url}

## Sélecteurs actuellement utilisés (en échec)

\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## HTML reçu (extrait — scripts/styles supprimés)

\`\`\`html
${html}
\`\`\`

## Tâche

1. Analyse l'HTML ci-dessus pour identifier la structure des offres d'emploi.
2. Identifie les sélecteurs CSS qui correspondent aux éléments suivants :
   - **waitSelector** : sélecteur à attendre pour que la page soit prête (container principal des offres)
   - **cardSelector** : sélecteur de chaque carte d'offre individuelle (\`li\`, \`article\`, ou \`div\`)
   - **titleSelector** : titre du poste *à l'intérieur d'une carte* (\`card.querySelector(…)\`)
   - **companySelector** : nom de l'entreprise *à l'intérieur d'une carte*
   - **locationSelector** : lieu/localisation *à l'intérieur d'une carte*
   - **linkSelector** : lien vers l'offre (balise \`<a href="…">\`) *à l'intérieur d'une carte*
3. Renvoie UNIQUEMENT le JSON ci-dessous, sans texte avant ni après, sans blocs Markdown :

{
  "version": "1.0",
  "source": "${source}",
  "waitSelector": "…",
  "cardSelector": "…",
  "titleSelector": "…",
  "companySelector": "…",
  "locationSelector": "…",
  "linkSelector": "…"
}

## Contraintes

- Préfère les sélecteurs sur attributs \`[data-*]\` (plus stables que les noms de classes).
- Pour couvrir plusieurs variantes, utilise un sélecteur CSS groupé séparé par des virgules.
- Si un champ est introuvable dans l'HTML fourni, mets \`null\` pour ce champ.
- Évite les sélecteurs trop génériques (\`div\`, \`a\`) sans contexte supplémentaire.`;
}
