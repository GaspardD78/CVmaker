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
 * Validée contre les PDF réels par les golden tests (tests/golden).
 */

const PX_PER_MM = 96 / 25.4;
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

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
}

export interface PrintOverflow {
  overflows: boolean;
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

interface Fragment { node: Text; text: string; top: number; bottom: number; column: Element | null }

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
      frags.push({ node, text: value, top: rects[0].top, bottom: rects[0].bottom, column });
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
        current = { node, text: '', top: r.top, bottom: r.bottom, column };
        frags.push(current);
      }
      current.text += value[i];
      current.bottom = Math.max(current.bottom, r.bottom);
    }
  }
  return frags;
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
        text: text.replace(/\s+/g, ' ').trim(),
        section: sectionOf(g.frags[0].node),
        column: (g.column?.classList.contains('cv-sidebar') ? 'sidebar' : g.column ? 'main' : 'page') as PrintLine['column'],
        topMm: g.top / PX_PER_MM,
        bottomMm: g.bottom / PX_PER_MM,
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
  return {
    overflows: cut.length > 0,
    contentBottomMm: round(contentBottomMm),
    overflowMm: round(Math.max(0, contentBottomMm - PAGE_HEIGHT_MM)),
    remainingMm: round(Math.max(0, PAGE_HEIGHT_MM - contentBottomMm)),
    hiddenLines: cut.length,
    lastVisibleLine: visible.length ? visible.reduce((a, b) => (b.bottomMm >= a.bottomMm ? b : a)) : null,
    firstCutLine: cut[0] ?? null,
    lines,
  };
}

/**
 * Mesure le dépassement de page du HTML d'export desktop.
 * Doit être appelée dans un navigateur (webview de l'app, ou Chromium pour les tests).
 */
export async function measurePrintOverflow(html: string): Promise<PrintOverflow> {
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
    await doc.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return analyzePrintLayout(doc);
  } finally {
    iframe.remove();
  }
}
