import { CVTemplate } from '../types/template';

export const atsClassic: CVTemplate = {
  id: 'ats-classic',
  name: 'ATS Classique',
  description: 'Structure linéaire optimisée pour les robots ATS',
  docx: {
    pageSize: 'A4',
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    fonts: {
      heading: 'Calibri',
      body: 'Calibri',
    },
    headingSize: 28,
    bodySize: 22,
    lineSpacing: 276,
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
    skillBadgeContainerClass: 'flex flex-wrap gap-2 mt-1',
    skillBadgeClass: 'inline-block px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300 rounded',
    nameClass: 'text-3xl font-bold uppercase tracking-wider mb-1',
    headerTitleClass: 'text-xl font-semibold text-gray-800',
    contactClass: 'text-sm text-gray-600',
    summaryClass: 'text-sm text-gray-800 leading-relaxed',
  }
};
