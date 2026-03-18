import { CVTemplate } from '../../types/template';

interface CVSectionHeaderProps {
  sectionName: string | null;
  template: CVTemplate;
}

export function CVSectionHeader({ sectionName, template }: CVSectionHeaderProps) {
  return (
    <h3 className={`${template.preview.headingClass} print:break-after-avoid`}>
      {sectionName}
    </h3>
  );
}
