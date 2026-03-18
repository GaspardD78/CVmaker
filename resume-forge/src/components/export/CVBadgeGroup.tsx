import { CVBlock } from '../../types/cv';
import { MasterEntry } from '../../types/profile';
import { CVTemplate } from '../../types/template';

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

/** Parse a description string into badge labels. */
function parseBadgeLabels(description: string): string[] {
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletLines = lines.filter(l => /^[-*]\s/.test(l));
  if (bulletLines.length > 0) {
    return bulletLines.map(l => l.replace(/^[-*]\s+/, ''));
  }
  return [description.trim()];
}

/** Collect all labels for a group of badge-type blocks */
function collectBadgeLabels(badgeBlocks: CVBlock[], entries: MasterEntry[]): string[] {
  const labels: string[] = [];
  badgeBlocks.forEach(block => {
    const entry = entries.find(e => e.id === block.entryId);
    if (!entry) return;
    const entryData = { ...entry, ...block.overrideData };
    const description = entryData.description as string | null;
    if (description) {
      parseBadgeLabels(description).forEach(l => labels.push(l));
    } else {
      labels.push(
        entryData.subtitle
          ? `${entryData.title} — ${entryData.subtitle}`
          : (entryData.title as string)
      );
    }
  });
  return labels;
}

/** Collect name + optional level for table format */
function collectBadgeRows(badgeBlocks: CVBlock[], entries: MasterEntry[]): { name: string; level?: string }[] {
  const rows: { name: string; level?: string }[] = [];
  badgeBlocks.forEach(block => {
    const entry = entries.find(e => e.id === block.entryId);
    if (!entry) return;
    const entryData = { ...entry, ...block.overrideData };
    const description = entryData.description as string | null;
    if (description) {
      parseBadgeLabels(description).forEach(l => rows.push({ name: l }));
    } else {
      rows.push({
        name: entryData.title as string,
        level: (entryData.subtitle as string) || undefined,
      });
    }
  });
  return rows;
}

interface CVBadgeGroupProps {
  blocks: CVBlock[];
  entries: MasterEntry[];
  template: CVTemplate;
  format: DisplayFormat;
}

export function CVBadgeGroup({ blocks, entries, template, format }: CVBadgeGroupProps) {
  const labels = collectBadgeLabels(blocks, entries);
  const itemClass = template.preview.skillClass || 'text-sm text-gray-800';

  if (format === 'comma') {
    return (
      <p className={`cv-desc ${template.preview.descriptionClass}`}>
        {labels.join(' · ')}
      </p>
    );
  }

  if (format === 'list') {
    return (
      <ul className={template.preview.skillsContainerClass || 'list-disc pl-5'}>
        {labels.map((label, i) => (
          <li key={i} className={itemClass}>{label}</li>
        ))}
      </ul>
    );
  }

  if (format === 'columns2') {
    return (
      <div className="grid grid-cols-2 gap-x-4">
        {labels.map((label, i) => (
          <div key={i} className={`flex items-baseline ${itemClass}`}>
            <span className="mr-1.5 text-gray-400 select-none">•</span>{label}
          </div>
        ))}
      </div>
    );
  }

  if (format === 'columns3') {
    return (
      <div className="grid grid-cols-3 gap-x-3">
        {labels.map((label, i) => (
          <div key={i} className={`flex items-baseline ${itemClass}`}>
            <span className="mr-1.5 text-gray-400 select-none">•</span>{label}
          </div>
        ))}
      </div>
    );
  }

  if (format === 'table') {
    const rows = collectBadgeRows(blocks, entries);
    const hasLevels = rows.some(r => r.level);
    return (
      <div className={`grid gap-y-0.5 ${hasLevels ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {rows.map(({ name, level }, i) => (
          <div key={i} className={`flex justify-between items-baseline col-span-1 ${itemClass}`}>
            <span>{name}</span>
            {level && <span className="text-xs text-gray-500 italic ml-3 whitespace-nowrap">{level}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Default: badges
  const badgeContainerClass = template.preview.skillBadgeContainerClass || 'flex flex-wrap gap-2 mt-1';
  const badgeClass = template.preview.skillBadgeClass || 'inline-block px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300 rounded';
  return (
    <div className={badgeContainerClass}>
      {labels.map((label, i) => (
        <span key={i} className={`cv-badge ${badgeClass}`}>{label}</span>
      ))}
    </div>
  );
}
