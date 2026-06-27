import { CVTemplate } from '../types/template';
import { PALETTES_VIBRANT } from '../theme/tokens';

/**
 * Template graphique deux colonnes — bande latérale colorée (accent) à gauche,
 * compétences sous forme de badges bien lisibles. Orienté profils tech /
 * data / produit envoyés à un recruteur humain. Non garanti ATS.
 */
export const sidebarTech: CVTemplate = {
  id: 'sidebar-tech',
  name: 'Sidebar Tech',
  description: 'Deux colonnes, bande latérale colorée et stack en badges. Pour profils tech, recruteur humain (non-ATS).',
  category: 'graphic',
  layout: 'sidebar-left',
  atsOptimized: false,
  recommendedFor: ['dev', 'data', 'devops', 'ingénierie'],
  supportsPhoto: true,
  palettes: [PALETTES_VIBRANT[1], PALETTES_VIBRANT[0], PALETTES_VIBRANT[3], PALETTES_VIBRANT[2]],
  defaultDensity: 'normal',
  headerVariants: ['clean'],
  sidebar: {
    bg: '#064e3b',
    text: '#ecfdf5',
    width: '35%',
  },
  docx: {
    pageSize: 'A4',
    margins: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
    fonts: { heading: 'Calibri', body: 'Calibri' },
    headingSize: 26,
    bodySize: 22,
    lineSpacing: 288,
    sectionSpacing: 240,
    useColumns: false,
    useTables: false,
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg text-gray-900',
    headingClass: 'text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-800 mb-3 mt-6 pb-1.5 border-b-2 border-emerald-100',
    entryClass: 'mb-4',
    titleClass: 'font-bold text-gray-900 text-[13.5px]',
    subtitleClass: 'text-emerald-800 text-[12.5px] font-semibold',
    dateClass: 'text-gray-500 text-[11px] tabular-nums mb-1',
    descriptionClass: 'text-gray-700 text-[12px] whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'space-y-1',
    skillClass: 'text-[12px]',
    skillBadgeContainerClass: 'flex flex-wrap gap-1.5 mt-1',
    skillBadgeClass: 'inline-block px-2.5 py-1 text-[11px] font-semibold border rounded',
    nameClass: 'text-[32px] font-extrabold tracking-tight text-gray-900 leading-none mb-1',
    headerTitleClass: 'text-[15px] font-semibold uppercase tracking-[0.08em] text-emerald-800',
    contactClass: 'text-[12px] text-gray-600',
    summaryClass: 'text-[12.5px] text-gray-700 leading-relaxed',
  },
};
