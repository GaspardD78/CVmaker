import { CVTemplate } from '../types/template';

export const atsModern: CVTemplate = {
  id: 'ats-modern',
  name: 'ATS Moderne',
  description: 'Design épuré avec plus d\'espace, lisibilité maximale pour les ATS',
  docx: {
    pageSize: 'A4',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch in DXA (twips)
    fonts: {
      heading: 'Arial',
      body: 'Arial',
    },
    headingSize: 32,   // 16pt (half-points in DOCX)
    bodySize: 22,      // 11pt (half-points in DOCX)
    lineSpacing: 360,  // 1.5x for modern breathable look
    sectionSpacing: 300,
    useColumns: false, // Strict ATS compliance
    useTables: false,  // Strict ATS compliance
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg p-14 text-gray-800 font-sans',
    headingClass: 'text-xl font-bold uppercase tracking-widest border-b-[3px] border-blue-600 pb-2 mb-4 mt-8 text-blue-900',
    entryClass: 'mb-6 pl-2 border-l-2 border-gray-200',
    titleClass: 'font-bold text-gray-900 text-lg',
    subtitleClass: 'font-medium text-blue-700',
    dateClass: 'text-gray-500 text-sm italic mb-2 block',
    descriptionClass: 'text-gray-700 text-sm whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'list-disc pl-6',
    skillClass: 'mb-2 text-sm text-gray-700',
  }
};
