export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  docx: {
    pageSize: 'A4' | 'LETTER';
    margins: { top: number; right: number; bottom: number; left: number };
    fonts: {
      heading: string;
      body: string;
    };
    headingSize: number;
    bodySize: number;
    lineSpacing: number;
    sectionSpacing: number;
    useColumns: boolean;
    useTables: boolean;
  };
  preview: {
    containerClass: string;
    headingClass: string;
    entryClass: string;
    titleClass: string;
    subtitleClass: string;
    dateClass: string;
    descriptionClass: string;
    skillsContainerClass?: string;
    skillClass?: string;
  };
}
