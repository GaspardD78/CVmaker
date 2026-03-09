import { CVTemplate } from '../types/template';

export const elegant: CVTemplate = {
  id: 'elegant',
  name: 'Élégant',
  description: 'Design sophistiqué avec barre d\'accent latérale et typographie soignée',
  docx: {
    pageSize: 'A4',
    margins: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
    fonts: {
      heading: 'Georgia',
      body: 'Calibri',
    },
    headingSize: 28,
    bodySize: 22,
    lineSpacing: 300,
    sectionSpacing: 250,
    useColumns: false,
    useTables: false,
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg p-12 text-gray-900 border-l-[5px] border-indigo-600',
    headingClass: 'text-base font-semibold uppercase tracking-[0.2em] text-indigo-700 border-b border-indigo-200 pb-1 mb-3 mt-6',
    entryClass: 'mb-4',
    titleClass: 'font-semibold text-gray-900',
    subtitleClass: 'text-indigo-600 font-normal',
    dateClass: 'text-gray-500 text-xs tracking-wide mb-1',
    descriptionClass: 'text-gray-700 text-sm whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'list-disc pl-5',
    skillClass: 'mb-1 text-sm text-gray-700',
    skillBadgeContainerClass: 'flex flex-wrap gap-1.5 mt-1',
    skillBadgeClass: 'inline-block px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-sm',
    nameClass: 'text-3xl font-bold tracking-wide mb-1',
    headerTitleClass: 'text-lg font-medium text-indigo-600 italic',
    contactClass: 'text-sm text-gray-500',
    summaryClass: 'text-sm text-gray-700 leading-relaxed italic',
  }
};
