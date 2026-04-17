import type { DensityId, HeaderVariantId, Palette, TemplateCategory } from '../theme/tokens';

export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  /** Catégorie pour regrouper dans le sélecteur */
  category: TemplateCategory;
  /** Tags profils recommandés (ex: 'fr', 'international', 'dev', 'senior') */
  recommendedFor?: string[];
  /** Le template supporte l'affichage d'une photo (par défaut true) */
  supportsPhoto?: boolean;
  /** Palettes proposées (1re = défaut). Si omis, fallback sur palettes sobres. */
  palettes?: Palette[];
  /** Densité par défaut (compact/normal/comfortable) */
  defaultDensity?: DensityId;
  /** Variantes d'ent\u00eate autorisées (1re = défaut) */
  headerVariants?: HeaderVariantId[];
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
