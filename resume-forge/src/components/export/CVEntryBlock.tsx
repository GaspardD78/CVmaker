import { CVBlock } from '../../types/cv';
import { MasterEntry } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { DEFAULT_DATE_SETTINGS, formatEntryDates, type DateSettings } from '../../lib/entry-dates';

interface CVEntryBlockProps {
  block: CVBlock;
  entry: MasterEntry;
  template: CVTemplate;
  /** Format des dates du CV (cv.settings, voir entry-dates.ts) ; défaut : mois et année. */
  dateSettings?: DateSettings;
}

export function CVEntryBlock({ block, entry, template, dateSettings = DEFAULT_DATE_SETTINGS }: CVEntryBlockProps) {
  const entryData = { ...entry, ...block.overrideData };

  // Non-destructive verbatim dates override (from the targeted-CV generator)
  // takes precedence over the computed start/end formatting (see entry-dates.ts).
  const dateText = formatEntryDates(
    { entryType: entry.entryType, startDate: entryData.startDate, endDate: entryData.endDate, isCurrent: entryData.isCurrent },
    (block.overrideData as Record<string, unknown> | undefined)?.datesOverride,
    dateSettings,
  );

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
        {dateText && (
          <span className={`cv-date ${template.preview.dateClass}`}>{dateText}</span>
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
