import { atsClassic } from './ats-classic';
import { atsModern } from './ats-modern';
import { CVTemplate } from '../types/template';

export const templates: Record<string, CVTemplate> = {
  'ats-classic': atsClassic,
  'ats-modern': atsModern,
};

export function getTemplate(id: string): CVTemplate {
  return templates[id] || atsClassic;
}
