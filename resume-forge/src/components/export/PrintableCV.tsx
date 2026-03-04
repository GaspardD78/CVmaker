import { forwardRef } from 'react';
import { CVDocument, CVBlock } from '../../types/cv';
import { MasterEntry, Profile } from '../../types/profile';
import { CVTemplate } from '../../types/template';

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

    return (
      <div ref={ref} className={`${template.preview.containerClass} print:shadow-none print:m-0 print:p-0 print:w-full print:max-w-none`}>
        {/* Header Section */}
        <div className="text-center mb-6">
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
              <h3 key={block.id} className={template.preview.headingClass}>
                {block.sectionName}
              </h3>
            );
          }

          if (block.blockType === 'custom_text') {
            return (
              <div key={block.id} className={template.preview.entryClass}>
                <p className={template.preview.descriptionClass}>{block.customContent}</p>
              </div>
            );
          }

          if (block.blockType === 'entry_ref' && block.entryId) {
            const entry = entries.find((e) => e.id === block.entryId);
            if (!entry) return null;

            const entryData = { ...entry, ...block.overrideData };

            return (
              <div key={block.id} className={template.preview.entryClass}>
                <div className="flex justify-between items-baseline mb-1">
                  <div>
                    <span className={template.preview.titleClass}>{entryData.title}</span>
                    {entryData.subtitle && (
                      <span className={template.preview.subtitleClass}>
                        {' '}
                        | {entryData.subtitle}
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
                  <p className={template.preview.descriptionClass}>{entryData.description}</p>
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
