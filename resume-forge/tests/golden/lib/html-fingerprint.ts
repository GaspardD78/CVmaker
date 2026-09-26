/**
 * Empreinte du HTML d'export : ce qui peut changer le rendu du CV.
 *
 * Calculée dans Chromium sur le HTML d'export, avec l'émulation d'impression
 * et une fenêtre de la taille de la page (voir render.ts). Deux parties :
 *  a) le balisage de #printable-cv, normalisé (markup.txt) ;
 *  b) les règles CSS « applicables », dans l'ordre du document (la cascade en
 *     dépend), stockées dans un fichier partagé (references/_css/rules.txt).
 * Le reste du HTML d'export (CSS de l'interface…) n'est suivi que par une
 * empreinte globale, informative.
 *
 * Voir tests/golden/README.md, section Empreinte du HTML d'export.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lineDiff } from './diff';

/** Résultat brut calculé dans la page. */
export interface RawFingerprint {
  /** Balisage normalisé ; les URL data: sont remplacées par @@DATA<n>@@. */
  markup: string;
  dataUrls: string[];
  rules: { context: string; text: string }[];
  /** Sélecteurs restés invalides après nettoyage (comptés comme applicables). */
  invalidSelectors: string[];
  /**
   * Garde-fou ATS : éléments de #printable-cv portant du texte (ou un
   * ::before/::after avec contenu) dont le letter-spacing calculé dépasse le
   * plafond (MAX_LETTER_SPACING_EM de PrintableCV).
   */
  letterSpacingViolations: string[];
  /**
   * Garde-fou ligatures : éléments de #printable-cv portant du texte (ou un
   * ::before/::after avec contenu) dont font-variant-ligatures calculé n'est pas
   * `none` ou dont font-feature-settings n'est pas `normal` (analysé par
   * ligatureViolations).
   */
  ligatureStyles: { where: string; variantLigatures: string; featureSettings: string }[];
}

/**
 * Exécutée dans Chromium (page.evaluate) : doit rester autonome, sans import
 * ni référence extérieure.
 */
export function collectInPage(maxLetterSpacingEm: number): RawFingerprint {
  const cv = document.getElementById('printable-cv');
  if (!cv) throw new Error('#printable-cv absent du HTML d\'export');

  // ── Garde-fou ATS : letter-spacing calculé, règles d'impression actives ──
  const letterSpacingViolations: string[] = [];
  const ligatureStyles: RawFingerprint['ligatureStyles'] = [];
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${Array.from(el.classList).slice(0, 4).map((c) => `.${c}`).join('')}`;
  for (const el of [cv, ...Array.from(cv.querySelectorAll('*'))]) {
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim();
    const check = (cs: CSSStyleDeclaration, where: string, sample: string) => {
      if (cs.fontVariantLigatures !== 'none' || cs.fontFeatureSettings !== 'normal') {
        ligatureStyles.push({ where: `${describe(el)}${where} « ${sample.slice(0, 40)} »`, variantLigatures: cs.fontVariantLigatures, featureSettings: cs.fontFeatureSettings });
      }
      if (cs.letterSpacing === 'normal') return;
      const px = parseFloat(cs.letterSpacing), size = parseFloat(cs.fontSize);
      if (!size || !Number.isFinite(px)) return;
      const em = px / size;
      if (em > maxLetterSpacingEm + 0.001) letterSpacingViolations.push(`${describe(el)}${where} « ${sample.slice(0, 40)} » : ${em.toFixed(3)} em`);
    };
    if (ownText) check(getComputedStyle(el), '', ownText);
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content && cs.content !== 'none' && cs.content !== 'normal' && cs.content !== '""') check(cs, pseudo, cs.content);
    }
  }

  // ── Nettoyage des sélecteurs ─────────────────────────────────────────────
  // Lecture caractère par caractère : échappements (\:), chaînes, crochets et
  // parenthèses respectés. Retire pseudo-éléments et pseudo-classes
  // d'interaction ; une branche vide devient « * ».
  const PSEUDO_ELEMENT_LEGACY = new Set(['before', 'after', 'first-line', 'first-letter']);
  const INTERACTION = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited']);
  const SELECTOR_ARGS = new Set(['not', 'is', 'where', 'has', 'matches', '-webkit-any']);

  const splitTopLevel = (s: string): string[] => {
    const parts: string[] = [];
    let depth = 0, quote = '', cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + (s[i + 1] ?? ''); i++; continue; }
      if (quote) { if (c === quote) quote = ''; cur += c; continue; }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    return parts;
  };

  const cleanCompound = (s: string): string => {
    let out = '', bracket = 0, quote = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { out += c + (s[i + 1] ?? ''); i++; continue; }
      if (quote) { if (c === quote) quote = ''; out += c; continue; }
      if (c === '"' || c === "'") { quote = c; out += c; continue; }
      if (c === '[') bracket++;
      if (c === ']') bracket--;
      if (c !== ':' || bracket > 0) { out += c; continue; }
      const isElement = s[i + 1] === ':';
      let j = i + (isElement ? 2 : 1);
      let name = '';
      while (j < s.length && /[\w-]/.test(s[j])) name += s[j++];
      let args: string | null = null;
      if (s[j] === '(') {
        let depth = 0, k = j;
        for (; k < s.length; k++) {
          if (s[k] === '\\') { k++; continue; }
          if (s[k] === '(') depth++;
          if (s[k] === ')' && --depth === 0) break;
        }
        args = s.slice(j + 1, k);
        j = k + 1;
      }
      const lower = name.toLowerCase();
      i = j - 1;
      if (isElement || PSEUDO_ELEMENT_LEGACY.has(lower) || INTERACTION.has(lower)) continue;
      if (args !== null && SELECTOR_ARGS.has(lower)) {
        const inner = splitTopLevel(args).map((p) => cleanBranch(p, false)).filter(Boolean).join(', ');
        if (inner) out += `:${name}(${inner})`;
        continue;
      }
      out += `:${name}${args !== null ? `(${args})` : ''}`;
    }
    return out;
  };

  const cleanBranch = (s: string, star: boolean): string => {
    let r = cleanCompound(s).trim();
    // Pseudo retiré en bord de branche : « :hover > .x » → « * > .x ».
    // (Hors :has(), dont les arguments peuvent commencer par un combinateur.)
    if (star && /^[>+~]/.test(r)) r = `* ${r}`;
    if (/[>+~]$/.test(r)) r += ' *';
    if (!r && star) r = '*';
    return r;
  };
  const cleanSelector = (s: string) => splitTopLevel(s).map((p) => cleanBranch(p, true)).join(', ');

  // Éléments concernés : #printable-cv, ses descendants et ses ancêtres.
  const ancestors: Element[] = [];
  for (let e = cv.parentElement; e; e = e.parentElement) ancestors.push(e);
  const invalidSelectors: string[] = [];
  const applies = (selectorText: string): boolean => {
    const sel = cleanSelector(selectorText);
    try {
      return cv.matches(sel) || cv.querySelector(sel) !== null || ancestors.some((e) => e.matches(sel));
    } catch {
      invalidSelectors.push(`${selectorText}  →  ${sel}`);
      return true;
    }
  };

  // ── Parcours des règles, dans l'ordre du document ───────────────────────
  type Entry =
    | { kind: 'style'; context: string; selector: string; decls: [string, string, string][] }
    | { kind: 'keyframes' | 'font-face' | 'property'; context: string; key: string; text: string }
    | { kind: 'always'; context: string; text: string };
  const entries: Entry[] = [];
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
  const declsOf = (style: CSSStyleDeclaration): [string, string, string][] => {
    const d: [string, string, string][] = [];
    for (let i = 0; i < style.length; i++) {
      const p = style.item(i);
      d.push([p, squash(style.getPropertyValue(p)), style.getPropertyPriority(p)]);
    }
    return d;
  };

  const walk = (rules: CSSRuleList, context: string, forced: boolean) => {
    for (const rule of Array.from(rules)) {
      const name = rule.constructor.name;
      if (name === 'CSSStyleRule') {
        const r = rule as CSSStyleRule;
        if (forced || applies(r.selectorText)) {
          entries.push({ kind: 'style', context, selector: r.selectorText, decls: declsOf(r.style) });
        }
        // Règles imbriquées (CSS nesting) : prudemment toutes incluses si le parent l'est.
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, `${context} › ${r.selectorText}`, forced || applies(r.selectorText));
      } else if (name === 'CSSMediaRule') {
        const r = rule as CSSMediaRule;
        if (window.matchMedia(r.media.mediaText || 'all').matches) walk(r.cssRules, `${context} › @media ${r.media.mediaText}`, forced);
      } else if (name === 'CSSSupportsRule') {
        const r = rule as CSSSupportsRule;
        if (CSS.supports(r.conditionText)) walk(r.cssRules, `${context} › @supports ${r.conditionText}`, forced);
      } else if (name === 'CSSLayerBlockRule') {
        const r = rule as CSSLayerBlockRule;
        walk(r.cssRules, `${context} › @layer ${r.name}`, forced);
      } else if (name === 'CSSLayerStatementRule' || name === 'CSSPageRule') {
        entries.push({ kind: 'always', context, text: squash(rule.cssText) });
      } else if (name === 'CSSKeyframesRule') {
        entries.push({ kind: 'keyframes', context, key: (rule as CSSKeyframesRule).name, text: squash(rule.cssText) });
      } else if (name === 'CSSFontFaceRule') {
        const family = (rule as CSSFontFaceRule).style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        entries.push({ kind: 'font-face', context, key: family, text: squash(rule.cssText) });
      } else if (name === 'CSSPropertyRule') {
        entries.push({ kind: 'property', context, key: (rule as CSSPropertyRule).name, text: squash(rule.cssText) });
      } else if ((rule as CSSGroupingRule).cssRules) {
        // Autre règle de groupe (@container…) : parcourue prudemment.
        walk((rule as CSSGroupingRule).cssRules, `${context} › ${squash(rule.cssText.split('{')[0])}`, forced);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, '', false);

  // ── Variables CSS réellement utilisées (fermeture transitive) ────────────
  const VAR = /var\(\s*(--[\w-]+)/g;
  const refs = new Set<string>();
  const addRefs = (text: string) => { for (const m of text.matchAll(VAR)) refs.add(m[1]); };
  const styles = entries.filter((e): e is Extract<Entry, { kind: 'style' }> => e.kind === 'style');
  for (const e of styles) for (const [p, v] of e.decls) if (!p.startsWith('--')) addRefs(v);
  for (const el of [cv, ...Array.from(cv.querySelectorAll('[style]'))]) addRefs(el.getAttribute('style') ?? '');
  const keptText = () => styles.flatMap((e) => e.decls.filter(([p]) => !p.startsWith('--') || refs.has(p)).map(([p, v]) => `${p}:${v}`)).join(';').toLowerCase();
  const keyframeIncluded = (name: string) => {
    const re = new RegExp(`(^|[\\s,:])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s,;]|$)`);
    return styles.some((e) => e.decls.some(([p, v]) => /^animation(-name)?$/.test(p) && re.test(v)));
  };
  for (let changed = true; changed;) {
    const before = refs.size;
    for (const e of styles) for (const [p, v] of e.decls) if (p.startsWith('--') && refs.has(p)) addRefs(v);
    for (const e of entries) if (e.kind === 'keyframes' && keyframeIncluded(e.key)) addRefs(e.text);
    changed = refs.size !== before;
  }
  const kept = keptText();

  const rules: { context: string; text: string }[] = [];
  for (const e of entries) {
    const context = e.context.replace(/^ › /, '');
    if (e.kind === 'style') {
      const decls = e.decls.filter(([p]) => !p.startsWith('--') || refs.has(p));
      if (!decls.length) continue;
      rules.push({ context, text: `${e.selector} { ${decls.map(([p, v, i]) => `${p}: ${v}${i ? ' !' + i : ''};`).join(' ')} }` });
    } else if (e.kind === 'always') {
      rules.push({ context, text: e.text });
    } else if (e.kind === 'property' ? refs.has(e.key)
      : e.kind === 'keyframes' ? keyframeIncluded(e.key)
      : kept.includes(e.key.toLowerCase())) {
      rules.push({ context, text: e.text });
    }
  }

  // ── Balisage normalisé ───────────────────────────────────────────────────
  const dataUrls: string[] = [];
  const dataRef = (v: string) => v.replace(/data:[^"'\s)]+/g, (m) => { dataUrls.push(m); return `@@DATA${dataUrls.length - 1}@@`; });
  const lines: string[] = [];
  const dump = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) { lines.push(pad + JSON.stringify(dataRef((node as Text).data))); return; }
    if (node.nodeType === Node.COMMENT_NODE) { lines.push(`${pad}<!--${(node as Comment).data}-->`); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const attrs = Array.from(el.attributes)
      .map((a) => [a.name, a.name === 'class' ? a.value.split(/\s+/).filter(Boolean).sort().join(' ') : a.value] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
      .map(([n, v]) => ` ${n}=${JSON.stringify(dataRef(v))}`)
      .join('');
    lines.push(`${pad}<${el.tagName.toLowerCase()}${attrs}>`);
    for (const child of Array.from(el.childNodes)) dump(child, depth + 1);
  };
  dump(cv, 0);

  return { markup: lines.join('\n') + '\n', dataUrls, rules, invalidSelectors: [...new Set(invalidSelectors)], letterSpacingViolations, ligatureStyles };
}

// ── Côté Node : empreinte, références, diff ───────────────────────────────────

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const ruleLine = (r: { context: string; text: string }) => `${r.context || '(racine)'}\t${r.text}`;
export const ruleId = (r: { context: string; text: string }) => sha(ruleLine(r)).slice(0, 12);

/** Fonctionnalités OpenType qui produisent des ligatures (dont U+FB00 à U+FB06, mal extraites par pdfminer et pypdf). */
const LIGATURE_FEATURES = ['liga', 'clig', 'dlig', 'hlig', 'calt'];

/**
 * Fonctionnalités de ligature activées par une valeur de font-feature-settings :
 * `"liga"`, `"liga" 1` ou `"liga" on` activent ; `"liga" 0` ou `"liga" off`
 * désactivent. Pour une même fonctionnalité, la dernière occurrence l'emporte.
 */
export function enabledLigatureFeatures(featureSettings: string): string[] {
  const state = new Map<string, boolean>();
  for (const part of featureSettings.split(',')) {
    const m = part.trim().match(/^["']([a-zA-Z0-9 ]{4})["']\s*(\S+)?$/);
    if (!m) continue;
    const value = (m[2] ?? '1').toLowerCase();
    state.set(m[1], value === 'on' || (value !== 'off' && Number(value) !== 0));
  }
  return LIGATURE_FEATURES.filter((f) => state.get(f));
}

/** Éléments du CV dont les ligatures ne sont pas désactivées (garde-fou du lot ligatures). */
export function ligatureViolations(raw: RawFingerprint): string[] {
  const out: string[] = [];
  for (const s of raw.ligatureStyles) {
    const reasons: string[] = [];
    if (s.variantLigatures !== 'none') reasons.push(`font-variant-ligatures: ${s.variantLigatures}`);
    const on = enabledLigatureFeatures(s.featureSettings);
    if (on.length) reasons.push(`font-feature-settings active ${on.join(', ')}`);
    if (reasons.length) out.push(`${s.where} : ${reasons.join(' ; ')}`);
  }
  return out;
}

export interface HtmlFingerprint {
  exportHtmlSha256: string;
  markupSha256: string;
  markup: string;
  /** Identifiants des règles applicables, dans l'ordre du document. */
  rules: string[];
  /** Texte de chaque règle, par identifiant. */
  ruleText: Map<string, string>;
  invalidSelectors: string[];
}

export function buildFingerprint(raw: RawFingerprint, exportHtml: string): HtmlFingerprint {
  const markup = raw.markup.replace(/@@DATA(\d+)@@/g, (_, n) => {
    const url = raw.dataUrls[Number(n)];
    const mime = /^data:([^;,]*)/.exec(url)?.[1] ?? '';
    return `data:${mime};sha256=${sha(url).slice(0, 16)};len=${url.length}`;
  });
  const ruleText = new Map<string, string>();
  const rules = raw.rules.map((r) => { const id = ruleId(r); ruleText.set(id, ruleLine(r)); return id; });
  return {
    exportHtmlSha256: sha(exportHtml),
    markupSha256: sha(markup),
    markup,
    rules,
    ruleText,
    invalidSelectors: raw.invalidSelectors,
  };
}

/** Fichier partagé des règles : une ligne « id<TAB>contexte<TAB>règle » par règle unique. */
export class RuleStore {
  private readonly rules = new Map<string, string>();
  constructor(private readonly path: string) {
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      this.rules.set(line.slice(0, tab), line.slice(tab + 1));
    }
  }
  get(id: string): string | undefined { return this.rules.get(id); }
  add(fp: HtmlFingerprint): void { for (const [id, text] of fp.ruleText) this.rules.set(id, text); }
  /** Écrit le fichier ; si `keep` est fourni, ne garde que ces identifiants. */
  save(keep?: Set<string>): void {
    const ids = [...this.rules.keys()].filter((id) => !keep || keep.has(id)).sort();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, ids.map((id) => `${id}\t${this.rules.get(id)}`).join('\n') + '\n');
  }
}

export interface HtmlRef {
  exportHtmlSha256: string;
  markupSha256: string;
  rules: string[];
  invalidSelectors: string[];
}

export const toHtmlRef = (fp: HtmlFingerprint): HtmlRef => ({
  exportHtmlSha256: fp.exportHtmlSha256,
  markupSha256: fp.markupSha256,
  rules: fp.rules,
  invalidSelectors: fp.invalidSelectors,
});

/** Plus longue sous-suite commune (identifiants de règles). */
function lcs(a: string[], b: string[]): Set<string> {
  const n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const keep = new Set<string>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { keep.add(a[i]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return keep;
}

export interface HtmlComparison {
  /** Écarts bloquants (balisage ou règles applicables). */
  failures: string[];
  /** Messages informatifs (HTML hors CV). */
  info: string[];
  /** Diff détaillé à écrire dans .out. */
  details: string[];
}

export function compareFingerprint(ref: HtmlRef, refMarkup: string, cur: HtmlFingerprint, store: RuleStore): HtmlComparison {
  const failures: string[] = [], info: string[] = [], details: string[] = [];

  if (ref.markupSha256 !== cur.markupSha256) {
    const d = lineDiff(refMarkup, cur.markup);
    failures.push(`balisage de #printable-cv modifié :\n      ${d.slice(0, 20).join('\n      ')}${d.length > 20 ? '\n      …' : ''}`);
    details.push('== Balisage de #printable-cv (- référence, + actuel) ==', ...d);
  }

  const refSet = new Set(ref.rules), curSet = new Set(cur.rules);
  const added = cur.rules.filter((id) => !refSet.has(id));
  const removed = ref.rules.filter((id) => !curSet.has(id));
  const text = (id: string) => cur.ruleText.get(id) ?? store.get(id) ?? `(règle ${id} absente de _css/rules.txt)`;
  const head = (line: string) => line.slice(0, line.indexOf(' { ') >= 0 ? line.indexOf(' { ') : line.length);
  const ruleLines: string[] = [];
  let ruleChanges = 0;
  const pairedAdded = new Set<string>();
  for (const r of removed) {
    const match = added.find((a) => !pairedAdded.has(a) && head(text(a)) === head(text(r)));
    ruleChanges++;
    if (match) {
      pairedAdded.add(match);
      ruleLines.push(`~ modifiée : ${text(r)}`, `         →  ${text(match)}`);
    } else {
      ruleLines.push(`- supprimée : ${text(r)}`);
    }
  }
  for (const a of added) if (!pairedAdded.has(a)) { ruleChanges++; ruleLines.push(`+ ajoutée : ${text(a)}`); }

  const common = (ids: string[], other: Set<string>) => ids.filter((id) => other.has(id));
  const refCommon = common(ref.rules, curSet), curCommon = common(cur.rules, refSet);
  const inOrder = lcs(refCommon, curCommon);
  const moved = curCommon.filter((id) => !inOrder.has(id));
  if (moved.length) { ruleChanges += moved.length; ruleLines.push(...moved.map((id) => `↕ ordre modifié : ${text(id)}`)); }

  if (ruleLines.length) {
    failures.push(`règles CSS applicables au CV modifiées (${ruleChanges}) :\n      ${ruleLines.slice(0, 12).join('\n      ')}${ruleLines.length > 12 ? '\n      …' : ''}`);
    details.push('== Règles CSS applicables ==', ...ruleLines);
  }

  if (!failures.length && ref.exportHtmlSha256 !== cur.exportHtmlSha256) {
    info.push('HTML d\'export modifié hors CV (CSS de l\'interface…) : informatif, sans effet sur l\'empreinte du CV');
  }
  return { failures, info, details };
}
