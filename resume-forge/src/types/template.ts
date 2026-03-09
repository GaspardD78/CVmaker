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
    /** Render skills/languages/interests as inline badges */
    skillBadgeClass?: string;
    /** Wrapper for badge-style entries */
    skillBadgeContainerClass?: string;
    /** Header name class */
    nameClass?: string;
    /** Header title/job class */
    headerTitleClass?: string;
    /** Contact info line class */
    contactClass?: string;
    /** Summary block class */
    summaryClass?: string;
  };
}
