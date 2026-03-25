import { forwardRef } from 'react';
import { CVDocument, CVBlock } from '../../types/cv';
import { MasterEntry, Profile, EntryType } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { CVHeader } from './CVHeader';
import { CVSectionHeader } from './CVSectionHeader';
import { CVEntryBlock } from './CVEntryBlock';
import { CVBadgeGroup } from './CVBadgeGroup';
import { CVCustomText } from './CVCustomText';

const FONT_STACKS: Record<string, string> = {
  'Calibri': "'Calibri', 'Arial', sans-serif",
  'Arial': "'Arial', sans-serif",
  'Georgia': "'Georgia', serif",
  'Times New Roman': "'Times New Roman', serif",
  'Helvetica': "'Helvetica', 'Arial', sans-serif",
};

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

    // Design settings
    const settings = (cv.settings || {}) as Record<string, string>;
    const fontFamily = FONT_STACKS[settings.fontFamily || 'Calibri'] || FONT_STACKS['Calibri'];
    const fontSize = settings.fontSize || '11px';
    const primaryColor = settings.primaryColor || '';
    const pageMargin = settings.pageMargin || '';
    const sectionBorderStyle = settings.sectionBorderStyle || '';

    const headerFontSize      = settings.headerFontSize      || '';
    const headerFontFamily    = settings.headerFontFamily    ? (FONT_STACKS[settings.headerFontFamily]    || settings.headerFontFamily)    : '';
    const headerFontWeight    = settings.headerFontWeight    || '';
    const headerTextTransform = settings.headerTextTransform || '';
    const headerTextAlign     = settings.headerTextAlign     || '';
    const subtitleFontSize    = settings.subtitleFontSize    || '';
    const subtitleFontFamily  = settings.subtitleFontFamily  ? (FONT_STACKS[settings.subtitleFontFamily]  || settings.subtitleFontFamily)  : '';
    const subtitleFontStyle   = settings.subtitleFontStyle   || '';
    const subtitleFontWeight  = settings.subtitleFontWeight  || '';
    const bodyFontFamily      = settings.bodyFontFamily      ? (FONT_STACKS[settings.bodyFontFamily]      || settings.bodyFontFamily)      : '';
    const bodyFontSize        = settings.bodyFontSize        || '';
    const bodyTextAlign       = settings.bodyTextAlign       || '';
    const bodyLineHeight      = settings.bodyLineHeight      || '';
    const entrySpacing        = settings.entrySpacing        || '';
    const sectionHeaderGap    = settings.sectionHeaderGap    || '';
    const entryTitleGap       = settings.entryTitleGap       || '';
    const summaryFontFamily   = settings.summaryFontFamily   ? (FONT_STACKS[settings.summaryFontFamily]   || settings.summaryFontFamily)   : '';
    const summaryFontSize     = settings.summaryFontSize     || '';
    const summaryFontStyle    = settings.summaryFontStyle    || '';
    const summaryFontWeight   = settings.summaryFontWeight   || '';
    const summaryTextAlign    = settings.summaryTextAlign    || '';
    const summaryLineHeight   = settings.summaryLineHeight   || '';

    // Photo settings
    const photoShape  = settings.photoShape  || '';
    const photoSize   = settings.photoSize   || '';
    const photoBorder = settings.photoBorder || '';

    // Header style
    const headerStyle = settings.headerStyle || '';

    // CV header (name / job title / contact) settings
    const nameFontSize      = settings.nameFontSize      || '';
    const nameFontWeight    = settings.nameFontWeight    || '';
    const nameTextTransform = settings.nameTextTransform || '';
    const nameLineBreak     = settings.nameLineBreak     || '';
    const titleFontSize     = settings.titleFontSize     || '';
    const titleFontStyle    = settings.titleFontStyle    || '';
    const contactFontSize   = settings.contactFontSize   || '';
    const isBanner = ['accent-banner', 'dark-banner', 'gradient-banner'].includes(headerStyle);

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
      pageMargin         ? `#printable-cv { padding: ${pageMargin} !important; }` : '',
      (() => {
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
      isBanner ? `#printable-cv .cv-header-block, #printable-cv .cv-header-block * { color: white !important; }` : '',
      isBanner ? `#printable-cv .cv-header-block .cv-badge { background-color: rgba(255,255,255,0.15) !important; border-color: rgba(255,255,255,0.4) !important; color: white !important; }` : '',
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
        {renderItems.map((item, idx) => {
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
        })}
      </div>
    );
  }
);

PrintableCV.displayName = 'PrintableCV';
