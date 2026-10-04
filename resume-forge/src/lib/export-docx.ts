import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, LevelFormat, Table, TableRow, TableCell, WidthType,
  ShadingType, VerticalAlign, ImageRun, ExternalHyperlink,
} from 'docx';
import { CVDocument, CVBlock } from '../types/cv';
import { MasterEntry, Profile } from '../types/profile';
import { CVTemplate } from '../types/template';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isAndroid } from './platform';
import { formatEntryDates, readDateSettings } from './entry-dates';
import { isSubHeader, parentDisplayFormat, visibleHeaderMask, type SlotKind } from './cv-sections';
import { shareBlob } from './share';
import { BADGE_ENTRY_TYPES, buildBadgeRows, itemLabel, SKILL_ITEM_SEPARATOR, type BadgeItem, type BadgeRow } from './skill-lines';


// ── Helpers ────────────────────────────────────────────────────────────────────

function shortenUrl(url: string): string {
  try {
    const clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const linkedinMatch = clean.match(/linkedin\.com\/(in\/[^/?\s]+)/);
    if (linkedinMatch) return linkedinMatch[1];
    const githubMatch = clean.match(/github\.com\/([^/?\s]+)/);
    if (githubMatch) return `github/${githubMatch[1]}`;
    return clean.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function ensureHref(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  if (url.includes('@')) return `mailto:${url}`;
  return `https://${url}`;
}

/** Strip leading '#' and uppercase for docx color fields. */
function docxHex(color: string): string {
  return color.replace(/^#/, '').toUpperCase();
}

/** Decode a data-URL base64 image to Uint8Array. Returns null on failure. */
function base64ToUint8Array(dataUrl: string): { data: Uint8Array; type: string } | null {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|gif|bmp|webp);base64,(.+)$/i);
  if (!match) return null;
  try {
    const type = match[1].toLowerCase().replace('jpeg', 'jpg');
    const binaryStr = atob(match[2]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return { data: bytes, type };
  } catch {
    return null;
  }
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_TABLE_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

// ── Unicode icons for contact items ────────────────────────────────────────────

const CONTACT_ICONS: Record<string, string> = {
  email: '\u2709',      // ✉
  phone: '\u260E',      // ☎
  city: '\u25CB',        // ○
  linkedin: '\u25A0',   // ■ (small square for LinkedIn)
  github: '\u25C6',     // ◆
  portfolio: '\u25CE',  // ◎
};

// ── Photo masking (circular/rounded) via canvas ────────────────────────────────

type PhotoShape = '' | 'rounded-full' | 'rounded-lg' | 'rounded-sm' | 'rounded-none';

/**
 * Apply a shape mask to the photo using an offscreen canvas.
 * Returns a PNG Uint8Array with transparency for the masked areas.
 */
async function maskPhoto(
  imageData: Uint8Array,
  imageType: string,
  size: number,
  shape: PhotoShape,
): Promise<Uint8Array> {
  // If no shape or square, return original data
  if (!shape || shape === 'rounded-none') return imageData;

  // Create a blob from the raw image data
  const mimeType = imageType === 'jpg' ? 'image/jpeg' : `image/${imageType}`;
  const blob = new Blob([imageData], { type: mimeType });
  const url = URL.createObjectURL(blob);

  try {
    // Load the image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    // Create offscreen canvas at desired size
    const canvas = document.createElement('canvas');
    const renderSize = size * 2; // 2x for better quality
    canvas.width = renderSize;
    canvas.height = renderSize;
    const ctx = canvas.getContext('2d')!;

    // Draw the clipping path based on shape
    ctx.beginPath();
    if (shape === 'rounded-full') {
      // Circle
      ctx.arc(renderSize / 2, renderSize / 2, renderSize / 2, 0, Math.PI * 2);
    } else if (shape === 'rounded-lg') {
      // Large rounded corners (12% radius)
      const radius = renderSize * 0.12;
      roundRect(ctx, 0, 0, renderSize, renderSize, radius);
    } else if (shape === 'rounded-sm') {
      // Small rounded corners (6% radius)
      const radius = renderSize * 0.06;
      roundRect(ctx, 0, 0, renderSize, renderSize, radius);
    } else {
      // Fallback: full rectangle
      ctx.rect(0, 0, renderSize, renderSize);
    }
    ctx.closePath();
    ctx.clip();

    // Draw the image filling the clipped area
    ctx.drawImage(img, 0, 0, renderSize, renderSize);

    // Export as PNG (to preserve transparency)
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return bytes;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// ── Display format type (matches PrintableCV) ─────────────────────────────────

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

// ── Main export function ───────────────────────────────────────────────────────

export async function generateDocxBlob(
  cv: CVDocument,
  profile: Profile,
  blocks: CVBlock[],
  entries: MasterEntry[],
  template: CVTemplate
): Promise<Blob> {
  const cvSettings = (cv.settings || {}) as Record<string, string>;
  const dateSettings = readDateSettings(cv.settings);

  // ── Typography ──
  const fontFamily = cvSettings.fontFamily || '';
  const effectiveBodyFont = fontFamily || template.docx.fonts.body;
  const effectiveHeadingFont = fontFamily || template.docx.fonts.heading;
  const fontSizeMap: Record<string, number> = { '10px': 20, '11px': 22, '12px': 24 };
  const effectiveBodySize = fontSizeMap[cvSettings.fontSize] ?? template.docx.bodySize;
  const headingOffset = template.docx.headingSize - template.docx.bodySize;
  const effectiveHeadingSize = effectiveBodySize + headingOffset;

  // ── Margins ──
  const pageMarginMap: Record<string, { top: number; right: number; bottom: number; left: number }> = {
    '24px 28px': { top: 454,  right: 530,  bottom: 454,  left: 530  },
    '32px 36px': { top: 605,  right: 680,  bottom: 605,  left: 680  },
    '40px 48px': { top: 756,  right: 907,  bottom: 756,  left: 907  },
    '48px 56px': { top: 907,  right: 1058, bottom: 907,  left: 1058 },
    '56px 64px': { top: 1058, right: 1210, bottom: 1058, left: 1210 },
  };
  const effectiveMargins =
    (cvSettings.pageMargin && pageMarginMap[cvSettings.pageMargin])
      ? pageMarginMap[cvSettings.pageMargin]
      : template.docx.margins;

  // ── Design settings ──
  const accentColor = cvSettings.primaryColor || '';
  const accentHex = accentColor ? docxHex(accentColor) : '';
  const headerStyle = cvSettings.headerStyle || '';
  const isBanner = ['accent-banner', 'dark-banner', 'gradient-banner'].includes(headerStyle);
  const bannerHex = headerStyle === 'dark-banner' ? '1F2937' : (accentHex || '1F2937');

  // ── Photo ──
  const photoSizeMap: Record<string, number> = {
    '64px': 64, '80px': 80, '96px': 96, '112px': 112, '128px': 128,
  };
  const photoPixels = photoSizeMap[cvSettings.photoSize || ''] || 80;
  const photoShape = (cvSettings.photoShape || '') as PhotoShape;
  const photoData = profile.photoPath ? base64ToUint8Array(profile.photoPath) : null;

  // Apply shape mask to photo if needed
  let finalPhotoData: Uint8Array | null = null;
  let finalPhotoType = 'png';
  if (photoData) {
    try {
      finalPhotoData = await maskPhoto(photoData.data, photoData.type, photoPixels, photoShape);
      finalPhotoType = 'png'; // masked photo is always PNG (for transparency)
    } catch {
      // Fallback: use original image without masking
      finalPhotoData = photoData.data;
      finalPhotoType = photoData.type;
    }
  }

  // ── Effective template ──
  const effectiveTemplate: CVTemplate = {
    ...template,
    docx: {
      ...template.docx,
      fonts: { heading: effectiveHeadingFont, body: effectiveBodyFont },
      bodySize: effectiveBodySize,
      headingSize: effectiveHeadingSize,
      margins: effectiveMargins,
    },
  };

  const B = effectiveTemplate.docx.bodySize;
  const F = effectiveTemplate.docx.fonts.body;
  // Line spacing in TWIPs: 240 = single, 276 ≈ 1.15, 360 = 1.5
  // Use template value but cap at 240 (single) for compact output
  const lineSpacing = Math.min(effectiveTemplate.docx.lineSpacing, 240);
  // Reduced section spacing (before section headers)
  const sectionSpacing = Math.min(effectiveTemplate.docx.sectionSpacing, 140);

  // ── Contact items with Unicode icons ──
  interface ContactItem { icon: string; text: string; href?: string }
  const contactItems: ContactItem[] = [];
  if (profile.email)        contactItems.push({ icon: CONTACT_ICONS.email,     text: profile.email, href: `mailto:${profile.email}` });
  if (profile.phone)        contactItems.push({ icon: CONTACT_ICONS.phone,     text: profile.phone });
  if (profile.city)         contactItems.push({ icon: CONTACT_ICONS.city,      text: profile.city });
  if (profile.linkedinUrl)  contactItems.push({ icon: CONTACT_ICONS.linkedin,  text: shortenUrl(profile.linkedinUrl), href: ensureHref(profile.linkedinUrl) });
  if (profile.githubUrl)    contactItems.push({ icon: CONTACT_ICONS.github,    text: shortenUrl(profile.githubUrl),   href: ensureHref(profile.githubUrl) });
  if (profile.portfolioUrl) contactItems.push({ icon: CONTACT_ICONS.portfolio, text: shortenUrl(profile.portfolioUrl), href: ensureHref(profile.portfolioUrl) });

  /** Build a contact paragraph with Unicode icons (inline hyperlinks separated by " | "). */
  const makeContactParagraph = (textColor: string, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.CENTER): Paragraph => {
    const linkColor = textColor || '444444';
    const children: (TextRun | ExternalHyperlink)[] = [];
    contactItems.forEach((item, idx) => {
      if (idx > 0) children.push(new TextRun({ text: '  |  ', size: B, font: F, color: linkColor }));
      // Icon
      children.push(new TextRun({ text: `${item.icon} `, size: B, font: F, color: linkColor }));
      if (item.href) {
        children.push(new ExternalHyperlink({
          link: item.href,
          children: [new TextRun({
            text: item.text, size: B, font: F, color: linkColor,
            underline: { type: 'single' as any },
          })],
        }));
      } else {
        children.push(new TextRun({ text: item.text, size: B, font: F, color: linkColor }));
      }
    });
    return new Paragraph({
      children,
      alignment,
      spacing: { after: 60 },
    });
  };

  // ── Page dimensions (needed for banner bleed calculations) ──
  const pageWidth = effectiveTemplate.docx.pageSize === 'A4' ? 11906 : 12240;
  const pageHeight = effectiveTemplate.docx.pageSize === 'A4' ? 16838 : 15840;

  // ── Build document sections ──
  const title = cv.targetJob || profile.title;
  const headerChildren: (Paragraph | Table)[] = [];
  const bodyChildren: (Paragraph | Table)[] = [];

  // ── Build header ──
  // For full-bleed banner: use negative table indentation equal to the page
  // margins so the coloured table extends to the physical page edge, while
  // the body text stays within normal margins (single section, no
  // alignment mismatch).
  if (isBanner || finalPhotoData) {
    // ── Table-based header (banner background and/or photo) ──
    const shading = { fill: isBanner ? bannerHex : 'FFFFFF', type: ShadingType.CLEAR, color: 'auto' };
    const textColor = isBanner ? 'FFFFFF' : '';

    const namePara = new Paragraph({
      children: [new TextRun({
        text: `${profile.firstName} ${profile.lastName}`,
        bold: true, size: 32, font: effectiveTemplate.docx.fonts.heading,
        color: textColor || '000000',
      })],
      spacing: { after: 20 },
    });

    const titlePara = title ? new Paragraph({
      children: [new TextRun({
        text: title, size: 24, font: F,
        color: textColor ? 'E0E0E0' : '444444',
      })],
      spacing: { after: 40 },
    }) : null;

    const contactPara = contactItems.length > 0
      ? makeContactParagraph(textColor || '', AlignmentType.LEFT)
      : null;
    const contentChildren: Paragraph[] = [namePara, titlePara, contactPara].filter(Boolean) as Paragraph[];

    // For banners, add extra left padding in the content cell to compensate
    // for the negative indentation so text still aligns with body content.
    const bannerCellPadLeft = isBanner ? effectiveMargins.left : 80;
    const bannerCellPadRight = isBanner ? effectiveMargins.right : 80;

    const contentCell = new TableCell({
      children: contentChildren,
      shading,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 100, bottom: 100, left: bannerCellPadLeft, right: bannerCellPadRight },
      width: finalPhotoData
        ? { size: 80, type: WidthType.PERCENTAGE }
        : { size: 100, type: WidthType.PERCENTAGE },
    });

    const rowCells: TableCell[] = [];
    if (finalPhotoData) {
      const photoPara = new Paragraph({
        children: [new ImageRun({
          data: finalPhotoData,
          transformation: { width: photoPixels, height: photoPixels },
          type: finalPhotoType as any,
        })],
        alignment: AlignmentType.CENTER,
      });
      rowCells.push(new TableCell({
        children: [photoPara],
        shading,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: isBanner ? effectiveMargins.left : 80, right: 40 },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }));
    }
    rowCells.push(contentCell);

    // For banner: use negative indentation to bleed the table to the page edges.
    // Table total width = page width (content area + left margin + right margin).
    const tableIndent = isBanner
      ? { size: -effectiveMargins.left, type: WidthType.DXA }
      : undefined;
    const tableWidth = isBanner
      ? { size: pageWidth - /* just enough for rounding */ 2, type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE };

    headerChildren.push(new Table({
      rows: [new TableRow({ children: rowCells })],
      width: tableWidth as any,
      indent: tableIndent as any,
      borders: NO_TABLE_BORDERS,
    }));
  } else {
    // ── Simple text header (no photo, no banner) ──
    headerChildren.push(new Paragraph({
      text: `${profile.firstName} ${profile.lastName}`,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }));
    if (contactItems.length > 0) {
      headerChildren.push(makeContactParagraph(''));
    }
    if (title) {
      headerChildren.push(new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }));
    }
  }

  // ── Summary ──
  const summary = cv.customSummary || profile.summary;
  if (summary) {
    bodyChildren.push(new Paragraph({
      children: [new TextRun({ text: summary, size: B, font: F })],
      spacing: { after: sectionSpacing, line: lineSpacing },
    }));
  }

  // ── Helper: parse markdown bold/italic into TextRuns ──
  const parseMarkdownText = (text: string): TextRun[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map(part => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return new TextRun({ text: part.slice(2, -2), bold: true, size: B, font: F });
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
        return new TextRun({ text: part.slice(1, -1), italics: true, size: B, font: F });
      return new TextRun({ text: part, size: B, font: F });
    });
  };

  // ── Helper: get display format from nearest preceding section_header ──
  // Le format vient du titre de SECTION parent : un sous-en-tête de catégorie n'en change pas.
  const getDisplayFormat = (blockIndex: number, sortedBlocks: CVBlock[]): DisplayFormat =>
    (parentDisplayFormat(sortedBlocks, blockIndex) as DisplayFormat | undefined) || 'badges';

  // ── Badge groups (lignes partagées avec le rendu écran, voir lib/skill-lines.ts) ──
  const cell = (children: Paragraph[], widthPct: number) => new TableCell({
    children,
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 20, bottom: 20, left: 40, right: 40 },
  });
  const borderlessTable = (rows: TableRow[]): Table[] => rows.length > 0
    ? [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_TABLE_BORDERS })]
    : [];
  /** `**Catégorie** : a · b · c` (libellé en gras, texte brut sans tableau). */
  const categoryRuns = (row: BadgeRow): TextRun[] => [
    new TextRun({ text: row.category ?? '', bold: true, size: B, font: F }),
    new TextRun({ text: ` : ${row.items.map(it => it.name).join(SKILL_ITEM_SEPARATOR)}`, size: B, font: F }),
  ];

  // ── Render badge group according to display format ──
  const renderBadgeGroup = (badgeBlocks: CVBlock[], format: DisplayFormat): (Paragraph | Table)[] => {
    const result: (Paragraph | Table)[] = [];
    const rows = buildBadgeRows(badgeBlocks, entries);
    const categories = rows.filter(r => r.category !== null);
    const loose: BadgeItem[] = rows.find(r => r.category === null)?.items ?? [];
    const labels = loose.map(itemLabel);

    // 1. Catégories de compétences : une ligne (ou une cellule) par catégorie.
    if (format === 'list') {
      categories.forEach(row => {
        result.push(new Paragraph({
          children: [new TextRun({ text: row.category ?? '', bold: true, size: B, font: F })],
          spacing: { before: 40, after: 20, line: lineSpacing },
          keepNext: true,
        }));
        row.items.forEach(item => result.push(new Paragraph({
          children: parseMarkdownText(item.name),
          spacing: { after: 30, line: lineSpacing },
          numbering: { reference: 'default-bullet', level: 0 },
        })));
      });
    } else if (format === 'columns2' || format === 'columns3') {
      const numCols = format === 'columns2' ? 2 : 3;
      const colWidth = Math.floor(100 / numCols);
      const tableRows: TableRow[] = [];
      for (let k = 0; k < categories.length; k += numCols) {
        const cells: TableCell[] = [];
        for (let c = 0; c < numCols; c++) {
          const row = categories[k + c];
          cells.push(cell([new Paragraph({
            children: row ? categoryRuns(row) : [new TextRun({ text: '' })],
            spacing: { after: 20 },
          })], colWidth));
        }
        tableRows.push(new TableRow({ children: cells }));
      }
      result.push(...borderlessTable(tableRows));
    } else if (format === 'table') {
      result.push(...borderlessTable(categories.map(row => new TableRow({
        children: [
          cell([new Paragraph({
            children: [new TextRun({ text: row.category ?? '', bold: true, size: B, font: F })],
            spacing: { after: 20 },
          })], 30),
          cell([new Paragraph({
            children: [new TextRun({ text: row.items.map(it => it.name).join(SKILL_ITEM_SEPARATOR), size: B, font: F })],
            spacing: { after: 20 },
          })], 70),
        ],
      }))));
    } else {
      categories.forEach(row => result.push(new Paragraph({
        children: categoryRuns(row),
        spacing: { after: 40, line: lineSpacing },
      })));
    }

    // 2. Éléments libres (compétences isolées, langues, centres d'intérêt…) : rendu d'origine.
    if (loose.length === 0) return result;

    if (format === 'comma' || format === 'badges') {
      // Inline text separated by " · "
      result.push(new Paragraph({
        children: [new TextRun({ text: labels.join(' · '), size: B, font: F })],
        spacing: { after: 60, line: lineSpacing },
      }));

    } else if (format === 'list') {
      // Bulleted list
      labels.forEach(label => {
        result.push(new Paragraph({
          children: parseMarkdownText(label),
          spacing: { after: 30, line: lineSpacing },
          numbering: { reference: 'default-bullet', level: 0 },
        }));
      });

    } else if (format === 'columns2' || format === 'columns3') {
      // Table-based columns (2 or 3 columns)
      const numCols = format === 'columns2' ? 2 : 3;
      const colWidth = Math.floor(100 / numCols);
      const tableRows: TableRow[] = [];
      for (let k = 0; k < labels.length; k += numCols) {
        const cells: TableCell[] = [];
        for (let c = 0; c < numCols; c++) {
          const label = labels[k + c] || '';
          cells.push(cell([new Paragraph({
            children: label
              ? [new TextRun({ text: `• ${label}`, size: B, font: F })]
              : [new TextRun({ text: '' })],
            spacing: { after: 20 },
          })], colWidth));
        }
        tableRows.push(new TableRow({ children: cells }));
      }
      result.push(...borderlessTable(tableRows));

    } else if (format === 'table') {
      // Two-column table: name | level
      result.push(...borderlessTable(loose.map(({ name, level }) =>
        new TableRow({
          children: [
            cell([new Paragraph({
              children: [new TextRun({ text: name, size: B, font: F })],
              spacing: { after: 20 },
            })], 60),
            cell([new Paragraph({
              children: [new TextRun({ text: level || '', size: B, font: F, italics: true, color: '666666' })],
              spacing: { after: 20 },
              alignment: AlignmentType.RIGHT,
            })], 40),
          ],
        })
      )));
    }

    return result;
  };

  // ── Process blocks ──
  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

  // Aucune section vide (même règle que le rendu écran/PDF, voir lib/cv-sections.ts).
  const visibleBlocks = sortedBlocks.filter(b => b.isVisible);
  const headerMask = visibleHeaderMask(visibleBlocks.map((b): SlotKind => {
    if (b.blockType === 'section_header') return isSubHeader(b) ? 'sub' : 'section';
    if (b.blockType === 'custom_text') return (b.customContent ?? '').trim() ? 'content' : 'skip';
    if (b.blockType === 'entry_ref' && b.entryId && entries.some(e => e.id === b.entryId)) return 'content';
    return 'skip';
  }));
  const hiddenHeaderIds = new Set(visibleBlocks.filter((_, idx) => !headerMask[idx]).map(b => b.id));
  let i = 0;

  while (i < sortedBlocks.length) {
    const block = sortedBlocks[i];
    if (!block.isVisible) { i++; continue; }

    if (block.blockType === 'section_header' && hiddenHeaderIds.has(block.id)) {
      i++;

    } else if (isSubHeader(block) && block.sectionName) {
      // Sous-en-tête de catégorie : simple paragraphe en gras (aucune structure spéciale pour un parseur ATS).
      bodyChildren.push(new Paragraph({
        children: [new TextRun({ text: block.sectionName, bold: true, size: B, font: F })],
        spacing: { before: 80, after: 20 },
        keepNext: true,
      }));
      i++;

    } else if (block.blockType === 'section_header' && block.sectionName) {
      const sectionRun: any = {
        font: effectiveTemplate.docx.fonts.heading,
        size: effectiveTemplate.docx.headingSize,
        bold: true,
      };
      if (accentHex) sectionRun.color = accentHex;

      bodyChildren.push(new Paragraph({
        children: [new TextRun({ ...sectionRun, text: (block.sectionName || '').toUpperCase() })],
        spacing: { before: sectionSpacing, after: 60 },
        keepNext: true, // pas de titre de section orphelin en bas de page
        border: {
          bottom: { color: accentHex || 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
      }));
      i++;

    } else if (block.blockType === 'custom_text' && block.customContent) {
      for (const line of block.customContent.split('\n')) {
        const t = line.trim();
        const isBullet = t.startsWith('- ') || t.startsWith('* ');
        bodyChildren.push(new Paragraph({
          children: parseMarkdownText(isBullet ? t.substring(2).trim() : line),
          spacing: { after: 40, line: lineSpacing },
          numbering: isBullet ? { reference: 'default-bullet', level: 0 } : undefined,
        }));
      }
      i++;

    } else if (block.blockType === 'entry_ref' && block.entryId) {
      const entry = entries.find(e => e.id === block.entryId);
      if (!entry) { i++; continue; }

      if (BADGE_ENTRY_TYPES.includes(entry.entryType)) {
        // Collect consecutive badge entries
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

        const format = getDisplayFormat(i, sortedBlocks);
        const rendered = renderBadgeGroup(badgeGroup, format);
        bodyChildren.push(...rendered);
        i = j;

      } else {
        // Regular entries (experience, education, certification…)
        const entryData = { ...entry, ...(block.overrideData || {}) };
        // Même mise en forme que le PDF (entry-dates.ts) ; « Aujourd'hui » conservé sans date de fin.
        const dateText = formatEntryDates(
          { entryType: entry.entryType, startDate: entryData.startDate as string | null, endDate: entryData.endDate as string | null, isCurrent: entryData.isCurrent as boolean | null },
          (block.overrideData as Record<string, unknown> | undefined)?.datesOverride,
          dateSettings,
          { missingEnd: 'today' },
        );

        const titleText = (entryData.title as string) || '';
        let subtitleText = entryData.subtitle ? ` | ${entryData.subtitle}` : '';
        if (entryData.location) {
          subtitleText += subtitleText ? ` - ${entryData.location}` : ` | ${entryData.location}`;
        }

        const textRuns: TextRun[] = [];
        if (titleText)   textRuns.push(new TextRun({ text: titleText, bold: true, size: B, font: F }));
        if (subtitleText) textRuns.push(new TextRun({ text: subtitleText, italics: true, size: B, font: F }));
        if (dateText)    textRuns.push(new TextRun({ text: `  (${dateText})`, size: B, font: F, color: '666666' }));
        if (!textRuns.length) textRuns.push(new TextRun({ text: '' }));

        bodyChildren.push(new Paragraph({
          children: textRuns,
          spacing: { before: 60, after: 20 },
        }));

        if (entryData.description && typeof entryData.description === 'string') {
          for (const line of entryData.description.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            const isBullet = t.startsWith('- ') || t.startsWith('* ');
            bodyChildren.push(new Paragraph({
              children: parseMarkdownText(isBullet ? t.substring(2).trim() : t),
              spacing: { after: 10, line: lineSpacing },
              numbering: isBullet ? { reference: 'default-bullet', level: 0 } : undefined,
            }));
          }
        }
        i++;
      }
    } else {
      i++;
    }
  }

  // ── Build document with a single section ──
  // Banner full-bleed is achieved via negative table indentation (see above),
  // so header and body share the same section and margins — no alignment mismatch.
  const sections = [{
    properties: {
      page: {
        size: { width: pageWidth, height: pageHeight },
        margin: effectiveTemplate.docx.margins,
      },
    },
    children: [
      ...headerChildren,
      new Paragraph({ text: '', spacing: { after: 80 } }),
      ...bodyChildren,
    ] as Paragraph[],
  }];

  // ── Document ──
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-bullet',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: effectiveTemplate.docx.fonts.body, size: B, language: { value: 'fr-FR' } },
          paragraph: { spacing: { line: lineSpacing } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            font: effectiveTemplate.docx.fonts.heading,
            size: effectiveTemplate.docx.headingSize + 4,
            bold: true,
            ...(accentHex ? { color: accentHex } : {}),
          },
          paragraph: { spacing: { after: 120 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            font: effectiveTemplate.docx.fonts.heading,
            size: effectiveTemplate.docx.headingSize,
            bold: true,
            ...(accentHex ? { color: accentHex } : {}),
          },
          paragraph: {
            spacing: { before: 120, after: 60 },
            border: {
              bottom: { color: accentHex || 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
            },
          },
        },
      ],
    },
    sections,
  });

  return await Packer.toBlob(doc);
}

// ── Export entry point ─────────────────────────────────────────────────────────

export async function exportToDocx(
  cv: CVDocument,
  profile: Profile,
  blocks: CVBlock[],
  entries: MasterEntry[],
  template: CVTemplate
) {
  try {
    const defaultFilename = `${cv.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_ats.docx`;
    const blob = await generateDocxBlob(cv, profile, blocks, entries, template);

    if (isAndroid()) {
      // Sur Android : pas de dialogue de sauvegarde natif → Web Share API
      await shareBlob(
        blob,
        defaultFilename,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      return true;
    }

    // Desktop : dialogue de sauvegarde natif Tauri
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    });
    if (!filePath) return false;

    await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Détail de l'erreur : ${msg}`);
  }
}
