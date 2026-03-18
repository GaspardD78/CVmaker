import { CVBlock } from '../../types/cv';
import { MasterEntry } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

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

interface CVEntryBlockProps {
  block: CVBlock;
  entry: MasterEntry;
  template: CVTemplate;
}

export function CVEntryBlock({ block, entry, template }: CVEntryBlockProps) {
  const entryData = { ...entry, ...block.overrideData };
  const yearOnly = entry.entryType === 'education' || entry.entryType === 'certification';
  const fmtDate = yearOnly ? formatDateYear : formatDate;

  return (
    <div className={`cv-entry ${template.preview.entryClass} print:break-inside-avoid`}>
      <div className="cv-title-row flex justify-between items-baseline mb-1">
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
          <span className={`cv-date ${template.preview.dateClass}`}>
            {entryData.startDate ? fmtDate(entryData.startDate) : ''}
            {entryData.startDate && (entryData.endDate || entryData.isCurrent) ? ' - ' : ''}
            {entryData.isCurrent ? 'Présent' : (entryData.endDate ? fmtDate(entryData.endDate) : '')}
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
