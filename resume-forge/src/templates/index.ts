import { atsClassic } from './ats-classic';
import { atsModern } from './ats-modern';
import { elegant } from './elegant';
import { minimalist } from './minimalist';
import { CVTemplate } from '../types/template';

export const templates: Record<string, CVTemplate> = {
  'ats-classic': atsClassic,
  'ats-modern': atsModern,
  'elegant': elegant,
  'minimalist': minimalist,
};

export function getTemplate(id: string): CVTemplate {
  return templates[id] || atsClassic;
}
