import { Profile, MasterEntry } from '@/types/profile';
import { CVDocument, CVBlock } from '@/types/cv';
import { getPromptTemplate, DEFAULT_DIFFERENTIATOR } from './prompt-templates';
import { getSetting } from './db';

export interface ResolverContext {
  profile: Profile;
  cv: CVDocument;
  blocks: CVBlock[];
  entries: MasterEntry[];
  jobOffer: string;
  /** Required for template 'reformulate-experience' */
  targetBlock?: CVBlock;
  /** Required for template 'application-message' */
  contactName?: string;
  /** Custom differentiator from settings, falls back to DEFAULT_DIFFERENTIATOR */
  differentiator?: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Aujourd\'hui';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

/**
 * Get visible blocks sorted by sort_order.
 */
function getVisibleBlocks(blocks: CVBlock[]): CVBlock[] {
  return blocks.filter(b => b.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get visible entry_ref blocks with their resolved entry data.
 */
function getVisibleEntryBlocks(
  blocks: CVBlock[],
  entries: MasterEntry[],
  entryTypes?: string[]
): Array<{ block: CVBlock; entry: MasterEntry }> {
  const visible = getVisibleBlocks(blocks);
  const result: Array<{ block: CVBlock; entry: MasterEntry }> = [];

  for (const block of visible) {
    if (block.blockType !== 'entry_ref' || !block.entryId) continue;
    const entry = entries.find(e => e.id === block.entryId);
    if (!entry) continue;
    if (entryTypes && !entryTypes.includes(entry.entryType)) continue;
    result.push({ block, entry });
  }

  return result;
}

/**
 * Format a list of experience/education/certification entries with descriptions.
 */
function formatPostesCV(blocks: CVBlock[], entries: MasterEntry[]): string {
  const items = getVisibleEntryBlocks(blocks, entries, ['experience', 'education', 'certification']);
  if (items.length === 0) return '(aucune expérience renseignée)';

  return items.map(({ block, entry }) => {
    const data = { ...entry, ...block.overrideData };
    const title = (data.title as string) || entry.title;
    const subtitle = (data.subtitle as string) || entry.subtitle || '';
    const startDate = formatDate((data.startDate as string) || entry.startDate);
    const endDate = (data.isCurrent || entry.isCurrent)
      ? 'Présent'
      : formatDate((data.endDate as string) || entry.endDate);
    const dates = `${startDate} - ${endDate}`;
    const description = (data.description as string) || entry.description || '';

    return `**${title}** | ${subtitle} (${dates})\n${description}`;
  }).join('\n\n');
}

/**
 * Format a short list of experience entries (no descriptions).
 */
function formatPostesCourts(blocks: CVBlock[], entries: MasterEntry[]): string {
  const items = getVisibleEntryBlocks(blocks, entries, ['experience', 'education', 'certification']);
  if (items.length === 0) return '(aucune expérience renseignée)';

  return items.map(({ block, entry }) => {
    const data = { ...entry, ...block.overrideData };
    const title = (data.title as string) || entry.title;
    const subtitle = (data.subtitle as string) || entry.subtitle || '';
    const startDate = formatDate((data.startDate as string) || entry.startDate);
    const endDate = (data.isCurrent || entry.isCurrent)
      ? 'Présent'
      : formatDate((data.endDate as string) || entry.endDate);
    return `**${title}** | ${subtitle} (${startDate} - ${endDate})`;
  }).join('\n');
}

/**
 * Format all visible blocks with their section headers.
 */
function formatBlocsCV(blocks: CVBlock[], entries: MasterEntry[]): string {
  const visible = getVisibleBlocks(blocks);
  if (visible.length === 0) return '(aucun bloc visible)';

  let currentSection = '';
  const parts: string[] = [];

  for (const block of visible) {
    if (block.blockType === 'section_header') {
      currentSection = block.sectionName || '';
      parts.push(`\n### ${currentSection}`);
    } else if (block.blockType === 'entry_ref' && block.entryId) {
      const entry = entries.find(e => e.id === block.entryId);
      if (!entry) continue;
      const data = { ...entry, ...block.overrideData };
      const title = (data.title as string) || entry.title;
      const subtitle = (data.subtitle as string) || entry.subtitle || '';
      const description = (data.description as string) || entry.description || '';
      parts.push(`- ${title}${subtitle ? ` | ${subtitle}` : ''}${description ? `\n  ${description}` : ''}`);
    } else if (block.blockType === 'custom_text') {
      parts.push(block.customContent || '');
    }
  }

  return parts.join('\n');
}

/**
 * Get comma-separated skill titles from visible blocks.
 */
function formatCompetences(blocks: CVBlock[], entries: MasterEntry[]): string {
  const items = getVisibleEntryBlocks(blocks, entries, ['skill']);
  if (items.length === 0) return '(aucune compétence renseignée)';
  return items.map(({ block, entry }) => {
    const data = { ...entry, ...block.overrideData };
    return (data.title as string) || entry.title;
  }).join(', ');
}

/**
 * Get comma-separated certification titles from visible blocks.
 */
function formatCertifications(blocks: CVBlock[], entries: MasterEntry[]): string {
  const items = getVisibleEntryBlocks(blocks, entries, ['certification']);
  if (items.length === 0) return '(aucune certification renseignée)';
  return items.map(({ block, entry }) => {
    const data = { ...entry, ...block.overrideData };
    return (data.title as string) || entry.title;
  }).join(', ');
}

/**
 * Resolve all placeholders in a prompt template.
 * Returns the fully resolved prompt string.
 *
 * Async: loads sector_context and differentiator from settings at resolve time.
 */
export async function resolvePrompt(templateId: string, context: ResolverContext): Promise<string> {
  const template = getPromptTemplate(templateId);
  if (!template) return `(template "${templateId}" introuvable)`;

  const { profile, cv, blocks, entries, jobOffer, targetBlock, contactName, differentiator } = context;

  // Load sector settings
  const sectorContext = await getSetting('sector_context').catch(() => null) ?? '';
  const settingsDifferentiator = await getSetting('differentiator').catch(() => null);

  // Resolve the effective differentiator: context prop > settings > DEFAULT_DIFFERENTIATOR
  const effectiveDifferentiator = differentiator
    || settingsDifferentiator
    || DEFAULT_DIFFERENTIATOR;

  // Build placeholder map
  const placeholders: Record<string, string> = {
    '{prénom}': profile.firstName || '(non renseigné)',
    '{nom}': profile.lastName || '(non renseigné)',
    '{titre}': cv.targetJob || profile.title || '(non renseigné)',
    '{résumé}': cv.customSummary || profile.summary || '(non renseigné)',
    '{liste_postes_cv}': formatPostesCV(blocks, entries),
    '{liste_postes_courts}': formatPostesCourts(blocks, entries),
    '{liste_blocs_cv}': formatBlocsCV(blocks, entries),
    '{compétences}': formatCompetences(blocks, entries),
    '{certifications}': formatCertifications(blocks, entries),
    '{texte_annonce}': jobOffer || '(non renseigné)',
    '{poste_cible}': cv.targetJob || '(non renseigné)',
    '{entreprise_cible}': cv.targetCompany || '(non renseignée)',
    '{atout_différenciant}': effectiveDifferentiator,
    '{contact_name}': contactName || '(non renseigné)',
    '{contexte_métier}': sectorContext || 'recrutement spécialisé en cybersécurité',
  };

  // Block-specific placeholders (for template 'reformulate-experience')
  if (targetBlock && targetBlock.entryId) {
    const entry = entries.find(e => e.id === targetBlock.entryId);
    if (entry) {
      const data = { ...entry, ...targetBlock.overrideData };
      placeholders['{titre_bloc}'] = (data.title as string) || entry.title || '(non renseigné)';
      placeholders['{sous_titre_bloc}'] = (data.subtitle as string) || entry.subtitle || '(non renseigné)';
      const startDate = formatDate((data.startDate as string) || entry.startDate);
      const endDate = (data.isCurrent || entry.isCurrent)
        ? 'Présent'
        : formatDate((data.endDate as string) || entry.endDate);
      placeholders['{dates_bloc}'] = `${startDate} - ${endDate}`;
      placeholders['{description_bloc}'] = (data.description as string) || entry.description || '(non renseigné)';
    }
  } else {
    placeholders['{titre_bloc}'] = '(non renseigné)';
    placeholders['{sous_titre_bloc}'] = '(non renseigné)';
    placeholders['{dates_bloc}'] = '(non renseigné)';
    placeholders['{description_bloc}'] = '(non renseigné)';
  }

  // Replace all placeholders
  let result = template.template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.split(key).join(value);
  }

  return result;
}
