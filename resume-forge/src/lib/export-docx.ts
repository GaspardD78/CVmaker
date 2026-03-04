import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, LevelFormat } from 'docx';
import { CVDocument, CVBlock } from '../types/cv';
import { MasterEntry, Profile } from '../types/profile';
import { CVTemplate } from '../types/template';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Aujourd\'hui';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

export async function generateDocxBlob(
  cv: CVDocument,
  profile: Profile,
  blocks: CVBlock[],
  entries: MasterEntry[],
  template: CVTemplate
): Promise<Blob> {
  const sectionsChildren: Paragraph[] = [];

  // 1. Identity / Header (Linear approach for ATS)
  sectionsChildren.push(
    new Paragraph({
      text: `${profile.firstName} ${profile.lastName}`,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  );

  const contactInfo = [
    profile.email,
    profile.phone,
    profile.city,
    profile.linkedinUrl
  ].filter(Boolean).join(' | ');

  if (contactInfo) {
    sectionsChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactInfo,
            size: template.docx.bodySize,
            font: template.docx.fonts.body,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200, line: template.docx.lineSpacing },
      })
    );
  }

  // Add Target Job/Title
  const title = cv.targetJob || profile.title;
  if (title) {
    sectionsChildren.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );
  }

  // Custom Summary
  const summary = cv.customSummary || profile.summary;
  if (summary) {
    sectionsChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: summary,
            size: template.docx.bodySize,
            font: template.docx.fonts.body,
          }),
        ],
        spacing: { after: template.docx.sectionSpacing, line: template.docx.lineSpacing },
      })
    );
  }

  // 2. Blocks / Sections
  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const block of sortedBlocks) {
    if (!block.isVisible) continue;

    if (block.blockType === 'section_header' && block.sectionName) {
      sectionsChildren.push(
        new Paragraph({
          text: block.sectionName.toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: template.docx.sectionSpacing, after: 100 },
        })
      );
    } else if (block.blockType === 'custom_text' && block.customContent) {
      sectionsChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.customContent,
              size: template.docx.bodySize,
              font: template.docx.fonts.body,
            }),
          ],
          spacing: { after: 100, line: template.docx.lineSpacing },
        })
      );
    } else if (block.blockType === 'entry_ref' && block.entryId) {
      const entry = entries.find((e) => e.id === block.entryId);
      if (!entry) continue;

      // Apply overrides if any
      const entryData = { ...entry, ...block.overrideData };

      // Entry Title & Date
      const dateText = entryData.startDate
        ? `${formatDate(entryData.startDate)} - ${entryData.isCurrent ? 'Présent' : formatDate(entryData.endDate)}`
        : '';

      const titleText = entryData.title;
      const subtitleText = entryData.subtitle ? ` | ${entryData.subtitle}` : '';

      sectionsChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: titleText,
              bold: true,
              size: template.docx.bodySize,
              font: template.docx.fonts.body,
            }),
            new TextRun({
              text: subtitleText,
              italics: true,
              size: template.docx.bodySize,
              font: template.docx.fonts.body,
            }),
            ...(dateText ? [
              new TextRun({
                text: `  (${dateText})`,
                size: template.docx.bodySize,
                font: template.docx.fonts.body,
                color: '666666',
              })
            ] : []),
          ],
          spacing: { before: 100, after: 50 },
        })
      );

      // Entry Description (handling newlines and bullets)
      if (entryData.description) {
        const lines = entryData.description.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            const isBullet = trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ');
            const content = isBullet ? trimmedLine.substring(2).trim() : trimmedLine;

            sectionsChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: content,
                    size: template.docx.bodySize,
                    font: template.docx.fonts.body,
                  }),
                ],
                spacing: { after: 50, line: template.docx.lineSpacing },
                numbering: isBullet ? { reference: "default-bullet", level: 0 } : undefined,
              })
            );
          }
        }
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } }
              }
            }
          ]
        }
      ]
    },
    styles: {
      default: {
        document: {
          run: {
            font: template.docx.fonts.body,
            size: template.docx.bodySize,
          },
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
            font: template.docx.fonts.heading,
            size: template.docx.headingSize + 4,
            bold: true,
          },
          paragraph: {
            spacing: { after: 200 },
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            font: template.docx.fonts.heading,
            size: template.docx.headingSize,
            bold: true,
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 },
            },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: template.docx.pageSize === 'A4' ? 11906 : 12240, // A4 or Letter
              height: template.docx.pageSize === 'A4' ? 16838 : 15840,
            },
            margin: template.docx.margins,
          },
        },
        children: sectionsChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function exportToDocx(
  cv: CVDocument,
  profile: Profile,
  blocks: CVBlock[],
  entries: MasterEntry[],
  template: CVTemplate
) {
  try {
    const defaultFilename = `${cv.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_ats.docx`;

    // Ask user where to save
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'Word Document',
        extensions: ['docx']
      }]
    });

    if (!filePath) {
      return; // User canceled
    }

    const blob = await generateDocxBlob(cv, profile, blocks, entries, template);
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await writeFile(filePath, uint8Array);

    // Returning true so the caller can trigger a toast
    return true;
  } catch (error) {
    throw error;
  }
}
