import { CVTemplate } from '../types/template';
import { PALETTES_VIBRANT, PALETTES_SOBER } from '../theme/tokens';

/**
 * Template graphique deux colonnes — bande latérale sombre à gauche.
 * Pensé pour un envoi direct à un recruteur humain : la photo, les
 * coordonnées et les compétences sont mises en valeur dans la bande,
 * l'expérience respire dans la colonne principale. Non garanti ATS.
 */
export const sidebarModern: CVTemplate = {
  id: 'sidebar-modern',
  name: 'Sidebar Moderne',
  description: 'Deux colonnes, bande latérale sombre pour la photo et les compétences. Idéal recruteur humain (non-ATS).',
  category: 'graphic',
  layout: 'sidebar-left',
  atsOptimized: false,
  recommendedFor: ['design', 'marketing', 'produit', 'startup'],
  supportsPhoto: true,
  palettes: [PALETTES_VIBRANT[0], PALETTES_VIBRANT[1], PALETTES_SOBER[0], PALETTES_VIBRANT[3]],
  defaultDensity: 'normal',
  headerVariants: ['clean'],
  sidebar: {
    bg: '#1e293b',
    text: '#f8fafc',
    width: '34%',
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
    headingClass: 'text-[13px] font-bold uppercase tracking-[0.12em] text-indigo-700 mb-3 mt-6 pb-1.5 border-b-2 border-indigo-100',
    entryClass: 'mb-4',
    titleClass: 'font-bold text-gray-900 text-[13.5px]',
    subtitleClass: 'text-indigo-700 text-[12.5px] font-semibold',
    dateClass: 'text-gray-500 text-[11px] tabular-nums mb-1',
    descriptionClass: 'text-gray-700 text-[12px] whitespace-pre-line leading-relaxed',
    skillsContainerClass: 'space-y-1',
    skillClass: 'text-[12px]',
    skillBadgeContainerClass: 'flex flex-wrap gap-1.5 mt-1',
    skillBadgeClass: 'inline-block px-2.5 py-1 text-[11px] font-medium border rounded-full',
    nameClass: 'text-[32px] font-extrabold tracking-tight text-gray-900 leading-none mb-1',
    headerTitleClass: 'text-[15px] font-semibold uppercase tracking-[0.08em] text-indigo-700',
    contactClass: 'text-[12px] text-gray-600',
    summaryClass: 'text-[12.5px] text-gray-700 leading-relaxed',
  },
};
