import { forwardRef } from 'react';
import { CVDocument, CVBlock } from '../../types/cv';
import { MasterEntry, Profile } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

const FONT_STACKS: Record<string, string> = {
  'Calibri': "'Calibri', 'Arial', sans-serif",
  'Arial': "'Arial', sans-serif",
  'Georgia': "'Georgia', serif",
  'Times New Roman': "'Times New Roman', serif",
  'Helvetica': "'Helvetica', 'Arial', sans-serif",
};

interface PrintableCVProps {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
  template: CVTemplate;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Aujourd\'hui';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

export const PrintableCV = forwardRef<HTMLDivElement, PrintableCVProps>(
  ({ cv, profile, blocks, entries, template }, ref) => {
    const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);

    const title = cv.targetJob || profile.title;
    const summary = cv.customSummary || profile.summary;

    const contactInfo = [
      profile.email,
      profile.phone,
      profile.city,
      profile.linkedinUrl,
    ].filter(Boolean).join(' • ');

    // Design settings
    const settings = (cv.settings || {}) as Record<string, string>;
    const fontFamily = FONT_STACKS[settings.fontFamily || 'Calibri'] || FONT_STACKS['Calibri'];
    const fontSize = settings.fontSize || '11px';
    const primaryColor = settings.primaryColor || '';

    const headerFontSize      = settings.headerFontSize      || '';
    const headerFontWeight    = settings.headerFontWeight    || '';
    const headerTextTransform = settings.headerTextTransform || '';
    const headerTextAlign     = settings.headerTextAlign     || '';
    const subtitleFontStyle   = settings.subtitleFontStyle   || '';
    const subtitleFontWeight  = settings.subtitleFontWeight  || '';
    const bodyTextAlign       = settings.bodyTextAlign       || '';
    const bodyLineHeight      = settings.bodyLineHeight      || '';
    const entrySpacing        = settings.entrySpacing        || '';

    const h3Rules = [
      primaryColor       ? `color: ${primaryColor}; border-color: ${primaryColor};` : '',
      headerFontSize     ? `font-size: ${headerFontSize};`                          : '',
      headerFontWeight   ? `font-weight: ${headerFontWeight};`                      : '',
      headerTextTransform? `text-transform: ${headerTextTransform};`                : '',
      headerTextAlign    ? `text-align: ${headerTextAlign};`                        : '',
    ].filter(Boolean).join(' ');

    const cssOverrides = [
      h3Rules ? `#printable-cv h3 { ${h3Rules} }` : '',
      fontSize !== '11px'
        ? `#printable-cv p, #printable-cv li, #printable-cv .cv-desc { font-size: ${fontSize} !important; }`
        : '',
      subtitleFontStyle  ? `#printable-cv .cv-title { font-style: ${subtitleFontStyle} !important; }` : '',
      subtitleFontWeight ? `#printable-cv .cv-title { font-weight: ${subtitleFontWeight} !important; }` : '',
      bodyTextAlign      ? `#printable-cv .cv-desc, #printable-cv .cv-desc p, #printable-cv .cv-desc li { text-align: ${bodyTextAlign} !important; }` : '',
      bodyLineHeight     ? `#printable-cv .cv-desc, #printable-cv .cv-desc p, #printable-cv .cv-desc li { line-height: ${bodyLineHeight} !important; }` : '',
      entrySpacing       ? `#printable-cv .cv-entry { margin-bottom: ${entrySpacing} !important; }` : '',
    ].filter(Boolean).join('\n');

    const hasPhoto = Boolean(profile.photoPath);

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
        <div className={`mb-6 text-black dark:text-black ${hasPhoto ? 'flex items-center gap-6' : 'text-center'}`}>
          {hasPhoto && (
            <img
              src={profile.photoPath!}
              alt="Photo de profil"
              className="w-24 h-24 rounded-full object-cover flex-shrink-0 border-2 border-gray-200 print:w-20 print:h-20"
            />
          )}
          <div className={hasPhoto ? 'flex-1' : ''}>
            <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">
              {profile.firstName} {profile.lastName}
            </h1>
            {contactInfo && (
              <p className="text-sm text-gray-600 mb-3">{contactInfo}</p>
            )}
            {title && (
              <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
            )}
          </div>
        </div>

        {summary && (
          <div className="mb-6">
            <p className={template.preview.descriptionClass}>{summary}</p>
          </div>
        )}

        {/* Dynamic Blocks */}
        {sortedBlocks.map((block) => {
          if (!block.isVisible) return null;

          if (block.blockType === 'section_header') {
            return (
              <h3 key={block.id} className={`${template.preview.headingClass} print:break-after-avoid`}>
                {block.sectionName}
              </h3>
            );
          }

          if (block.blockType === 'custom_text') {
            return (
              <div key={block.id} className={`cv-entry ${template.preview.entryClass} print:break-inside-avoid`}>
                <div className={`cv-desc ${template.preview.descriptionClass}`}>
                  <MarkdownRenderer text={block.customContent || ''} />
                </div>
              </div>
            );
          }

          if (block.blockType === 'entry_ref' && block.entryId) {
            const entry = entries.find((e) => e.id === block.entryId);
            if (!entry) return null;

            const entryData = { ...entry, ...block.overrideData };

            return (
              <div key={block.id} className={`cv-entry ${template.preview.entryClass} print:break-inside-avoid`}>
                <div className="flex justify-between items-baseline mb-1">
                  <div>
                    <span className={`cv-title ${template.preview.titleClass}`}>{entryData.title}</span>
                    {(entryData.subtitle || entryData.location) && (
                      <span className={`cv-subtitle ${template.preview.subtitleClass}`}>
                        {' '}
                        | {entryData.subtitle}
                        {entryData.subtitle && entryData.location ? ` — ${entryData.location}` : entryData.location || ''}
                      </span>
                    )}
                  </div>
                  {(entryData.startDate || entryData.endDate || entryData.isCurrent) && (
                    <span className={template.preview.dateClass}>
                      {entryData.startDate ? formatDate(entryData.startDate) : ''}
                      {entryData.startDate && (entryData.endDate || entryData.isCurrent) ? ' - ' : ''}
                      {entryData.isCurrent ? 'Présent' : (entryData.endDate ? formatDate(entryData.endDate) : '')}
                    </span>
                  )}
                </div>
                {entryData.description && (
                  <div className={`cv-desc ${template.preview.descriptionClass}`}>
                    <MarkdownRenderer text={entryData.description as string} />
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  }
);

PrintableCV.displayName = 'PrintableCV';
