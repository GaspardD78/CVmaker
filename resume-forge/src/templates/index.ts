import { atsClassic } from './ats-classic';
import { atsModern } from './ats-modern';
import { elegant } from './elegant';
import { minimalist } from './minimalist';
import { tech } from './tech';
import { executive } from './executive';
import { creative } from './creative';
import { academic } from './academic';
import { sidebarModern } from './sidebar-modern';
import { sidebarElegant } from './sidebar-elegant';
import { sidebarTech } from './sidebar-tech';
import { CVTemplate } from '../types/template';
import type { TemplateCategory } from '../theme/tokens';

export const templates: Record<string, CVTemplate> = {
  'ats-classic': atsClassic,
  'ats-modern': atsModern,
  'elegant': elegant,
  'minimalist': minimalist,
  'tech': tech,
  'executive': executive,
  'creative': creative,
  'academic': academic,
  'sidebar-modern': sidebarModern,
  'sidebar-elegant': sidebarElegant,
  'sidebar-tech': sidebarTech,
};

/** Ordre d'affichage dans le sélecteur — groupé par catégorie. */
export const TEMPLATE_ORDER: string[] = [
  'ats-classic',
  'ats-modern',
  'minimalist',
  'elegant',
  'executive',
  'tech',
  'creative',
  'academic',
  'sidebar-modern',
  'sidebar-tech',
  'sidebar-elegant',
];

export function getTemplate(id: string): CVTemplate {
  return templates[id] || atsClassic;
}

export function getTemplatesByCategory(category: TemplateCategory): CVTemplate[] {
  return TEMPLATE_ORDER
    .map(id => templates[id])
    .filter((t): t is CVTemplate => !!t && t.category === category);
}

export function getAllTemplates(): CVTemplate[] {
  return TEMPLATE_ORDER.map(id => templates[id]).filter((t): t is CVTemplate => !!t);
}
