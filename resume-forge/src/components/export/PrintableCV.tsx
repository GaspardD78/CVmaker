import { forwardRef } from 'react';
import { CVDocument, CVBlock } from '../../types/cv';
import { MasterEntry, Profile, EntryType } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

const FONT_STACKS: Record<string, string> = {
  'Calibri': "'Calibri', 'Arial', sans-serif",
  'Arial': "'Arial', sans-serif",
  'Georgia': "'Georgia', serif",
  'Times New Roman': "'Times New Roman', serif",
  'Helvetica': "'Helvetica', 'Arial', sans-serif",
};

/** Entry types rendered as inline badges instead of full entry blocks */
const BADGE_ENTRY_TYPES: EntryType[] = ['skill', 'language', 'interest'];

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

/** Tiny inline SVG icons for contact info (print-safe, no external deps) */
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 opacity-60">
      <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.161V6a2 2 0 00-2-2H3z" />
      <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 opacity-60">
      <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
    </svg>
  );
}
function LocationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 opacity-60">
      <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433a19.695 19.695 0 002.683-2.282c1.944-1.99 3.945-4.995 3.945-8.567a8 8 0 10-16 0c0 3.572 2.001 6.577 3.945 8.567a19.695 19.695 0 002.683 2.282 12.97 12.97 0 001.038.573l.018.008.006.003zM10 11.25a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5z" clipRule="evenodd" />
    </svg>
  );
}
function LinkedInIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 opacity-60">
      <path d="M4.5 2A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18h11a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0015.5 2h-11zM7 7.5v6H5v-6h2zm-1-1.75a1 1 0 110-2 1 1 0 010 2zM15 13.5h-2v-2.938c0-.789-.6-1.062-1-.1062-.4 0-1 .312-1 1.062V13.5h-2v-6h2v.938s.75-1.188 2-1.188 2 .75 2 2.5v3.75z" />
    </svg>
  );
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
      sectionBorderStyle ? `border-bottom-style: ${sectionBorderStyle};`            : '',
      sectionBorderStyle === 'none' ? `border-bottom-width: 0; padding-bottom: 0;`  : '',
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
      pageMargin         ? `#printable-cv { padding: ${pageMargin} !important; }` : '',
      primaryColor       ? `#printable-cv .cv-badge { border-color: ${primaryColor}30; background-color: ${primaryColor}10; color: ${primaryColor}; }` : '',
      primaryColor       ? `#printable-cv { border-color: ${primaryColor}; }` : '',
    ].filter(Boolean).join('\n');

    const hasPhoto = Boolean(profile.photoPath);

    // Build contact items with icons
    const contactItems: { icon: React.ReactNode; text: string }[] = [];
    if (profile.email) contactItems.push({ icon: <MailIcon />, text: profile.email });
    if (profile.phone) contactItems.push({ icon: <PhoneIcon />, text: profile.phone });
    if (profile.city) contactItems.push({ icon: <LocationIcon />, text: profile.city });
    if (profile.linkedinUrl) contactItems.push({ icon: <LinkedInIcon />, text: profile.linkedinUrl });

    // Group consecutive badge-type entries after a section header
    const renderBadgeGroup = (badgeBlocks: CVBlock[]) => {
      const badgeContainerClass = template.preview.skillBadgeContainerClass || 'flex flex-wrap gap-2 mt-1';
      const badgeClass = template.preview.skillBadgeClass || 'inline-block px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300 rounded';

      return (
        <div className={badgeContainerClass}>
          {badgeBlocks.map(block => {
            const entry = entries.find(e => e.id === block.entryId);
            if (!entry) return null;
            const entryData = { ...entry, ...block.overrideData };
            const label = entryData.subtitle
              ? `${entryData.title} — ${entryData.subtitle}`
              : (entryData.title as string);
            return (
              <span key={block.id} className={`cv-badge ${badgeClass}`}>
                {label}
              </span>
            );
          })}
        </div>
      );
    };

    // Pre-process blocks to group badge entries
    type RenderItem =
      | { type: 'block'; block: CVBlock }
      | { type: 'badge-group'; blocks: CVBlock[] };

    const renderItems: RenderItem[] = [];
    let i = 0;
    while (i < sortedBlocks.length) {
      const block = sortedBlocks[i];
      if (!block.isVisible) { i++; continue; }

      if (block.blockType === 'entry_ref' && block.entryId) {
        const entry = entries.find(e => e.id === block.entryId);
        if (entry && BADGE_ENTRY_TYPES.includes(entry.entryType)) {
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
          renderItems.push({ type: 'badge-group', blocks: badgeGroup });
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
        <div className={`mb-4 text-black dark:text-black ${hasPhoto ? 'flex items-center gap-6' : 'text-center'}`}>
          {hasPhoto && (
            <img
              src={profile.photoPath!}
              alt="Photo de profil"
              className="w-24 h-24 rounded-full object-cover flex-shrink-0 border-2 border-gray-200 print:w-20 print:h-20"
            />
          )}
          <div className={hasPhoto ? 'flex-1' : ''}>
            <h1 className={template.preview.nameClass || 'text-3xl font-bold uppercase tracking-wider mb-1'}>
              {profile.firstName} {profile.lastName}
            </h1>
            {title && (
              <h2 className={template.preview.headerTitleClass || 'text-xl font-semibold text-gray-800'}>
                {title}
              </h2>
            )}
            {contactItems.length > 0 && (
              <div className={`mt-2 ${template.preview.contactClass || 'text-sm text-gray-600'}`}>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {contactItems.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center whitespace-nowrap">
                      {item.icon}
                      {item.text}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <hr className="border-t border-gray-300 mb-4 print:border-gray-400" style={primaryColor ? { borderColor: primaryColor } : undefined} />

        {summary && (
          <div className="mb-5">
            <p className={template.preview.summaryClass || template.preview.descriptionClass}>{summary}</p>
          </div>
        )}

        {/* Dynamic Blocks */}
        {renderItems.map((item, idx) => {
          if (item.type === 'badge-group') {
            return <div key={`badge-${idx}`} className="cv-entry mb-3 print:break-inside-avoid">{renderBadgeGroup(item.blocks)}</div>;
          }

          const block = item.block;

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
