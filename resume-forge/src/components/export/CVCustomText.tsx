import { CVTemplate } from '../../types/template';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

interface CVCustomTextProps {
  content: string;
  template: CVTemplate;
}

export function CVCustomText({ content, template }: CVCustomTextProps) {
  return (
    <div className={`cv-entry ${template.preview.entryClass} print:break-inside-avoid`}>
      <div className={`cv-desc ${template.preview.descriptionClass}`}>
        <MarkdownRenderer text={content} />
      </div>
    </div>
  );
}
