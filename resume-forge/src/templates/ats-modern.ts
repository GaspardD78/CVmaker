import { CVTemplate } from '../types/template';

export const atsModern: CVTemplate = {
  id: 'ats-modern',
  name: 'ATS Moderne',
  description: 'Design épuré avec plus d\'espace, lisibilité maximale pour les ATS',
  docx: {
    pageSize: 'A4',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    fonts: {
      heading: 'Arial',
      body: 'Arial',
    },
    headingSize: 32,
    bodySize: 22,
    lineSpacing: 360,
    sectionSpacing: 300,
    useColumns: false,
    useTables: false,
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
    skillBadgeContainerClass: 'flex flex-wrap gap-2 mt-1',
    skillBadgeClass: 'inline-block px-3 py-1 text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full',
    nameClass: 'text-3xl font-bold uppercase tracking-wider mb-1',
    headerTitleClass: 'text-xl font-semibold text-blue-900',
    contactClass: 'text-sm text-gray-500',
    summaryClass: 'text-sm text-gray-700 leading-relaxed',
  }
};
