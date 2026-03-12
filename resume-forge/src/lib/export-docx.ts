import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, LevelFormat, Table, TableRow, TableCell, WidthType,
  ShadingType, VerticalAlign, ImageRun, ExternalHyperlink,
} from 'docx';
import { CVDocument, CVBlock } from '../types/cv';
import { MasterEntry, Profile, EntryType } from '../types/profile';
import { CVTemplate } from '../types/template';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Aujourd\'hui';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

function formatDateYear(dateString: string | null): string {
  if (!dateString) return 'Aujourd\'hui';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { year: 'numeric' }).format(date);
}

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

// ── Main export function ───────────────────────────────────────────────────────

export async function generateDocxBlob(
  cv: CVDocument,
  profile: Profile,
  blocks: CVBlock[],
  entries: MasterEntry[],
  template: CVTemplate
): Promise<Blob> {
  const cvSettings = (cv.settings || {}) as Record<string, string>;

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
    '24px 28px': { top: 567,  right: 567,  bottom: 567,  left: 567  },
    '32px 36px': { top: 720,  right: 720,  bottom: 720,  left: 720  },
    '40px 48px': { top: 1080, right: 1080, bottom: 1080, left: 1080 },
    '48px 56px': { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    '56px 64px': { top: 1800, right: 1800, bottom: 1800, left: 1800 },
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
  const photoData = profile.photoPath ? base64ToUint8Array(profile.photoPath) : null;

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

  // ── Contact items ──
  interface ContactItem { text: string; href?: string }
  const contactItems: ContactItem[] = [];
  if (profile.email)        contactItems.push({ text: profile.email, href: `mailto:${profile.email}` });
  if (profile.phone)        contactItems.push({ text: profile.phone });
  if (profile.city)         contactItems.push({ text: profile.city });
  if (profile.linkedinUrl)  contactItems.push({ text: shortenUrl(profile.linkedinUrl), href: ensureHref(profile.linkedinUrl) });
  if (profile.githubUrl)    contactItems.push({ text: shortenUrl(profile.githubUrl),   href: ensureHref(profile.githubUrl) });
  if (profile.portfolioUrl) contactItems.push({ text: shortenUrl(profile.portfolioUrl), href: ensureHref(profile.portfolioUrl) });

  /** Build a contact paragraph (inline hyperlinks separated by " | "). */
  const makeContactParagraph = (textColor: string): Paragraph => {
    const linkColor = textColor || '444444';
    const children: (TextRun | ExternalHyperlink)[] = [];
    contactItems.forEach((item, idx) => {
      if (idx > 0) children.push(new TextRun({ text: ' | ', size: B, font: F, color: linkColor }));
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
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    });
  };

  // ── Build header ──
  const sectionsChildren: (Paragraph | Table)[] = [];
  const title = cv.targetJob || profile.title;

  if (isBanner || photoData) {
    // ── Table-based header (banner background and/or photo) ──
    const shading = { fill: isBanner ? bannerHex : 'FFFFFF', type: ShadingType.CLEAR, color: 'auto' };
    const textColor = isBanner ? 'FFFFFF' : '';

    const namePara = new Paragraph({
      children: [new TextRun({
        text: `${profile.firstName} ${profile.lastName}`,
        bold: true, size: 32, font: effectiveTemplate.docx.fonts.heading,
        color: textColor || '000000',
      })],
      spacing: { after: 60 },
    });

    const titlePara = title ? new Paragraph({
      children: [new TextRun({
        text: title, size: 24, font: F,
        color: textColor ? 'E0E0E0' : '444444',
      })],
      spacing: { after: 80 },
    }) : null;

    const contactPara = contactItems.length > 0 ? makeContactParagraph(textColor || '') : null;
    // Remove underline style in banner (already have color contrast)
    const contentChildren: Paragraph[] = [namePara, titlePara, contactPara].filter(Boolean) as Paragraph[];

    const contentCell = new TableCell({
      children: contentChildren,
      shading,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 150, bottom: 150, left: 150, right: 150 },
      width: photoData
        ? { size: 80, type: WidthType.PERCENTAGE }
        : { size: 100, type: WidthType.PERCENTAGE },
    });

    const rowCells: TableCell[] = [];
    if (photoData) {
      const photoPara = new Paragraph({
        children: [new ImageRun({
          data: photoData.data,
          transformation: { width: photoPixels, height: photoPixels },
          type: photoData.type as any,
        })],
        alignment: AlignmentType.CENTER,
      });
      rowCells.push(new TableCell({
        children: [photoPara],
        shading,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 150, bottom: 150, left: 150, right: 150 },
        width: { size: 20, type: WidthType.PERCENTAGE },
      }));
    }
    rowCells.push(contentCell);

    sectionsChildren.push(new Table({
      rows: [new TableRow({ children: rowCells })],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_TABLE_BORDERS,
    }));
    // Spacer after header table
    sectionsChildren.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  } else {
    // ── Simple text header (no photo, no banner) ──
    sectionsChildren.push(new Paragraph({
      text: `${profile.firstName} ${profile.lastName}`,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }));
    if (contactItems.length > 0) {
      sectionsChildren.push(makeContactParagraph(''));
    }
    if (title) {
      sectionsChildren.push(new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }));
    }
  }

  // ── Summary ──
  const summary = cv.customSummary || profile.summary;
  if (summary) {
    sectionsChildren.push(new Paragraph({
      children: [new TextRun({ text: summary, size: B, font: F })],
      spacing: { after: effectiveTemplate.docx.sectionSpacing, line: effectiveTemplate.docx.lineSpacing },
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

  // ── Blocks ──
  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const BADGE_TYPES: EntryType[] = ['skill', 'language', 'interest'];

  for (const block of sortedBlocks) {
    if (!block.isVisible) continue;

    if (block.blockType === 'section_header' && block.sectionName) {
      const sectionRun: any = {
        font: effectiveTemplate.docx.fonts.heading,
        size: effectiveTemplate.docx.headingSize,
        bold: true,
      };
      if (accentHex) sectionRun.color = accentHex;

      sectionsChildren.push(new Paragraph({
        children: [new TextRun({ ...sectionRun, text: (block.sectionName || '').toUpperCase() })],
        spacing: { before: effectiveTemplate.docx.sectionSpacing, after: 100 },
        border: {
          bottom: { color: accentHex || 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
      }));

    } else if (block.blockType === 'custom_text' && block.customContent) {
      for (const line of block.customContent.split('\n')) {
        const t = line.trim();
        const isBullet = t.startsWith('- ') || t.startsWith('* ');
        sectionsChildren.push(new Paragraph({
          children: parseMarkdownText(isBullet ? t.substring(2).trim() : line),
          spacing: { after: 50, line: effectiveTemplate.docx.lineSpacing },
          numbering: isBullet ? { reference: 'default-bullet', level: 0 } : undefined,
        }));
      }

    } else if (block.blockType === 'entry_ref' && block.entryId) {
      const entry = entries.find(e => e.id === block.entryId);
      if (!entry) continue;
      const entryData = { ...entry, ...(block.overrideData || {}) };

      if (BADGE_TYPES.includes(entry.entryType)) {
        if (entryData.description && typeof entryData.description === 'string') {
          for (const line of entryData.description.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            const content = /^[-*]\s/.test(t) ? t.substring(2).trim() : t;
            sectionsChildren.push(new Paragraph({
              children: parseMarkdownText(content),
              spacing: { after: 40, line: effectiveTemplate.docx.lineSpacing },
              numbering: { reference: 'default-bullet', level: 0 },
            }));
          }
        } else if (entryData.title) {
          sectionsChildren.push(new Paragraph({
            children: [new TextRun({ text: entryData.title as string, size: B, font: F })],
            spacing: { after: 40, line: effectiveTemplate.docx.lineSpacing },
            numbering: { reference: 'default-bullet', level: 0 },
          }));
        }
      } else {
        // Regular entries (experience, education, certification…)
        const yearOnly = entry.entryType === 'education' || entry.entryType === 'certification';
        const fmtDate = yearOnly ? formatDateYear : formatDate;
        const dateText = entryData.startDate
          ? `${fmtDate(entryData.startDate as string)} - ${entryData.isCurrent ? 'Présent' : fmtDate(entryData.endDate as string)}`
          : (entryData.endDate ? fmtDate(entryData.endDate as string) : '');

        const titleText = (entryData.title as string) || '';
        let subtitleText = entryData.subtitle ? ` | ${entryData.subtitle}` : '';
        if (entryData.location) {
          subtitleText += subtitleText ? ` — ${entryData.location}` : ` | ${entryData.location}`;
        }

        const textRuns: TextRun[] = [];
        if (titleText)   textRuns.push(new TextRun({ text: titleText, bold: true, size: B, font: F }));
        if (subtitleText) textRuns.push(new TextRun({ text: subtitleText, italics: true, size: B, font: F }));
        if (dateText)    textRuns.push(new TextRun({ text: `  (${dateText})`, size: B, font: F, color: '666666' }));
        if (!textRuns.length) textRuns.push(new TextRun({ text: '' }));

        sectionsChildren.push(new Paragraph({
          children: textRuns,
          spacing: { before: 100, after: 50 },
        }));

        if (entryData.description && typeof entryData.description === 'string') {
          for (const line of entryData.description.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            const isBullet = t.startsWith('- ') || t.startsWith('* ');
            sectionsChildren.push(new Paragraph({
              children: parseMarkdownText(isBullet ? t.substring(2).trim() : t),
              spacing: { after: 50, line: effectiveTemplate.docx.lineSpacing },
              numbering: isBullet ? { reference: 'default-bullet', level: 0 } : undefined,
            }));
          }
        }
      }
    }
  }

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
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: effectiveTemplate.docx.fonts.body, size: B, language: { value: 'fr-FR' } },
          paragraph: { spacing: { line: effectiveTemplate.docx.lineSpacing } },
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
          paragraph: { spacing: { after: 200 } },
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
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { color: accentHex || 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
            },
          },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: {
            width:  effectiveTemplate.docx.pageSize === 'A4' ? 11906 : 12240,
            height: effectiveTemplate.docx.pageSize === 'A4' ? 16838 : 15840,
          },
          margin: effectiveTemplate.docx.margins,
        },
      },
      children: sectionsChildren as Paragraph[],
    }],
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
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    });
    if (!filePath) return false;

    const blob = await generateDocxBlob(cv, profile, blocks, entries, template);
    await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Détail de l'erreur : ${msg}`);
  }
}
