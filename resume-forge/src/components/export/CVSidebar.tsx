import { Profile } from '../../types/profile';
import { CVBlock } from '../../types/cv';
import { MasterEntry } from '../../types/profile';
import { CVTemplate } from '../../types/template';
import { CVBadgeGroup } from './CVBadgeGroup';
import { buildContactItems } from './CVHeader';

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

/** A badge-type section routed into the sidebar (skills, languages, interests…). */
export interface SidebarSection {
  id: string;
  sectionName: string | null;
  blocks: CVBlock[];
  format: DisplayFormat;
}

interface CVSidebarProps {
  profile: Profile;
  entries: MasterEntry[];
  template: CVTemplate;
  sections: SidebarSection[];
  hasPhoto: boolean;
  photoShape: string;
  photoSize: string;
  photoBorder: string;
}

/**
 * Colonne latérale des templates graphiques (layouts `sidebar-*`).
 * Regroupe la photo, les coordonnées et les sections « badges »
 * (compétences, langues, centres d'intérêt, certifications).
 *
 * Le contraste (texte clair sur fond coloré) est géré par les overrides CSS
 * `.cv-sidebar …` injectés depuis PrintableCV — ce composant ne fait que la
 * structure.
 */
export function CVSidebar({
  profile, entries, template, sections,
  hasPhoto, photoShape, photoSize, photoBorder,
}: CVSidebarProps) {
  const contactItems = buildContactItems(profile);

  return (
    <aside className="cv-sidebar">
      {hasPhoto && (() => {
        const size = photoSize || '120px';
        const shapeClass = photoShape || 'rounded-full';
        let borderClass = 'cv-sidebar-photo-ring';
        let shadowClass = '';
        if (photoBorder === 'none') borderClass = '';
        else if (photoBorder === 'thick') borderClass = 'cv-sidebar-photo-ring border-4';
        else if (photoBorder === 'shadow') { borderClass = ''; shadowClass = 'shadow-lg'; }
        return (
          <div className="flex justify-center mb-5">
            <div
              className={`${shapeClass} overflow-hidden flex-shrink-0 ${borderClass} ${shadowClass}`}
              style={{ width: size, height: size }}
            >
              <img src={profile.photoPath!} alt="Photo de profil" className="w-full h-full object-cover" />
            </div>
          </div>
        );
      })()}

      {contactItems.length > 0 && (
        <div className="cv-sidebar-section mb-5">
          <h3 className="cv-sidebar-heading">Contact</h3>
          <ul className="cv-sidebar-contact space-y-1.5">
            {contactItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-snug break-words">
                <span className="cv-sidebar-icon mt-px shrink-0">{item.icon}</span>
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                    {item.text}
                  </a>
                ) : (
                  <span className="break-all">{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.id} className="cv-sidebar-section mb-5">
          <h3 className="cv-sidebar-heading">{section.sectionName}</h3>
          <CVBadgeGroup
            blocks={section.blocks}
            entries={entries}
            template={template}
            format={section.format}
          />
        </div>
      ))}
    </aside>
  );
}
