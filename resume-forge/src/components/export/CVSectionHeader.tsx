import { CVTemplate } from '../../types/template';

interface CVSectionHeaderProps {
  sectionName: string | null;
  template: CVTemplate;
  /**
   * `section` : titre de section (`<h3>`, classes du template).
   * `sub` : sous-en-tête de catégorie (ex. « Langages » sous « Compétences »),
   * petit libellé gras en `<h4>` (hors du sélecteur `#printable-cv h3`).
   */
  variant?: 'section' | 'sub';
}

export function CVSectionHeader({ sectionName, template, variant = 'section' }: CVSectionHeaderProps) {
  if (variant === 'sub') {
    return (
      <h4 className="cv-subheading text-[12px] font-semibold leading-snug mt-2 mb-1 print:break-after-avoid">
        {sectionName}
      </h4>
    );
  }
  return (
    <h3 className={`${template.preview.headingClass} print:break-after-avoid`}>
      {sectionName}
    </h3>
  );
}
