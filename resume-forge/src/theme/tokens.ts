/**
 * Design tokens partagés pour les templates de CV.
 *
 * Ces tokens permettent une composition cohérente entre templates (palettes,
 * densités, stacks typographiques) tout en conservant une contrainte ATS stricte :
 * pas de colonnes, pas de tables, polices système uniquement.
 */

// ───────────────────────────────────────────────────────────────────────────
// PALETTES
// ───────────────────────────────────────────────────────────────────────────

export interface Palette {
  id: string;
  name: string;
  /** Couleur d'accent principale (bordures, titres de section, liens) */
  accent: string;
  /** Variante plus claire pour fonds de badges / surlignages (20% opacité recommandée) */
  accentSoft: string;
  /** Couleur de texte sombre (nom, titres d'entrée) */
  ink: string;
}

/** Palettes sobres — compatibles avec des profils corporate / classiques. */
export const PALETTES_SOBER: Palette[] = [
  { id: 'marine',    name: 'Bleu marine', accent: '#1e3a8a', accentSoft: '#dbeafe', ink: '#0f172a' },
  { id: 'graphite',  name: 'Graphite',    accent: '#1f2937', accentSoft: '#e5e7eb', ink: '#111827' },
  { id: 'bordeaux',  name: 'Bordeaux',    accent: '#7f1d1d', accentSoft: '#fee2e2', ink: '#1c1917' },
  { id: 'foret',     name: 'Forêt',       accent: '#14532d', accentSoft: '#dcfce7', ink: '#0f172a' },
];

/** Palettes expressives — pour profils tech, créatifs ou design. */
export const PALETTES_VIBRANT: Palette[] = [
  { id: 'indigo',    name: 'Indigo',      accent: '#4f46e5', accentSoft: '#e0e7ff', ink: '#1e1b4b' },
  { id: 'emeraude',  name: 'Émeraude',    accent: '#047857', accentSoft: '#d1fae5', ink: '#064e3b' },
  { id: 'terracota', name: 'Terracotta',  accent: '#c2410c', accentSoft: '#ffedd5', ink: '#431407' },
  { id: 'prune',     name: 'Prune',       accent: '#7e22ce', accentSoft: '#f3e8ff', ink: '#3b0764' },
];

/** Palettes neutres — pour minimalistes et académiques. */
export const PALETTES_NEUTRAL: Palette[] = [
  { id: 'noir',      name: 'Noir',        accent: '#111827', accentSoft: '#f3f4f6', ink: '#030712' },
  { id: 'ardoise',   name: 'Ardoise',     accent: '#334155', accentSoft: '#f1f5f9', ink: '#0f172a' },
  { id: 'sepia',     name: 'Sépia',       accent: '#78350f', accentSoft: '#fef3c7', ink: '#1c1917' },
];

export const ALL_PALETTES: Palette[] = [
  ...PALETTES_SOBER,
  ...PALETTES_VIBRANT,
  ...PALETTES_NEUTRAL,
];

export function getPalette(id: string | undefined): Palette | undefined {
  if (!id) return undefined;
  return ALL_PALETTES.find(p => p.id === id);
}

// ───────────────────────────────────────────────────────────────────────────
// DENSITÉ
// ───────────────────────────────────────────────────────────────────────────

export type DensityId = 'compact' | 'normal' | 'comfortable';

export interface DensityPreset {
  id: DensityId;
  name: string;
  /** Applied to PrintableCV settings overrides */
  entrySpacing: string;
  sectionHeaderGap: string;
  bodyLineHeight: string;
  pageMargin: string;
  bodyFontSize: string;
}

export const DENSITY_PRESETS: Record<DensityId, DensityPreset> = {
  compact: {
    id: 'compact',
    name: 'Compact',
    entrySpacing: '8px',
    sectionHeaderGap: '6px',
    bodyLineHeight: '1.35',
    pageMargin: '28px 36px',
    bodyFontSize: '10.5px',
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    entrySpacing: '14px',
    sectionHeaderGap: '10px',
    bodyLineHeight: '1.5',
    pageMargin: '40px 48px',
    bodyFontSize: '11px',
  },
  comfortable: {
    id: 'comfortable',
    name: 'Aéré',
    entrySpacing: '20px',
    sectionHeaderGap: '14px',
    bodyLineHeight: '1.65',
    pageMargin: '56px 60px',
    bodyFontSize: '11.5px',
  },
};

// ───────────────────────────────────────────────────────────────────────────
// TYPOGRAPHIE (polices système uniquement — ATS-safe)
// ───────────────────────────────────────────────────────────────────────────

export const FONT_STACKS = {
  calibri:   "'Calibri', 'Arial', sans-serif",
  arial:     "'Arial', sans-serif",
  helvetica: "'Helvetica', 'Arial', sans-serif",
  georgia:   "'Georgia', 'Cambria', serif",
  cambria:   "'Cambria', 'Georgia', serif",
  times:     "'Times New Roman', serif",
} as const;

export const FONT_NAMES = {
  calibri:   'Calibri',
  arial:     'Arial',
  helvetica: 'Helvetica',
  georgia:   'Georgia',
  cambria:   'Cambria',
  times:     'Times New Roman',
} as const;

// ───────────────────────────────────────────────────────────────────────────
// CATÉGORIES
// ───────────────────────────────────────────────────────────────────────────

export type TemplateCategory = 'ats' | 'executive' | 'tech' | 'creative' | 'academic';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  ats:       'ATS',
  executive: 'Executive',
  tech:      'Tech',
  creative:  'Créatif',
  academic:  'Académique',
};

// ───────────────────────────────────────────────────────────────────────────
// HEADER VARIANTS
// ───────────────────────────────────────────────────────────────────────────

export type HeaderVariantId = 'clean' | 'accent-bar' | 'accent-light' | 'accent-banner' | 'dark-banner' | 'gradient-banner';

export const HEADER_VARIANT_LABELS: Record<HeaderVariantId, string> = {
  'clean':            'Sobre',
  'accent-bar':       'Filet coloré',
  'accent-light':     'Fond doux',
  'accent-banner':    'Bandeau couleur',
  'dark-banner':      'Bandeau sombre',
  'gradient-banner':  'Bandeau dégradé',
};
