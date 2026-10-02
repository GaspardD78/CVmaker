/**
 * Couche de validation déterministe appliquée à la réponse du LLM, AVANT
 * `applyAiCvToBlocks`. Le LLM étant externe, rien ne garantit qu'il obéisse au
 * prompt : ce module vérifie ce qui peut l'être par code et nettoie le reste.
 *
 * `guardAiCv` retourne :
 * - `data` : la réponse nettoyée (IDs inconnus retirés, regroupements dédoublonnés,
 *   suggestions non étayées rejetées, typographie normalisée) ;
 * - `report` : `errors` (à confirmer par l'utilisateur avant d'appliquer :
 *   chiffre absent de la source), `warnings` (informatif) et `metrics`
 *   (couverture des mots-clés, volume estimé, écarts).
 *
 * Limites connues (voir specs/004-cv-engine-optimization) : la détection des
 * termes techniques est heuristique (sigles, CamelCase, noms à ponctuation) ; la
 * cohérence des temps est une approximation FR/EN ; aucune sémantique n'est
 * évaluée (une reformulation qui change le sens n'est pas détectée).
 */
import type { MasterEntry, Profile } from '@/types/profile';
import type { AiCvEntry, AiCvResponse, AiCvSuggestedEntry } from './ai-cv-response';
import { BULLETS_PER_PAGE, MAX_BULLET_CHARS, MAX_BULLETS_PER_EXPERIENCE } from './cv-prompt';
import { experienceYears, suggestPageBudget } from './cv-experience';
import { normalizeLanguageCode } from './cv-language';
import { normalizeLabel } from './cv-sections';
import { normalizeDescription, normalizeTypography } from './cv-typography';

export type GuardCode =
  | 'unknown-id' | 'invented-number' | 'unsourced-term' | 'unsupported-title' | 'suggestion-rejected'
  | 'duplicate-skill' | 'skill-in-several-groups' | 'long-bullet' | 'too-many-bullets' | 'empty-description'
  | 'forbidden-phrase' | 'generic-task' | 'pronoun' | 'tense' | 'dates-format' | 'volume';

export interface GuardIssue {
  code: GuardCode;
  message: string;
  /** Entrée concernée, quand il y en a une. */
  entryId?: string;
}

export interface KeywordCoverage {
  total: number;
  found: number;
  /** Pourcentage entier, `null` quand l'analyse ne liste aucun indispensable. */
  pct: number | null;
  missing: string[];
}

export interface GuardMetrics {
  keywordCoverage: KeywordCoverage;
  /** Écarts signalés par l'IA (indispensables sans preuve dans le profil). */
  ecarts: string[];
  visibleBullets: number;
  estimatedLines: number;
  pageBudget: number;
  /** Capacité estimée du budget de pages, en lignes. */
  budgetLines: number;
}

export interface GuardReport {
  /** Points bloquants : l'utilisateur doit confirmer (« Appliquer quand même »). */
  errors: GuardIssue[];
  warnings: GuardIssue[];
  /** Questions de quantification et remarques de l'IA (champ `warnings` du JSON). */
  aiWarnings: string[];
  metrics: GuardMetrics;
}

export interface GuardContext {
  /** Entrées du profil maître. */
  entries: readonly MasterEntry[];
  profile?: Pick<Profile, 'title' | 'summary'> | null;
  /** « Contexte additionnel » saisi par l'utilisateur : seule source des suggestions. */
  extraContext?: string;
  /** Pages visées ; défaut : même règle que le prompt (`suggestPageBudget`). */
  pageBudget?: number;
  now?: Date;
}

/** Lignes par page A4 à 11 px (titres de section et espacements compris), approximation prudente. */
export const PAGE_LINES = 55;
const CHARS_PER_LINE = 100;
const BADGES_PER_LINE = 6;
const BADGE_TYPES = new Set(['skill', 'language', 'interest', 'certification']);

// ── Texte et sources ─────────────────────────────────────────────────────────

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function containsWord(haystackNormalized: string, needleNormalized: string): boolean {
  if (!needleNormalized) return false;
  return new RegExp(`(^|[^a-z0-9])${esc(needleNormalized)}($|[^a-z0-9])`).test(haystackNormalized);
}

/** Texte source normalisé (profil maître, profil, contexte additionnel) : tout ce que l'IA a le droit d'affirmer. */
function buildSource(ctx: GuardContext): { text: string; numbers: Set<string> } {
  const parts: string[] = [];
  for (const e of ctx.entries) {
    parts.push(e.title, e.subtitle ?? '', e.location ?? '', e.description ?? '', e.startDate ?? '', e.endDate ?? '');
  }
  parts.push(ctx.profile?.title ?? '', ctx.profile?.summary ?? '', ctx.extraContext ?? '');
  const raw = parts.join('\n');
  return { text: normalizeLabel(raw), numbers: new Set(extractNumbers(raw)) };
}

/** Nombres d'un texte sous forme canonique (« 3 000 » -> « 3000 », « 1,5 » -> « 1.5 »). */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[   ]\d{3})*(?:[.,]\d+)?/g)) {
    const canonical = Number(m[0].replace(/[   ]/g, '').replace(',', '.'));
    if (Number.isFinite(canonical)) out.push(String(canonical));
  }
  return out;
}

const TERM_STOPLIST = new Set(['cv', 'ats', 'ia', 'ai', 'fr', 'en', 'ue', 'cdi', 'cdd', 'pdf', 'ok', 'tva', 'rh', 'it', 'us']);

const CAPITALIZED_STOPLIST = new Set([
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'francais', 'anglais', 'allemand', 'espagnol',
]);

/**
 * Termes « techniques » repérables sans dictionnaire : sigles en capitales
 * (SIEM, AWS), CamelCase (PowerShell), noms à ponctuation (Node.js, C++, C#).
 */
export function extractTechnicalTerms(text: string, opts: { properNouns?: boolean } = {}): string[] {
  const found = new Set<string>();
  const add = (t: string) => {
    const norm = normalizeLabel(t).replace(/[.\-/]+$/g, '');
    if (norm.length >= 2 && !TERM_STOPLIST.has(norm)) found.add(norm);
  };
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9&]{1,}(?:[-/][A-Z0-9]{2,})*\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Za-z]*[a-z][A-Z][A-Za-z]*\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Za-z]+(?:\+\+|#)|\b[A-Za-z]+\.[A-Za-z]{1,}\b/g)) add(m[0]);
  if (opts.properNouns) {
    // Mots capitalisés en milieu de phrase (Kubernetes, Splunk, noms d'employeurs) : pertinent seulement
    // quand le texte est dans la langue des sources (une traduction capitalise des mots que la source n'a pas).
    for (const m of text.matchAll(/(?<=[\p{L}\p{N},;)] )[A-Z\u00c0-\u00de][\p{Ll}]{2,}/gu)) {
      if (!CAPITALIZED_STOPLIST.has(normalizeLabel(m[0]))) add(m[0]);
    }
  }
  return [...found];
}

// ── Puces ────────────────────────────────────────────────────────────────────

function bulletsOf(description: string): string[] {
  return description
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*•]\s/.test(l))
    .map(l => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''));
}

const IRREGULAR_PAST_EN = new Set(['led', 'built', 'ran', 'wrote', 'drove', 'cut', 'made', 'set', 'held', 'won', 'sold', 'kept', 'took', 'brought', 'taught', 'began', 'grew', 'chose', 'found', 'got', 'put', 'spread', 'saw', 'sent', 'spent', 'drew', 'deployed']);
const IRREGULAR_PAST_FR = new Set(['mis', 'pris', 'acquis', 'permis', 'appris', 'compris', 'défini']);

type Tense = 'past' | 'present' | 'unknown';

function firstWord(bullet: string): string {
  return (bullet.match(/^[\p{L}'’-]+/u)?.[0] ?? '').toLowerCase();
}

/** Temps approximatif du verbe d'ouverture d'une puce (FR / EN) ; `unknown` quand c'est ambigu. */
export function bulletTense(bullet: string, language: string): Tense {
  const w = firstWord(bullet);
  if (w.length < 3) return 'unknown';
  if (language === 'en') {
    if (/ed$/.test(w) || IRREGULAR_PAST_EN.has(w)) return 'past';
    if (/ing$/.test(w)) return 'unknown';
    if (/[^s]s$/.test(w) && !/ss$/.test(w)) return 'present';
    return 'unknown';
  }
  if (/(é|ée|és|ées)$/.test(w) || IRREGULAR_PAST_FR.has(w)) return 'past';
  // Infinitif (-er, -ir, -oir, -ire, consonne + -re) ou nom (-tion, -ment, -age…) : on ne juge pas.
  if (/(er|ir|oir|ire|tion|sion|ment|age|isme|ance|ence|ité|eur|ure|ent)$/.test(w) || /[^aeiouyàâéèêëîïôûù]re$/.test(w)) return 'unknown';
  if (/(e|it)$/.test(w) && !/^(conduit|construit|produit|écrit|fait)$/.test(w)) return 'present';
  return 'unknown';
}

// ── Formulations ─────────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES: Array<[label: string, pattern: RegExp]> = [
  ['« en effet »', /(^|[^a-z])en effet($|[^a-z])/],
  ['« dans le cadre de »', /dans le cadre d(e|u|es)($|[^a-z])/],
  ['« il convient de »', /il convient de/],
  ['« force est de constater »', /force est de constater/],
  ['« il est important de souligner »', /il est important de souligner/],
  ['« passionné »', /passionne(e|s|es)?($|[^a-z])/],
  ['« dynamique »', /(^|[^a-z])dynamique(s)?($|[^a-z])/],
  ['« expert reconnu »', /expert reconnu/],
  ['« passionate »', /(^|[^a-z])passionate($|[^a-z])/],
  ['« dynamic »', /(^|[^a-z])dynamic($|[^a-z])/],
  ['« results-driven »', /results?-driven/],
  ['« team player »', /team player/],
  ['« hard-working »', /hard-?working/],
];
const GENERIC_TASK = /^(responsable d(e|u|es)|en charge d(e|u|es)|responsible for|in charge of)(?=$|[^a-z])/;
const PRONOUN = /(^|[^a-z])(j'ai|nous avons|nous sommes|i have|i was|i am|we)($|[^a-z])|^je(?=[^a-z])/;

function normalizeApostrophes(s: string): string {
  return s.replace(/[’‘]/g, "'");
}

// ── Garde-fou ────────────────────────────────────────────────────────────────

interface TextField {
  /** Où le texte apparaît (pour les messages). */
  where: string;
  entryId?: string;
  kind: 'title' | 'summary' | 'description' | 'override';
  text: string;
}

export function guardAiCv(input: AiCvResponse, ctx: GuardContext): { data: AiCvResponse; report: GuardReport } {
  const errors: GuardIssue[] = [];
  const warnings: GuardIssue[] = [];
  const warn = (issue: GuardIssue) => warnings.push(issue);

  const language = normalizeLanguageCode(input.analyse?.langueAnnonce) ?? 'fr';
  const entryById = new Map(ctx.entries.map(e => [e.id, e] as const));
  const source = buildSource(ctx);
  const label = (id: string) => entryById.get(id)?.title ?? id;

  // ── Nettoyage structurel ──
  const seenIds = new Set<string>();
  const unknownIds = new Set<string>();
  const entries: AiCvEntry[] = [];
  for (const e of input.entries) {
    if (!entryById.has(e.id)) { unknownIds.add(e.id); continue; }
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const cleaned: AiCvEntry = { ...e };
    if (cleaned.description !== undefined) cleaned.description = normalizeDescription(cleaned.description, language);
    for (const key of ['titleOverride', 'companyOverride', 'subtitleOverride'] as const) {
      const v = cleaned[key];
      if (v !== undefined) cleaned[key] = normalizeTypography(v, language);
    }
    entries.push(cleaned);
  }

  const entryOrder = input.entryOrder?.filter(id => {
    if (entryById.has(id)) return true;
    unknownIds.add(id);
    return false;
  });

  let skillGroups = input.skillGroups;
  if (skillGroups) {
    const owner = new Map<string, string>();
    const cleanedGroups = skillGroups.map(g => {
      const ids: string[] = [];
      for (const id of g.entryIds) {
        const e = entryById.get(id);
        if (!e || e.entryType !== 'skill') { unknownIds.add(id); continue; }
        const previous = owner.get(id);
        if (previous !== undefined) {
          warn({ code: 'skill-in-several-groups', message: `« ${e.title} » est dans plusieurs groupes (« ${previous} » et « ${g.category} ») : seule la première est conservée.`, entryId: id });
          continue;
        }
        owner.set(id, g.category);
        ids.push(id);
      }
      return { category: normalizeTypography(g.category, language), entryIds: ids };
    });
    skillGroups = cleanedGroups.filter(g => g.entryIds.length > 0);
    if (skillGroups.length === 0) skillGroups = undefined;
  }

  if (unknownIds.size > 0) {
    warn({ code: 'unknown-id', message: `${unknownIds.size} identifiant(s) inconnu(s) ignoré(s) : ${[...unknownIds].slice(0, 5).join(', ')}${unknownIds.size > 5 ? '…' : ''}.` });
  }

  // ── Suggestions : seule source autorisée = contexte additionnel ──
  const extraNorm = normalizeLabel(ctx.extraContext ?? '');
  const suggestedEntries: AiCvSuggestedEntry[] = [];
  for (const s of input.suggestedEntries) {
    if (isSupportedByContext(s.title, extraNorm)) {
      suggestedEntries.push({
        ...s,
        title: normalizeTypography(s.title, language),
        ...(s.description !== undefined ? { description: normalizeDescription(s.description, language) } : {}),
      });
    } else {
      warn({ code: 'suggestion-rejected', message: `Suggestion « ${s.title} » rejetée : non étayée par le contexte additionnel.` });
    }
  }

  const title = input.title !== undefined ? normalizeTypography(input.title, language) : undefined;
  const summary = input.summary !== undefined ? normalizeTypography(input.summary, language) : undefined;

  const data: AiCvResponse = {
    ...input,
    title,
    summary,
    entries,
    suggestedEntries,
    entryOrder: entryOrder && entryOrder.length > 0 ? entryOrder : undefined,
    skillGroups,
  };
  if (data.entryOrder === undefined) delete data.entryOrder;
  if (data.skillGroups === undefined) delete data.skillGroups;

  // ── Vue « CV final » : entrées visibles, texte effectif ──
  const aiById = new Map(entries.map(e => [e.id, e] as const));
  interface Effective { entry: MasterEntry; visible: boolean; title: string; subtitle: string; description: string }
  const effective: Effective[] = ctx.entries.map(entry => {
    const ai = aiById.get(entry.id);
    return {
      entry,
      visible: ai ? ai.visible : true,
      title: ai?.titleOverride ?? entry.title,
      subtitle: ai?.subtitleOverride ?? ai?.companyOverride ?? entry.subtitle ?? '',
      description: ai?.description ?? entry.description ?? '',
    };
  });
  const visible = effective.filter(e => e.visible);

  // ── Anti-invention : chiffres (bloquant) et termes (avertissement) ──
  const years = experienceYears(ctx.entries, ctx.now);
  const allowedInSummary = new Set<string>([String(years), String(years + 1), String(Math.max(0, years - 1))]);
  const fields: TextField[] = [];
  if (summary) fields.push({ where: 'résumé', kind: 'summary', text: summary });
  for (const e of visible) {
    if (!aiById.has(e.entry.id)) continue; // entrée non touchée par l'IA : source telle quelle
    const ai = aiById.get(e.entry.id) as AiCvEntry;
    if (ai.description !== undefined) fields.push({ where: label(e.entry.id), entryId: e.entry.id, kind: 'description', text: ai.description });
    for (const key of ['titleOverride', 'companyOverride', 'subtitleOverride'] as const) {
      const v = ai[key];
      if (v !== undefined) fields.push({ where: label(e.entry.id), entryId: e.entry.id, kind: 'override', text: v });
    }
  }
  for (const f of fields) {
    const invented = [...new Set(extractNumbers(f.text))].filter(n => !source.numbers.has(n) && !(f.kind === 'summary' && allowedInSummary.has(n)));
    if (invented.length > 0) {
      errors.push({
        code: 'invented-number',
        message: `Nombre absent de la source (${f.where}) : ${invented.join(', ')}. À confirmer ou à retirer.`,
        entryId: f.entryId,
      });
    }
    const unsourced = extractTechnicalTerms(f.text, { properNouns: language === 'fr' }).filter(t => !containsWord(source.text, t));
    if (unsourced.length > 0) {
      warn({ code: 'unsourced-term', message: `Terme absent de la source (${f.where}) : ${unsourced.join(', ')}.`, entryId: f.entryId });
    }
  }

  // Titre : l'intitulé réel doit figurer parmi les postes tenus.
  if (title) {
    const head = normalizeLabel(title.split(/\s[-|:]\s/)[0]);
    const held = [
      ...ctx.entries.filter(e => e.entryType === 'experience').map(e => e.title),
      ...effective.filter(e => e.entry.entryType === 'experience').map(e => e.title),
      ctx.profile?.title ?? '',
    ].map(normalizeLabel).filter(Boolean);
    if (head && !held.some(h => h.includes(head) || head.includes(h))) {
      warn({ code: 'unsupported-title', message: `Titre « ${title} » : l'intitulé ne correspond à aucun poste tenu dans le profil.` });
    }
  }

  // ── Puces, volume ──
  let visibleBullets = 0;
  let lines = 5; // en-tête (nom, intitulé, contacts)
  if (summary) lines += Math.ceil(summary.length / CHARS_PER_LINE);
  const badgeCounts = new Map<string, number>();
  const sectionsUsed = new Set<string>();
  const overridePatterns = new Set<string>();
  const skillTitles = new Map<string, string>();

  for (const e of visible) {
    const type = e.entry.entryType;
    sectionsUsed.add(type);
    if (BADGE_TYPES.has(type)) {
      badgeCounts.set(type, (badgeCounts.get(type) ?? 0) + 1);
      if (type === 'skill') {
        const key = normalizeLabel(e.title);
        if (skillTitles.has(key)) warn({ code: 'duplicate-skill', message: `Compétence en double : « ${e.title} ».`, entryId: e.entry.id });
        skillTitles.set(key, e.entry.id);
      }
      continue;
    }
    const bullets = bulletsOf(e.description);
    visibleBullets += bullets.length;
    lines += 1.5 + bullets.reduce((n, b) => n + Math.ceil(b.length / CHARS_PER_LINE), 0);

    if ((type === 'experience' || type === 'project' || type === 'volunteer') && e.description.trim() === '') {
      warn({ code: 'empty-description', message: `« ${e.title} » est visible sans description.`, entryId: e.entry.id });
    }
    const tooLong = bullets.filter(b => b.length > MAX_BULLET_CHARS);
    if (tooLong.length > 0) {
      warn({ code: 'long-bullet', message: `« ${e.title} » : ${tooLong.length} puce(s) de plus de ${MAX_BULLET_CHARS} caractères.`, entryId: e.entry.id });
    }
    if (type === 'experience' && bullets.length > MAX_BULLETS_PER_EXPERIENCE) {
      warn({ code: 'too-many-bullets', message: `« ${e.title} » : ${bullets.length} puces (maximum ${MAX_BULLETS_PER_EXPERIENCE}).`, entryId: e.entry.id });
    }
    // Cohérence des temps (poste terminé = passé, poste actuel = présent).
    if (type === 'experience' && bullets.length >= 2) {
      const current = e.entry.isCurrent || !e.entry.endDate;
      const tenses = bullets.map(b => bulletTense(b, language));
      const wrong = tenses.filter(t => (current ? t === 'past' : t === 'present')).length;
      if (wrong >= 2 && wrong / bullets.length >= 0.5) {
        warn({
          code: 'tense',
          message: `« ${e.title} » : ${wrong} puce(s) au ${current ? 'passé sur un poste actuel' : 'présent sur un poste terminé'}.`,
          entryId: e.entry.id,
        });
      }
    }
  }
  for (const [type, count] of badgeCounts) {
    lines += type === 'language' ? 1 : Math.ceil(count / BADGES_PER_LINE);
  }
  lines += sectionsUsed.size * 2;
  const estimatedLines = Math.round(lines);

  const pageBudget = ctx.pageBudget ?? suggestPageBudget(years);
  const budgetLines = pageBudget * PAGE_LINES;
  if (estimatedLines > budgetLines * 1.05 || visibleBullets > pageBudget * BULLETS_PER_PAGE * 1.25) {
    warn({
      code: 'volume',
      message: `Volume estimé : ${estimatedLines} lignes et ${visibleBullets} puces pour ${pageBudget} page(s) (capacité ≈ ${budgetLines} lignes). Masquer ou raccourcir des entrées.`,
    });
  } else if (estimatedLines > PAGE_LINES && estimatedLines % PAGE_LINES < PAGE_LINES * 0.15) {
    warn({ code: 'volume', message: `La dernière page serait presque vide (≈ ${estimatedLines % PAGE_LINES} lignes) : resserrer pour tenir sur ${Math.floor(estimatedLines / PAGE_LINES)} page(s).` });
  }

  // ── Formulations interdites, tâches génériques, pronoms ──
  const styleSeen = new Set<string>();
  const styleFields: TextField[] = [...fields.filter(f => f.kind !== 'override')];
  if (title) styleFields.push({ where: 'titre', kind: 'title', text: title });
  for (const f of styleFields) {
    const norm = normalizeApostrophes(normalizeLabel(f.text));
    for (const [name, pattern] of FORBIDDEN_PHRASES) {
      const key = `${f.where}|${name}`;
      if (pattern.test(norm) && !styleSeen.has(key)) {
        styleSeen.add(key);
        warn({ code: 'forbidden-phrase', message: `Formulation à éviter (${f.where}) : ${name}.`, entryId: f.entryId });
      }
    }
    if (f.kind === 'description' || f.kind === 'summary') {
      const lines2 = f.text.split('\n').map(l => normalizeApostrophes(normalizeLabel(l.replace(/^[-*•]\s+/, ''))));
      if (f.kind === 'description' && lines2.some(l => GENERIC_TASK.test(l))) {
        warn({ code: 'generic-task', message: `Tâche générique (${f.where}) : commencer par un verbe d'action, pas « responsable de » / « en charge de ».`, entryId: f.entryId });
      }
      if (lines2.some(l => PRONOUN.test(l))) {
        warn({ code: 'pronoun', message: `Pronom personnel à éviter (${f.where}).`, entryId: f.entryId });
      }
    }
  }

  // ── Homogénéité des dates ──
  for (const e of entries) {
    if (e.datesOverride) overridePatterns.add(e.datesOverride.replace(/\d/g, '9').replace(/\p{L}+/gu, 'a'));
  }
  if (overridePatterns.size > 1) {
    warn({ code: 'dates-format', message: 'Les datesOverride n\'ont pas le même format : préférer le format automatique de l\'application.' });
  }

  // ── Couverture des mots-clés ──
  const haystack = normalizeApostrophes(normalizeLabel([
    title ?? '', summary ?? '',
    ...visible.flatMap(e => [e.title, e.subtitle, e.description]),
  ].join('\n')));
  const required = input.analyse?.indispensables ?? [];
  const missing = required.filter(req => {
    const forms = [req, req.replace(/\(.*?\)/g, ''), ...(req.match(/\(([^)]+)\)/g) ?? []).map(p => p.slice(1, -1))]
      .map(f => normalizeApostrophes(normalizeLabel(f))).filter(f => f.length >= 2);
    return !forms.some(f => containsWord(haystack, f));
  });
  const keywordCoverage: KeywordCoverage = {
    total: required.length,
    found: required.length - missing.length,
    pct: required.length > 0 ? Math.round(((required.length - missing.length) / required.length) * 100) : null,
    missing,
  };

  return {
    data,
    report: {
      errors,
      warnings,
      aiWarnings: input.warnings ?? [],
      metrics: {
        keywordCoverage,
        ecarts: input.analyse?.ecarts ?? [],
        visibleBullets,
        estimatedLines,
        pageBudget,
        budgetLines,
      },
    },
  };
}

/** Une suggestion est étayée si son titre (ou l'essentiel de ses mots) figure dans le contexte additionnel. */
function isSupportedByContext(title: string, extraNormalized: string): boolean {
  if (!extraNormalized) return false;
  const t = normalizeLabel(title);
  if (extraNormalized.includes(t)) return true;
  const words = t.split(/[^a-z0-9+#.]+/).filter(w => w.length >= 4);
  if (words.length === 0) return false;
  return words.filter(w => extraNormalized.includes(w)).length / words.length >= 0.6;
}
