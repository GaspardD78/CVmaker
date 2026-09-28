/**
 * Mesure du dépassement de page à l'export PDF desktop.
 *
 * L'export desktop imprime une seule page A4 : tout contenu au-delà de 297 mm
 * est coupé (voir NOTES.md §6). Cette mesure reproduit les conditions de
 * l'impression pour prévenir l'utilisateur avant l'export :
 * - elle travaille sur le HTML exact envoyé à `generate_pdf`
 *   (`buildDesktopExportHtml`), donc mêmes styles et même enveloppe ;
 * - le document est chargé dans une iframe hors écran de la taille de la page
 *   (210 × 297 mm, marges 0 comme `@page` et `print_to_pdf`) ;
 * - les règles `@media print` sont activées et les règles `@media screen`
 *   désactivées via le CSSOM, y compris dans les règles imbriquées (@layer…) ;
 * - chaque ligne de texte dont le bas dépasse 297 mm est considérée comme coupée.
 *
 * Le dernier résultat complet est gardé en mémoire, associé au HTML mesuré :
 * l'aperçu et la confirmation d'export obtiennent ainsi le même résultat pour
 * un CV inchangé. Une mesure annulée, en échec ou incomplète (polices ou
 * images non chargées) n'est jamais mémorisée.
 *
 * Validée contre les PDF réels par les golden tests (tests/golden).
 */

const PX_PER_MM = 96 / 25.4;
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

/**
 * Largeur (px CSS) de #printable-cv dans le PDF, imposée au CV dans l'iframe
 * de mesure. À l'impression, `@media print` (App.css) place #printable-cv en
 * `position: fixed` ; sa largeur de 100 % suit alors la zone de la page A4
 * (210 mm = 793,70 px), que Chrome tronque à l'entier : 793 px. L'iframe de
 * 210 mm, elle, arrondit sa fenêtre à 794 px : 1 px de plus faisait passer
 * certains mots à la ligne plus tard qu'à l'impression.
 * Mesures (golden tests, Chromium 141) : repère aligné à droite dans un élément
 * fixed imprimé à 793,00 px (794,00 px dans le flux normal) ; avec 793 px,
 * la mesure retrouve les coupures du PDF sur les 10 lignes en écart (4 cas).
 * Vérifiée à chaque cas par le banc (impression de contrôle, voir
 * tests/golden/README.md).
 */
export const PRINT_CV_WIDTH_PX = Math.floor(PAGE_WIDTH_MM * PX_PER_MM);

/**
 * Marge de sécurité (mm) sous laquelle un CV qui tient est signalé « de justesse ».
 * La mesure se fait à l'écran : à l'impression, le texte est très légèrement
 * plus large, et une ligne longue peut passer à la ligne un mot plus tôt,
 * décalant tout le contenu suivant d'environ une ligne. Pire écart observé
 * par les golden tests : 4,6 mm sur 48 cas (5 lignes sur 248, 3 cas
 * long-titles ; voir tests/golden/README.md, section Dépassement de page).
 */
export const OVERFLOW_SAFETY_MARGIN_MM = 5;

export type OverflowStatus = 'dépasse' | 'de justesse' | 'tient';

/** Statut unique partagé par l'aperçu, la confirmation d'export et les tests. */
export function overflowStatus(o: PrintOverflow): OverflowStatus {
  return o.overflows ? 'dépasse' : o.tight ? 'de justesse' : 'tient';
}

/** Écart vertical (px) sous lequel deux fragments de texte sont sur la même ligne. */
const SAME_LINE_PX = 2;

export interface PrintLine {
  /** Texte de la ligne (espaces normalisés). */
  text: string;
  /** Section (titre h3 précédent), ou null avant la première section. */
  section: string | null;
  /** Colonne : bande latérale ou colonne principale (layouts sidebar), sinon page. */
  column: 'sidebar' | 'main' | 'page';
  topMm: number;
  bottomMm: number;
  /**
   * Début de la ligne dans l'arbre du CV, pour la retrouver dans l'aperçu
   * (voir resolveLineAnchor). Le document mesuré est un clone de l'aperçu
   * repassé par du HTML : les nœuds texte adjacents y sont fusionnés, seule la
   * structure des éléments est garantie identique.
   */
  anchor: LineAnchor;
}

export interface LineAnchor {
  /** Indices des éléments enfants depuis #printable-cv jusqu'à l'élément contenant le texte. */
  path: number[];
  /** Position du premier caractère de la ligne dans le textContent de cet élément. */
  offset: number;
  /** Longueur du premier fragment de la ligne dans cet élément. */
  length: number;
}

export interface PrintOverflow {
  overflows: boolean;
  /**
   * Le CV tient, mais avec moins de OVERFLOW_SAFETY_MARGIN_MM de marge :
   * la dernière ligne risque d'être coupée à l'impression.
   */
  tight: boolean;
  /** Bas du dernier texte, en mm depuis le haut de la page. */
  contentBottomMm: number;
  /** Hauteur de contenu au-delà de la page (0 si le CV tient). */
  overflowMm: number;
  /** Marge restante sous le dernier texte (0 si le CV dépasse). */
  remainingMm: number;
  /** Nombre de lignes de texte coupées, entièrement ou en partie. */
  hiddenLines: number;
  /** Dernière ligne entièrement visible (la coupure intervient après elle). */
  lastVisibleLine: PrintLine | null;
  /** Première ligne coupée (entièrement ou en partie). */
  firstCutLine: PrintLine | null;
  /** Toutes les lignes, triées de haut en bas (diagnostic et tests). */
  lines: PrintLine[];
}

/** Active les règles print et neutralise les règles screen, récursivement. */
function activatePrintRules(doc: Document): void {
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      // Pas d'instanceof : les règles appartiennent au contexte JS de l'iframe.
      if (rule.type === CSSRule.MEDIA_RULE) {
        const media = (rule as CSSMediaRule).media;
        const text = media.mediaText.trim();
        if (text === 'print') media.mediaText = 'all';
        else if (text === 'screen') media.mediaText = 'not all';
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) walk(nested);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Feuille inaccessible (cross-origin) : ignorée, comme elle ne serait pas inlinée.
    }
  }
}

interface Fragment { node: Text; start: number; text: string; top: number; bottom: number; column: Element | null }

/** Découpe chaque nœud texte en fragments par ligne visuelle. */
function collectFragments(doc: Document, root: HTMLElement): Fragment[] {
  const frags: Fragment[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const value = node.data;
    if (!value.trim()) continue;
    const column = node.parentElement?.closest('.cv-sidebar, .cv-main-col') ?? null;
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0);
    if (rects.length === 0) continue;
    if (rects.length === 1) {
      frags.push({ node, start: 0, text: value, top: rects[0].top, bottom: rects[0].bottom, column });
      continue;
    }
    // Nœud sur plusieurs lignes : on répartit les caractères par ligne.
    let current: Fragment | null = null;
    for (let i = 0; i < value.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.height === 0) { if (current) current.text += value[i]; continue; }
      if (!current || Math.abs(r.top - current.top) > SAME_LINE_PX) {
        current = { node, start: i, text: '', top: r.top, bottom: r.bottom, column };
        frags.push(current);
      }
      current.text += value[i];
      current.bottom = Math.max(current.bottom, r.bottom);
    }
  }
  return frags;
}

/** Ancrage d'un fragment : chemin d'éléments depuis `root` et position dans le texte de l'élément. */
function anchorOf(root: Element, frag: Fragment): LineAnchor {
  const parent = frag.node.parentElement!;
  const path: number[] = [];
  for (let el: Element = parent; el !== root && el.parentElement; el = el.parentElement) {
    path.unshift(Array.prototype.indexOf.call(el.parentElement.children, el));
  }
  let offset = frag.start;
  const walker = parent.ownerDocument.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && n !== frag.node; n = walker.nextNode()) offset += (n as Text).data.length;
  return { path, offset, length: frag.text.length };
}

const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Retrouve dans `root` (le #printable-cv de l'aperçu) le début d'une ligne
 * mesurée : nœud texte et position du premier caractère. Retourne null si
 * l'arbre ne correspond plus (CV modifié depuis la mesure) : le texte trouvé
 * doit être le début de la ligne.
 */
export function resolveLineAnchor(root: Element, line: PrintLine): { node: Text; offset: number } | null {
  let el: Element | undefined = root;
  for (const i of line.anchor.path) {
    el = el?.children[i];
    if (!el) return null;
  }
  const text = el.textContent ?? '';
  const head = squash(text.slice(line.anchor.offset, line.anchor.offset + line.anchor.length));
  if (!head || !line.text.startsWith(head)) return null;
  let remaining = line.anchor.offset;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    if (remaining < node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  return null;
}

/** Regroupe les fragments en lignes (par colonne pour les layouts sidebar). */
function buildLines(doc: Document, root: HTMLElement, frags: Fragment[]): PrintLine[] {
  const headings = Array.from(root.querySelectorAll('h3'));
  const sectionOf = (node: Node): string | null => {
    let found: string | null = null;
    for (const h of headings) {
      if (h.compareDocumentPosition(node) & doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING) {
        found = (h.textContent ?? '').trim();
      }
    }
    return found;
  };

  const groups: { column: Element | null; top: number; bottom: number; frags: Fragment[] }[] = [];
  for (const f of frags) {
    const g = groups.find((x) => x.column === f.column && Math.abs(x.top - f.top) <= SAME_LINE_PX);
    if (g) { g.frags.push(f); g.bottom = Math.max(g.bottom, f.bottom); }
    else groups.push({ column: f.column, top: f.top, bottom: f.bottom, frags: [f] });
  }

  return groups
    .map((g) => {
      let text = '';
      for (const f of g.frags) {
        if (text && !/\s$/.test(text) && !/^\s/.test(f.text)) text += ' ';
        text += f.text;
      }
      return {
        text: squash(text),
        section: sectionOf(g.frags[0].node),
        column: (g.column?.classList.contains('cv-sidebar') ? 'sidebar' : g.column ? 'main' : 'page') as PrintLine['column'],
        topMm: g.top / PX_PER_MM,
        bottomMm: g.bottom / PX_PER_MM,
        anchor: anchorOf(root, g.frags[0]),
      };
    })
    .filter((l) => l.text)
    .sort((a, b) => a.topMm - b.topMm);
}

/** Analyse un document déjà mis en page aux dimensions de la page. */
export function analyzePrintLayout(doc: Document): PrintOverflow {
  const root = doc.getElementById('printable-cv');
  if (!root) throw new Error('measurePrintOverflow : #printable-cv absent du document');
  const lines = buildLines(doc, root, collectFragments(doc, root));
  const contentBottomMm = lines.reduce((m, l) => Math.max(m, l.bottomMm), 0);
  const cut = lines.filter((l) => l.bottomMm > PAGE_HEIGHT_MM);
  const visible = lines.filter((l) => l.bottomMm <= PAGE_HEIGHT_MM);
  const round = (v: number) => Math.round(v * 10) / 10;
  const remainingMm = round(Math.max(0, PAGE_HEIGHT_MM - contentBottomMm));
  return {
    overflows: cut.length > 0,
    tight: cut.length === 0 && remainingMm < OVERFLOW_SAFETY_MARGIN_MM,
    contentBottomMm: round(contentBottomMm),
    overflowMm: round(Math.max(0, contentBottomMm - PAGE_HEIGHT_MM)),
    remainingMm,
    hiddenLines: cut.length,
    lastVisibleLine: visible.length ? visible.reduce((a, b) => (b.bottomMm >= a.bottomMm ? b : a)) : null,
    firstCutLine: cut[0] ?? null,
    lines,
  };
}

export interface MeasureOptions {
  /** Annule la mesure (l'appelant a un CV plus récent à mesurer). */
  signal?: AbortSignal;
}

/** Dernière mesure complète, associée au HTML mesuré. */
let lastComplete: { html: string; result: PrintOverflow } | null = null;

/** Résultat mémorisé pour ce HTML exact, ou null (exposé pour les tests). */
export function cachedPrintOverflow(html: string): PrintOverflow | null {
  return lastComplete?.html === html ? structuredClone(lastComplete.result) : null;
}

/** Vide la mémoire (tests uniquement). */
export function clearPrintOverflowCache(): void {
  lastComplete = null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Mesure annulée', 'AbortError');
}

/** Toutes les polices chargées sans erreur, et toutes les images décodées. */
async function resourcesReady(doc: Document): Promise<boolean> {
  await doc.fonts.ready;
  let fontsOk = doc.fonts.status === 'loaded';
  doc.fonts.forEach((face) => { if (face.status === 'error' || face.status === 'loading') fontsOk = false; });
  const images = await Promise.all(
    Array.from(doc.images).map((img) => img.decode().then(() => true, () => false)),
  );
  return fontsOk && images.every(Boolean);
}

/**
 * Mesure le dépassement de page du HTML d'export desktop.
 * Doit être appelée dans un navigateur (webview de l'app, ou Chromium pour les tests).
 * Rejette avec une DOMException « AbortError » si `options.signal` est déclenché.
 */
export async function measurePrintOverflow(html: string, options: MeasureOptions = {}): Promise<PrintOverflow> {
  const cached = cachedPrintOverflow(html);
  if (cached) return cached;
  throwIfAborted(options.signal);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH_MM}mm;height:${PAGE_HEIGHT_MM}mm;` +
    'border:0;margin:0;padding:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("measurePrintOverflow : document de l'iframe inaccessible");
    doc.open();
    doc.write(html);
    doc.close();
    activatePrintRules(doc);
    // Largeur du CV à l'impression (voir PRINT_CV_WIDTH_PX), en dernier pour l'emporter.
    const width = doc.createElement('style');
    width.textContent = `#printable-cv { width: ${PRINT_CV_WIDTH_PX}px !important; }`;
    doc.head.appendChild(width);
    throwIfAborted(options.signal);
    const complete = await resourcesReady(doc);
    throwIfAborted(options.signal);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    throwIfAborted(options.signal);
    const result = analyzePrintLayout(doc);
    if (complete) lastComplete = { html, result: structuredClone(result) };
    return result;
  } finally {
    iframe.remove();
  }
}
