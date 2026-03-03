import { CVTemplate } from '../types/template';

export const atsClassic: CVTemplate = {
  id: 'ats-classic',
  name: 'ATS Classique',
  description: 'Structure linéaire optimisée pour les robots ATS',
  docx: {
    pageSize: 'A4',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch in DXA (twips)
    fonts: {
      heading: 'Calibri',
      body: 'Calibri',
    },
    headingSize: 28,   // 14pt (half-points in DOCX)
    bodySize: 22,      // 11pt (half-points in DOCX)
    lineSpacing: 276,  // 1.15x
    sectionSpacing: 200,
    useColumns: false,
    useTables: false,
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg p-12 text-gray-900',
    headingClass: 'text-lg font-bold uppercase tracking-wide border-b-2 border-gray-800 pb-1 mb-3 mt-6',
    entryClass: 'mb-4',
    titleClass: 'font-bold text-gray-900',
    subtitleClass: 'italic text-gray-700',
    dateClass: 'text-gray-600 text-sm mb-1',
    descriptionClass: 'text-gray-800 text-sm whitespace-pre-line',
    skillsContainerClass: 'list-disc pl-5',
    skillClass: 'mb-1 text-sm text-gray-800',
  }
};
