import type { DensityId, HeaderVariantId, Palette, TemplateCategory } from '../theme/tokens';

/**
 * Disposition générale du CV.
 * - `linear`        : colonne unique, flux vertical — compatible ATS.
 * - `sidebar-left`  : bande latérale colorée à gauche (contact, compétences…)
 *                     + colonne principale à droite — pensé pour l'œil humain.
 * - `sidebar-right` : idem, bande latérale à droite.
 */
export type CVLayout = 'linear' | 'sidebar-left' | 'sidebar-right';

/** Réglages de la bande latérale (layouts `sidebar-*`). */
export interface SidebarConfig {
  /** Couleur de fond de la bande. Défaut : couleur d'accent du template. */
  bg?: string;
  /** Couleur du texte dans la bande. Défaut : blanc. */
  text?: string;
  /** Couleur des titres de section dans la bande. Défaut : `text`. */
  heading?: string;
  /** Largeur de la bande (ex: '34%'). Défaut : '34%'. */
  width?: string;
}

export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  /** Catégorie pour regrouper dans le sélecteur */
  category: TemplateCategory;
  /**
   * Disposition générale. Défaut : `linear` (ATS-safe).
   * Les layouts `sidebar-*` produisent un CV graphique deux colonnes,
   * optimisé pour un recruteur humain (non garanti ATS).
   */
  layout?: CVLayout;
  /** Configuration de la bande latérale (layouts `sidebar-*`). */
  sidebar?: SidebarConfig;
  /**
   * Le template respecte les contraintes de lecture ATS (colonne unique,
   * pas de tableau). Défaut : true. Les templates graphiques passent à false
   * pour afficher un avertissement « envoi à un recruteur humain ».
   */
  atsOptimized?: boolean;
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
