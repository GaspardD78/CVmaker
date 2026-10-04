import { CVBlock } from '../../types/cv';
import { MasterEntry } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { buildBadgeRows, itemLabel, SKILL_ITEM_SEPARATOR, type BadgeItem, type BadgeRow } from '../../lib/skill-lines';

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

interface CVBadgeGroupProps {
  blocks: CVBlock[];
  entries: MasterEntry[];
  template: CVTemplate;
  format: DisplayFormat;
}

/** Libellé de catégorie en gras, suivi de « : » (texte brut lisible par un ATS). */
function CategoryLabel({ name }: { name: string }) {
  return <><strong className="cv-skill-category font-semibold">{name}</strong> : </>;
}

/** Ligne d'une catégorie : `**Catégorie** : a · b · c`. */
function CategoryLine({ row, className }: { row: BadgeRow; className: string }) {
  return (
    <p className={`cv-desc cv-skill-line ${className}`}>
      <CategoryLabel name={row.category ?? ''} />
      {row.items.map(i => i.name).join(SKILL_ITEM_SEPARATOR)}
    </p>
  );
}

/**
 * Groupe de badges (compétences, langues, centres d'intérêt, certifications).
 * Les catégories de compétences (entrée `skill` à puces, voir lib/skill-lines.ts)
 * sont rendues une ligne par catégorie, libellé en gras ; les éléments libres
 * gardent le rendu propre au format.
 */
export function CVBadgeGroup({ blocks, entries, template, format }: CVBadgeGroupProps) {
  const rows = buildBadgeRows(blocks, entries);
  const categories = rows.filter(r => r.category !== null);
  const loose: BadgeItem[] = rows.find(r => r.category === null)?.items ?? [];
  const labels = loose.map(itemLabel);
  const itemClass = template.preview.skillClass || 'text-sm text-gray-800';

  const renderLoose = () => {
    if (loose.length === 0) return null;

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

    if (format === 'columns2' || format === 'columns3') {
      return (
        <div className={format === 'columns2' ? 'grid grid-cols-2 gap-x-4' : 'grid grid-cols-3 gap-x-3'}>
          {labels.map((label, i) => (
            <div key={i} className={`flex items-baseline cv-badge-item ${itemClass}`}>
              <span className="mr-1.5 select-none">•</span>{label}
            </div>
          ))}
        </div>
      );
    }

    if (format === 'table') {
      return (
        <div className="grid gap-y-0.5 grid-cols-2">
          {loose.map(({ name, level }, i) => (
            <div key={i} className={`flex justify-between items-baseline col-span-1 cv-badge-item ${itemClass}`}>
              <span>{name}</span>
              {level && <span className="cv-badge-item text-gray-500 italic ml-3 whitespace-nowrap">{level}</span>}
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
          <span key={i} className={`cv-badge cv-badge-item ${badgeClass}`}>{label}</span>
        ))}
      </div>
    );
  };

  // Sans catégorie : même DOM qu'avant (références golden inchangées).
  if (categories.length === 0) return renderLoose();

  const renderCategories = () => {
    if (format === 'list') {
      return categories.map((row, ri) => (
        <div key={ri} className="cv-skill-category-block">
          <p className={`cv-desc cv-skill-line ${template.preview.descriptionClass}`}>
            <strong className="cv-skill-category font-semibold">{row.category}</strong>
          </p>
          <ul className={template.preview.skillsContainerClass || 'list-disc pl-5'}>
            {row.items.map((item, i) => <li key={i} className={itemClass}>{item.name}</li>)}
          </ul>
        </div>
      ));
    }

    if (format === 'columns2' || format === 'columns3') {
      return (
        <div className={format === 'columns2' ? 'grid grid-cols-2 gap-x-4' : 'grid grid-cols-3 gap-x-3'}>
          {categories.map((row, ri) => (
            <div key={ri} className={`cv-badge-item ${itemClass}`}>
              <CategoryLabel name={row.category ?? ''} />
              {row.items.map(i => i.name).join(SKILL_ITEM_SEPARATOR)}
            </div>
          ))}
        </div>
      );
    }

    if (format === 'table') {
      return (
        <div className="grid gap-y-0.5 grid-cols-[auto_1fr] gap-x-3">
          {categories.map((row, ri) => (
            <div key={ri} className="contents">
              <span className={`cv-badge-item cv-skill-category font-semibold ${itemClass}`}>{row.category}</span>
              <span className={`cv-badge-item ${itemClass}`}>{row.items.map(i => i.name).join(SKILL_ITEM_SEPARATOR)}</span>
            </div>
          ))}
        </div>
      );
    }

    // badges (défaut) et virgules : une ligne de texte brut par catégorie.
    return categories.map((row, ri) => (
      <CategoryLine key={ri} row={row} className={template.preview.descriptionClass} />
    ));
  };

  return (
    <div className="cv-skill-lines">
      {renderCategories()}
      {renderLoose()}
    </div>
  );
}
