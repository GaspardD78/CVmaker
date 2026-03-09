import { CVTemplate } from '../types/template';

export const minimalist: CVTemplate = {
  id: 'minimalist',
  name: 'Minimaliste',
  description: 'Design épuré et moderne avec un minimum d\'éléments visuels',
  docx: {
    pageSize: 'A4',
    margins: { top: 1200, right: 1440, bottom: 1200, left: 1440 },
    fonts: {
      heading: 'Helvetica',
      body: 'Helvetica',
    },
    headingSize: 24,
    bodySize: 20,
    lineSpacing: 276,
    sectionSpacing: 200,
    useColumns: false,
    useTables: false,
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg p-10 text-gray-800',
    headingClass: 'text-sm font-bold uppercase tracking-[0.3em] text-gray-500 mb-3 mt-6',
    entryClass: 'mb-3',
    titleClass: 'font-semibold text-gray-900 text-sm',
    subtitleClass: 'text-gray-500 text-sm font-normal',
    dateClass: 'text-gray-400 text-xs mb-1',
    descriptionClass: 'text-gray-600 text-xs whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'list-disc pl-5',
    skillClass: 'mb-1 text-xs text-gray-600',
    skillBadgeContainerClass: 'flex flex-wrap gap-1.5 mt-1',
    skillBadgeClass: 'inline-block px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-300 rounded-full',
    nameClass: 'text-2xl font-light uppercase tracking-[0.15em] mb-1',
    headerTitleClass: 'text-base font-normal text-gray-500',
    contactClass: 'text-xs text-gray-400 tracking-wide',
    summaryClass: 'text-xs text-gray-600 leading-relaxed',
  }
};
