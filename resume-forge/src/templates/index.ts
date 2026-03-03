import { atsClassic } from './ats-classic';
import { CVTemplate } from '../types/template';

export const templates: Record<string, CVTemplate> = {
  'ats-classic': atsClassic,
};

export function getTemplate(id: string): CVTemplate {
  return templates[id] || atsClassic;
}
