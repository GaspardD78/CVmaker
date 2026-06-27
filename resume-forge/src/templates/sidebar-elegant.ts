import { CVTemplate } from '../types/template';
import { PALETTES_SOBER, PALETTES_NEUTRAL } from '../theme/tokens';

/**
 * Template graphique deux colonnes — bande latérale claire à droite,
 * titres en serif. Registre élégant / corporate haut de gamme, pour un
 * recruteur humain. Non garanti ATS.
 */
export const sidebarElegant: CVTemplate = {
  id: 'sidebar-elegant',
  name: 'Sidebar Élégant',
  description: 'Deux colonnes, bande claire à droite et titres en serif. Élégant, pour un recruteur humain (non-ATS).',
  category: 'graphic',
  layout: 'sidebar-right',
  atsOptimized: false,
  recommendedFor: ['corporate', 'conseil', 'direction', 'rh'],
  supportsPhoto: true,
  palettes: [PALETTES_SOBER[0], PALETTES_SOBER[2], PALETTES_NEUTRAL[1], PALETTES_SOBER[3]],
  defaultDensity: 'comfortable',
  headerVariants: ['clean'],
  sidebar: {
    bg: '#f1f5f9',
    text: '#1e293b',
    heading: '#0f172a',
    width: '33%',
  },
  docx: {
    pageSize: 'A4',
    margins: { top: 1400, right: 1400, bottom: 1400, left: 1400 },
    fonts: { heading: 'Georgia', body: 'Calibri' },
    headingSize: 26,
    bodySize: 22,
    lineSpacing: 300,
    sectionSpacing: 260,
    useColumns: false,
    useTables: false,
  },
  preview: {
    containerClass: 'max-w-[210mm] mx-auto bg-white shadow-lg text-gray-900',
    headingClass: 'text-[14px] font-bold uppercase tracking-[0.16em] text-gray-900 mb-3 mt-6 pb-1.5 border-b border-gray-300 [font-family:Georgia,serif]',
    entryClass: 'mb-4',
    titleClass: 'font-bold text-gray-900 text-[13.5px] [font-family:Georgia,serif]',
    subtitleClass: 'text-gray-700 text-[12.5px] italic',
    dateClass: 'text-gray-500 text-[11px] tabular-nums mb-1',
    descriptionClass: 'text-gray-700 text-[12px] whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'space-y-1',
    skillClass: 'text-[12px]',
    skillBadgeContainerClass: 'flex flex-wrap gap-1.5 mt-1',
    skillBadgeClass: 'inline-block px-2.5 py-1 text-[11px] font-medium border rounded',
    nameClass: 'text-[34px] font-bold tracking-tight text-gray-900 leading-none mb-1 [font-family:Georgia,serif]',
    headerTitleClass: 'text-[16px] font-medium text-gray-600 italic',
    contactClass: 'text-[12px] text-gray-600',
    summaryClass: 'text-[12.5px] text-gray-700 leading-relaxed italic',
  },
};
