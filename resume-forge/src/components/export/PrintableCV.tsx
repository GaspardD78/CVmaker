import { forwardRef } from 'react';
import { CVDocument, CVBlock } from '../../types/cv';
import { MasterEntry, Profile, EntryType } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { CVHeader } from './CVHeader';
import { CVSectionHeader } from './CVSectionHeader';
import { CVEntryBlock } from './CVEntryBlock';
import { CVBadgeGroup } from './CVBadgeGroup';
import { CVCustomText } from './CVCustomText';
import { CVSidebar, type SidebarSection } from './CVSidebar';
import { safeCssValue, type CssValueKind } from '../../lib/css-sanitize';

/** Relative luminance of a #rgb / #rrggbb color (0 = black, 1 = white). */
function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0; // assume dark when unknown
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Narrow-column display formats degrade to a simple list in the sidebar. */
function sidebarFormat(format: DisplayFormat): DisplayFormat {
  return format === 'columns2' || format === 'columns3' || format === 'table' ? 'list' : format;
}

const FONT_STACKS: Record<string, string> = {
  'Calibri': "'Calibri', 'Arial', sans-serif",
  'Arial': "'Arial', sans-serif",
  'Georgia': "'Georgia', serif",
  'Times New Roman': "'Times New Roman', serif",
  'Helvetica': "'Helvetica', 'Arial', sans-serif",
};

/**
 * Plafond de letter-spacing du texte du CV (lisibilité ATS). Au-delà d'environ
 * 0,09 em, les extracteurs de texte PDF (pdfjs-dist, pdftotext, pdfminer.six,
 * pypdf) insèrent des espaces entre les lettres (« E X P É R I E N C E ») et un
 * ATS ne reconnaît plus le mot. Mesures : tests/golden/README.md.
 * Appliqué aux titres de section, aux titres de la bande latérale, au nom et au
 * poste visé, seulement quand le template déclare un espacement plus grand.
 */
export const MAX_LETTER_SPACING_EM = 0.06;
/**
 * Espace minimal (px) exigé par le banc entre la fin de l'intitulé et la date
 * d'une entrée (garde-fou, voir tests/golden/README.md, section Collision
 * intitulé / date). Les extracteurs de texte PDF collent les mots sous 1 px et
 * insèrent une espace dès 1,5 px (mesures à 11 px) : le seuil laisse un facteur 2.
 */
export const ENTRY_DATE_MIN_GAP_PX = 3;
/**
 * Collision intitulé / date : quand la ligne d'une entrée est pleine, l'intitulé
 * touche la date (écart nul) et les extracteurs de texte PDF collent les mots
 * (« Parisfévrier »). Espace minimal garanti entre les deux (`column-gap`, 0,4 em
 * à 11 px, au-dessus du seuil de 1,5 px des extracteurs).
 */
const ENTRY_DATE_GAP_PX = 4;
/** Espace ajouté entre les mots des éléments plafonnés (compensation visuelle ; 0 = aucune). */
const CAPPED_WORD_SPACING_EM = 0;

/** Letter-spacing (em) des classes Tailwind `tracking-*` d'un template, ou null. */
const TRACKING_EM: Record<string, number> = {
  'tracking-tighter': -0.05, 'tracking-tight': -0.025, 'tracking-normal': 0,
  'tracking-wide': 0.025, 'tracking-wider': 0.05, 'tracking-widest': 0.1,
};
function trackingEm(classes: string | undefined): number | null {
  let value: number | null = null;
  for (const cls of (classes ?? '').split(/\s+/)) {
    const arbitrary = /^tracking-\[(-?[\d.]+)em\]$/.exec(cls);
    if (arbitrary) value = parseFloat(arbitrary[1]);
    else if (cls in TRACKING_EM) value = TRACKING_EM[cls];
  }
  return value;
}

/** Règle ramenant `selector` au plafond si les classes du template le dépassent. */
function letterSpacingCap(selector: string, classes: string | undefined): string {
  const em = trackingEm(classes);
  if (em === null || em <= MAX_LETTER_SPACING_EM) return '';
  const words = CAPPED_WORD_SPACING_EM ? ` word-spacing: ${CAPPED_WORD_SPACING_EM}em;` : '';
  return `${selector} { letter-spacing: ${MAX_LETTER_SPACING_EM}em;${words} }`;
}

/** Entry types rendered as inline badges instead of full entry blocks */
const BADGE_ENTRY_TYPES: EntryType[] = ['skill', 'language', 'interest', 'certification'];

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

interface PrintableCVProps {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
  template: CVTemplate;
}

export const PrintableCV = forwardRef<HTMLDivElement, PrintableCVProps>(
  ({ cv, profile, blocks, entries, template }, ref) => {
    const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

    const title = cv.targetJob || profile.title;
    const summary = cv.customSummary || profile.summary;

    // Design settings — chaque valeur interpolée dans cssOverrides passe par
    // safeCssValue : les réglages viennent de la DB (backup/sync importables)
    // et ne doivent pas pouvoir injecter de CSS arbitraire.
    const settings = (cv.settings || {}) as Record<string, string>;
    const s = (key: string, kind: CssValueKind): string => safeCssValue(settings[key] || '', kind);
    const fontStack = (key: string): string =>
      settings[key] ? (FONT_STACKS[settings[key]] || s(key, 'fontFamily')) : '';

    const fontFamily = FONT_STACKS[settings.fontFamily || 'Calibri'] || FONT_STACKS['Calibri'];
    const fontSize = s('fontSize', 'length') || '11px';
    const primaryColor = s('primaryColor', 'color');
    const pageMargin = s('pageMargin', 'length');
    const sectionBorderStyle = s('sectionBorderStyle', 'keyword');

    const headerFontSize      = s('headerFontSize', 'length');
    const headerFontFamily    = fontStack('headerFontFamily');
    const headerFontWeight    = s('headerFontWeight', 'keyword');
    const headerTextTransform = s('headerTextTransform', 'keyword');
    const headerTextAlign     = s('headerTextAlign', 'keyword');
    const subtitleFontSize    = s('subtitleFontSize', 'length');
    const subtitleFontFamily  = fontStack('subtitleFontFamily');
    const subtitleFontStyle   = s('subtitleFontStyle', 'keyword');
    const subtitleFontWeight  = s('subtitleFontWeight', 'keyword');
    const bodyFontFamily      = fontStack('bodyFontFamily');
    const bodyFontSize        = s('bodyFontSize', 'length');
    const bodyTextAlign       = s('bodyTextAlign', 'keyword');
    const bodyLineHeight      = s('bodyLineHeight', 'length');
    const entrySpacing        = s('entrySpacing', 'length');
    const sectionHeaderGap    = s('sectionHeaderGap', 'length');
    const entryTitleGap       = s('entryTitleGap', 'length');
    const summaryFontFamily   = fontStack('summaryFontFamily');
    const summaryFontSize     = s('summaryFontSize', 'length');
    const summaryFontStyle    = s('summaryFontStyle', 'keyword');
    const summaryFontWeight   = s('summaryFontWeight', 'keyword');
    const summaryTextAlign    = s('summaryTextAlign', 'keyword');
    const summaryLineHeight   = s('summaryLineHeight', 'length');

    // Photo settings
    const photoShape  = settings.photoShape  || '';
    const photoSize   = settings.photoSize   || '';
    const photoBorder = settings.photoBorder || '';

    // Header style
    const headerStyle = settings.headerStyle || '';

    // CV header (name / job title / contact) settings
    const nameFontSize      = s('nameFontSize', 'length');
    const nameFontWeight    = s('nameFontWeight', 'keyword');
    const nameTextTransform = s('nameTextTransform', 'keyword');
    const nameLineBreak     = settings.nameLineBreak     || '';
    const titleFontSize     = s('titleFontSize', 'length');
    const titleFontStyle    = s('titleFontStyle', 'keyword');
    const contactFontSize   = s('contactFontSize', 'length');
    const isBanner = ['accent-banner', 'dark-banner', 'gradient-banner'].includes(headerStyle);

    // ── Layout deux colonnes (templates graphiques) ──────────────────────────
    const isSidebar = template.layout === 'sidebar-left' || template.layout === 'sidebar-right';
    const sidebarOnRight = template.layout === 'sidebar-right';
    const accentColor = primaryColor || template.palettes?.[0]?.accent || '#1f2937';
    const sidebarBg = template.sidebar?.bg || accentColor;
    const sidebarIsDark = hexLuminance(sidebarBg) < 0.5;
    const sidebarText = template.sidebar?.text || (sidebarIsDark ? '#ffffff' : '#1f2937');
    const sidebarHeading = template.sidebar?.heading || sidebarText;
    const sidebarWidth = template.sidebar?.width || '34%';
    // Padding de la colonne principale = marge de page (densité) ou défaut.
    const mainPad = pageMargin || '40px 44px';
    // Couleurs adaptées au contraste de la bande (clair vs sombre).
    const sbBadgeBg     = sidebarIsDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)';
    const sbBadgeBorder = sidebarIsDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.12)';
    const sbRule        = sidebarIsDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.12)';
    const sbRing        = sidebarIsDark ? 'rgba(255,255,255,0.5)'  : 'rgba(0,0,0,0.18)';

    // Compute effective container padding for full-width banner bleed (negative margin trick)
    const getBannerPad = () => {
      if (pageMargin) {
        const parts = pageMargin.trim().split(/\s+/);
        return { v: parts[0], h: parts[1] || parts[0] };
      }
      // Extract from template containerClass: 'p-10' → 40px, 'p-12' → 48px
      const m = template.preview.containerClass.match(/\bp-(\d+)\b/);
      const px = m ? parseInt(m[1]) * 4 : 40;
      return { v: `${px}px`, h: `${px}px` };
    };

    const bannerColor = primaryColor || '#1f2937';
    const headerBlockStyle: React.CSSProperties = (() => {
      if (isBanner) {
        const { v, h } = getBannerPad();
        return {
          marginLeft: `-${h}`, marginRight: `-${h}`,
          marginTop: `-${v}`,
          paddingLeft: h, paddingRight: h,
          paddingTop: v, paddingBottom: v,
          marginBottom: '1.5rem',
          ...(headerStyle === 'gradient-banner'
            ? { background: `linear-gradient(135deg, ${bannerColor} 0%, ${bannerColor}bb 100%)` }
            : { backgroundColor: headerStyle === 'dark-banner' ? '#1f2937' : bannerColor }),
        };
      }
      if (headerStyle === 'accent-light') {
        return {
          backgroundColor: primaryColor ? `${primaryColor}18` : '#f3f4f6',
          padding: '14px 18px',
          borderRadius: '6px',
          borderLeft: `3px solid ${primaryColor || '#9ca3af'}`,
          marginBottom: '1.25rem',
        };
      }
      return {};
    })();

    const h3Rules = [
      primaryColor       ? `color: ${primaryColor}; border-color: ${primaryColor};` : '',
      headerFontSize     ? `font-size: ${headerFontSize};`                          : '',
      headerFontWeight   ? `font-weight: ${headerFontWeight};`                      : '',
      headerTextTransform? `text-transform: ${headerTextTransform};`                : '',
      headerTextAlign    ? `text-align: ${headerTextAlign};`                        : '',
      sectionBorderStyle ? `border-bottom-style: ${sectionBorderStyle};`            : '',
      sectionBorderStyle === 'none' ? `border-bottom-width: 0; padding-bottom: 0;`  : '',
    ].filter(Boolean).join(' ');

    const cssOverrides = [
      // Lisibilité ATS : pas de ligatures. Les glyphes ﬀ ﬁ ﬂ ﬃ ﬄ (U+FB00 à U+FB04)
      // sont extraits tels quels par pdfminer et pypdf (« certiﬁcation »).
      // Aussi à l'écran : l'aperçu et la mesure de page doivent suivre le PDF.
      '#printable-cv { font-variant-ligatures: none; }',
      // Lisibilité ATS : intitulé et date d'une entrée séparés (voir ENTRY_DATE_GAP_PX).
      // Un espace placé dans le HTML entre les deux éléments d'une rangée flex est
      // ignoré à la mise en page, donc absent du PDF : l'espace est rendu par un
      // pseudo-élément (`white-space: pre` le conserve) en fin de bloc d'intitulé.
      // Il reste dans le texte du PDF même si l'écart tombait à zéro, sans toucher à
      // la boîte de la date (en début de date, il décalerait ses lignes repliées).
      `#printable-cv .cv-title-row { column-gap: ${ENTRY_DATE_GAP_PX}px; }`,
      '#printable-cv .cv-title-row > :first-child::after { content: " "; white-space: pre; }',
      // Lisibilité ATS : plafond de letter-spacing (voir MAX_LETTER_SPACING_EM).
      letterSpacingCap('#printable-cv h3', template.preview.headingClass),
      letterSpacingCap('#printable-cv .cv-name', template.preview.nameClass),
      letterSpacingCap('#printable-cv .cv-job-title', template.preview.headerTitleClass),
      h3Rules ? `#printable-cv h3 { ${h3Rules} }` : '',
      headerFontFamily   ? `#printable-cv h3 { font-family: ${headerFontFamily} !important; }` : '',
      fontSize !== '11px'
        ? `#printable-cv p, #printable-cv li, #printable-cv .cv-desc, #printable-cv .cv-badge-item { font-size: ${fontSize} !important; }`
        : '',
      subtitleFontFamily ? `#printable-cv .cv-title, #printable-cv .cv-subtitle, #printable-cv .cv-date { font-family: ${subtitleFontFamily} !important; }` : '',
      subtitleFontSize   ? `#printable-cv .cv-title, #printable-cv .cv-subtitle, #printable-cv .cv-date { font-size: ${subtitleFontSize} !important; }` : '',
      subtitleFontStyle  ? `#printable-cv .cv-title, #printable-cv .cv-subtitle, #printable-cv .cv-date { font-style: ${subtitleFontStyle} !important; }` : '',
      subtitleFontWeight ? `#printable-cv .cv-title, #printable-cv .cv-subtitle, #printable-cv .cv-date { font-weight: ${subtitleFontWeight} !important; }` : '',
      bodyFontFamily     ? `#printable-cv p, #printable-cv li, #printable-cv .cv-desc { font-family: ${bodyFontFamily} !important; }` : '',
      bodyFontSize       ? `#printable-cv p, #printable-cv li, #printable-cv .cv-desc, #printable-cv .cv-badge-item { font-size: ${bodyFontSize} !important; }` : '',
      bodyTextAlign      ? `#printable-cv .cv-desc, #printable-cv .cv-desc p, #printable-cv .cv-desc li { text-align: ${bodyTextAlign} !important; }` : '',
      bodyLineHeight     ? `#printable-cv .cv-desc, #printable-cv .cv-desc p, #printable-cv .cv-desc li { line-height: ${bodyLineHeight} !important; }` : '',
      entrySpacing       ? `#printable-cv .cv-entry { margin-bottom: ${entrySpacing} !important; }` : '',
      sectionHeaderGap   ? `#printable-cv h3 { margin-bottom: ${sectionHeaderGap} !important; }` : '',
      entryTitleGap      ? `#printable-cv .cv-title-row { margin-bottom: ${entryTitleGap} !important; }` : '',
      summaryFontFamily  ? `#printable-cv .cv-summary { font-family: ${summaryFontFamily} !important; }` : '',
      summaryFontSize    ? `#printable-cv .cv-summary { font-size: ${summaryFontSize} !important; }` : '',
      summaryFontStyle   ? `#printable-cv .cv-summary { font-style: ${summaryFontStyle} !important; }` : '',
      summaryFontWeight  ? `#printable-cv .cv-summary { font-weight: ${summaryFontWeight} !important; }` : '',
      summaryTextAlign   ? `#printable-cv .cv-summary { text-align: ${summaryTextAlign} !important; }` : '',
      summaryLineHeight  ? `#printable-cv .cv-summary { line-height: ${summaryLineHeight} !important; }` : '',
      (!isSidebar && pageMargin) ? `#printable-cv { padding: ${pageMargin} !important; }` : '',
      isSidebar ? '' : (() => {
        let pv: string, ph: string;
        if (pageMargin) {
          const parts = pageMargin.trim().split(/\s+/);
          pv = parts[0]; ph = parts[1] || parts[0];
        } else {
          pv = '8px'; ph = '10px';
        }
        const rules = [`@media print { #printable-cv { padding: ${pv} ${ph} !important; } }`];
        if (isBanner) {
          rules.push(
            `@media print { #printable-cv .cv-header-block { ` +
            `margin-left: -${ph} !important; margin-right: -${ph} !important; margin-top: -${pv} !important; ` +
            `padding-left: ${ph} !important; padding-right: ${ph} !important; padding-top: ${pv} !important; } }`
          );
        }
        return rules.join('\n');
      })(),
      nameFontSize      ? `#printable-cv .cv-name { font-size: ${nameFontSize} !important; }` : '',
      nameFontWeight    ? `#printable-cv .cv-name { font-weight: ${nameFontWeight} !important; }` : '',
      nameTextTransform ? `#printable-cv .cv-name { text-transform: ${nameTextTransform} !important; }` : '',
      titleFontSize     ? `#printable-cv .cv-job-title { font-size: ${titleFontSize} !important; }` : '',
      titleFontStyle    ? `#printable-cv .cv-job-title { font-style: ${titleFontStyle} !important; }` : '',
      contactFontSize   ? `#printable-cv .cv-contact-info { font-size: ${contactFontSize} !important; }` : '',
      primaryColor       ? `#printable-cv .cv-badge { border-color: ${primaryColor}30; background-color: ${primaryColor}10; color: ${primaryColor}; }` : '',
      primaryColor       ? `#printable-cv { border-color: ${primaryColor}; }` : '',
      primaryColor       ? `#printable-cv .cv-subtitle { color: ${primaryColor} !important; }` : '',
      primaryColor       ? `#printable-cv .cv-job-title { color: ${primaryColor} !important; }` : '',
      primaryColor       ? `#printable-cv h3::after { background-color: ${primaryColor} !important; }` : '',
      primaryColor       ? `#printable-cv h3::before { color: ${primaryColor} !important; }` : '',
      isBanner ? `#printable-cv .cv-header-block, #printable-cv .cv-header-block * { color: white !important; }` : '',
      isBanner ? `#printable-cv .cv-header-block .cv-badge { background-color: rgba(255,255,255,0.15) !important; border-color: rgba(255,255,255,0.4) !important; color: white !important; }` : '',
      // ── Bande latérale (templates graphiques) ──────────────────────────────
      isSidebar ? `#printable-cv { display: flex; align-items: stretch; padding: 0 !important; min-height: 297mm; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar { flex: 0 0 ${sidebarWidth}; width: ${sidebarWidth}; background: ${sidebarBg}; color: ${sidebarText}; padding: 30px 24px; box-sizing: border-box; ${sidebarOnRight ? 'order: 2;' : ''} }` : '',
      isSidebar ? `#printable-cv .cv-main-col { flex: 1 1 auto; min-width: 0; padding: ${mainPad}; box-sizing: border-box; ${sidebarOnRight ? 'order: 1;' : ''} }` : '',
      isSidebar ? `#printable-cv .cv-sidebar a { color: inherit; text-decoration: none; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar, #printable-cv .cv-sidebar p, #printable-cv .cv-sidebar li, #printable-cv .cv-sidebar span, #printable-cv .cv-sidebar .cv-badge-item { color: ${sidebarText} !important; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar { font-size: 11.5px; line-height: 1.5; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar-heading { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: ${MAX_LETTER_SPACING_EM}em;${CAPPED_WORD_SPACING_EM ? ` word-spacing: ${CAPPED_WORD_SPACING_EM}em;` : ''} color: ${sidebarHeading}; border-bottom: 1px solid ${sbRule}; padding-bottom: 5px; margin-bottom: 10px; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar-icon svg { opacity: 0.85; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar-photo-ring { border: 3px solid ${sbRing}; }` : '',
      isSidebar ? `#printable-cv .cv-sidebar .cv-badge { background-color: ${sbBadgeBg} !important; border-color: ${sbBadgeBorder} !important; color: ${sidebarText} !important; }` : '',
      // La colonne principale conserve les couleurs d'accent du template.
      isSidebar && primaryColor ? `#printable-cv .cv-main-col h3 { color: ${primaryColor}; border-color: ${primaryColor}; }` : '',
    ].filter(Boolean).join('\n');

    const hasPhoto = Boolean(profile.photoPath);

    // Pre-process blocks to group badge entries
    type RenderItem =
      | { type: 'block'; block: CVBlock }
      | { type: 'badge-group'; blocks: CVBlock[]; format: DisplayFormat };

    const renderItems: RenderItem[] = [];
    let i = 0;
    while (i < sortedBlocks.length) {
      const block = sortedBlocks[i];
      if (!block.isVisible) { i++; continue; }

      if (block.blockType === 'entry_ref' && block.entryId) {
        const entry = entries.find(e => e.id === block.entryId);
        if (entry && BADGE_ENTRY_TYPES.includes(entry.entryType)) {
          const badgeGroup: CVBlock[] = [block];
          let j = i + 1;
          while (j < sortedBlocks.length) {
            const next = sortedBlocks[j];
            if (!next.isVisible) { j++; continue; }
            if (next.blockType !== 'entry_ref' || !next.entryId) break;
            const nextEntry = entries.find(e => e.id === next.entryId);
            if (!nextEntry || !BADGE_ENTRY_TYPES.includes(nextEntry.entryType)) break;
            badgeGroup.push(next);
            j++;
          }
          let format: DisplayFormat = 'badges';
          for (let k = i - 1; k >= 0; k--) {
            if (sortedBlocks[k].blockType === 'section_header') {
              format = (sortedBlocks[k].overrideData?.displayFormat as DisplayFormat) || 'badges';
              break;
            }
          }
          renderItems.push({ type: 'badge-group', blocks: badgeGroup, format });
          i = j;
          continue;
        }
      }

      renderItems.push({ type: 'block', block });
      i++;
    }

    // For sidebar layouts, split sections: badge-only sections (skills, langues,
    // intérêts, certifications) go to the sidebar; everything else stays in the
    // main column. Sections are delimited by section_header blocks.
    const sidebarSections: SidebarSection[] = [];
    const mainItems: RenderItem[] = isSidebar ? [] : renderItems;
    if (isSidebar) {
      type Group = { header: CVBlock | null; items: RenderItem[] };
      const groups: Group[] = [];
      let current: Group | null = null;
      for (const item of renderItems) {
        if (item.type === 'block' && item.block.blockType === 'section_header') {
          current = { header: item.block, items: [] };
          groups.push(current);
        } else {
          if (!current) { current = { header: null, items: [] }; groups.push(current); }
          current.items.push(item);
        }
      }
      for (const g of groups) {
        const badgeOnly = g.items.length > 0 && g.items.every(it => it.type === 'badge-group');
        if (badgeOnly && g.header) {
          const blocks = g.items.flatMap(it => (it.type === 'badge-group' ? it.blocks : []));
          const first = g.items.find(it => it.type === 'badge-group') as Extract<RenderItem, { type: 'badge-group' }>;
          sidebarSections.push({
            id: g.header.id,
            sectionName: g.header.sectionName,
            blocks,
            format: sidebarFormat(first.format),
          });
        } else {
          if (g.header) mainItems.push({ type: 'block', block: g.header });
          mainItems.push(...g.items);
        }
      }
    }

    const renderItem = (item: RenderItem, idx: number) => {
      if (item.type === 'badge-group') {
        return (
          <div key={`badge-${idx}`} className="cv-entry mb-3 print:break-inside-avoid">
            <CVBadgeGroup blocks={item.blocks} entries={entries} template={template} format={item.format} />
          </div>
        );
      }

      const block = item.block;

      if (block.blockType === 'section_header') {
        return <CVSectionHeader key={block.id} sectionName={block.sectionName} template={template} />;
      }

      if (block.blockType === 'custom_text') {
        return <CVCustomText key={block.id} content={block.customContent || ''} template={template} />;
      }

      if (block.blockType === 'entry_ref' && block.entryId) {
        const entry = entries.find((e) => e.id === block.entryId);
        if (!entry) return null;
        return <CVEntryBlock key={block.id} block={block} entry={entry} template={template} />;
      }

      return null;
    };

    // ── Layout deux colonnes (templates graphiques) ──────────────────────────
    if (isSidebar) {
      return (
        <div
          id="printable-cv"
          ref={ref}
          style={{ fontFamily }}
          className={`${template.preview.containerClass} bg-white text-black dark:bg-white dark:text-black print:shadow-none print:m-0 print:w-full print:max-w-none`}
        >
          {cssOverrides && <style dangerouslySetInnerHTML={{ __html: cssOverrides }} />}

          <CVSidebar
            profile={profile}
            entries={entries}
            template={template}
            sections={sidebarSections}
            hasPhoto={hasPhoto}
            photoShape={photoShape}
            photoSize={photoSize}
            photoBorder={photoBorder}
          />

          <div className="cv-main-col">
            <div className="cv-header-block mb-4">
              <h1 className={`cv-name ${template.preview.nameClass || 'text-3xl font-bold mb-1'}`}>
                {nameLineBreak === 'split'
                  ? <>{profile.firstName}<br />{profile.lastName}</>
                  : `${profile.firstName} ${profile.lastName}`}
              </h1>
              {title && (
                <h2 className={`cv-job-title ${template.preview.headerTitleClass || 'text-xl font-semibold text-gray-700'}`}>
                  {title}
                </h2>
              )}
            </div>

            {summary && (
              <div className="mb-5">
                <p className={`cv-summary ${template.preview.summaryClass || template.preview.descriptionClass}`}>{summary}</p>
              </div>
            )}

            {mainItems.map((item, idx) => renderItem(item, idx))}
          </div>
        </div>
      );
    }

    return (
      <div
        id="printable-cv"
        ref={ref}
        style={{ fontFamily }}
        className={`${template.preview.containerClass} bg-white text-black dark:bg-white dark:text-black print:shadow-none print:m-0 print:p-0 print:w-full print:max-w-none`}
      >
        {cssOverrides && (
          <style dangerouslySetInnerHTML={{ __html: cssOverrides }} />
        )}

        {/* Header Section */}
        <CVHeader
          profile={profile}
          title={title}
          template={template}
          hasPhoto={hasPhoto}
          photoShape={photoShape}
          photoSize={photoSize}
          photoBorder={photoBorder}
          primaryColor={primaryColor}
          isBanner={isBanner}
          headerStyle={headerStyle}
          headerBlockStyle={headerBlockStyle}
          nameLineBreak={nameLineBreak}
        />

        {/* Separator — hidden for full-width banners */}
        {!isBanner && (
          <hr className="border-t border-gray-300 mb-4 print:border-gray-400" style={primaryColor ? { borderColor: primaryColor } : undefined} />
        )}

        {summary && (
          <div className="mb-5">
            <p className={`cv-summary ${template.preview.summaryClass || template.preview.descriptionClass}`}>{summary}</p>
          </div>
        )}

        {/* Dynamic Blocks */}
        {mainItems.map((item, idx) => renderItem(item, idx))}
      </div>
    );
  }
);

PrintableCV.displayName = 'PrintableCV';
