/**
 * Chargement des fixtures golden → objets du domaine (Profile, MasterEntry,
 * CVBlock, CVDocument) tels que PrintableCV les reçoit dans l'app.
 *
 * Format d'une fixture (JSON) :
 *   {
 *     "profile":  { champs de Profile, "photo": "fichier.png" optionnel },
 *     "cv":       { name, targetJob, customSummary, settings },
 *     "sections": [ { "name", "displayFormat"?, "items": [ entrée | { "customText" } ] } ]
 *   }
 * Chaque section produit un bloc `section_header` suivi d'un bloc par item,
 * exactement comme la composition faite dans le CV builder.
 *
 * Une fixture « dérivée » (`extends`) reprend une autre fixture et remplace
 * `cv.settings` et la liste des templates (ex. my-settings).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CVBlock, CVDocument } from '../../../src/types/cv';
import type { EntryType, MasterEntry, Profile } from '../../../src/types/profile';

export const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures');

/** Horodatage fixe : aucune date « maintenant » ne doit entrer dans le rendu. */
const FIXED_TS = '2026-01-01T00:00:00.000Z';
const PROFILE_ID = 'golden-profile';
const CV_ID = 'golden-cv';

interface FixtureEntry {
  entryType: EntryType;
  title: string;
  subtitle?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
  overrideData?: Record<string, unknown>;
}

interface FixtureSection {
  name: string;
  displayFormat?: string;
  items: (FixtureEntry | { customText: string })[];
}

interface BaseFixture {
  description?: string;
  profile: Partial<Profile> & { firstName: string; lastName: string; photo?: string };
  cv: { name: string; targetJob?: string | null; customSummary?: string | null; settings?: Record<string, unknown> };
  sections: FixtureSection[];
}

interface DerivedFixture {
  description?: string;
  extends: string;
  templates: string[];
  settings: Record<string, unknown>;
}

export interface CaseData {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
}

export interface LoadedFixture {
  name: string;
  data: CaseData;
  /** Templates imposés par la fixture (fixture dérivée) ; sinon undefined = tous. */
  templates?: string[];
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8')) as T;
}

function photoDataUrl(file: string): string {
  const bytes = readFileSync(join(FIXTURES_DIR, file));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function buildBase(fx: BaseFixture, templateId: string): CaseData {
  const { photo, ...p } = fx.profile;
  const profile: Profile = {
    id: PROFILE_ID,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email ?? null,
    phone: p.phone ?? null,
    address: p.address ?? null,
    city: p.city ?? null,
    postalCode: p.postalCode ?? null,
    country: p.country ?? 'France',
    linkedinUrl: p.linkedinUrl ?? null,
    githubUrl: p.githubUrl ?? null,
    portfolioUrl: p.portfolioUrl ?? null,
    photoPath: photo ? photoDataUrl(photo) : null,
    title: p.title ?? null,
    summary: p.summary ?? null,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };

  const entries: MasterEntry[] = [];
  const blocks: CVBlock[] = [];
  let order = 0;
  const pushBlock = (b: Omit<CVBlock, 'id' | 'cvId' | 'sortOrder' | 'isVisible' | 'createdAt'>) => {
    order += 1;
    blocks.push({ id: `b${order}`, cvId: CV_ID, sortOrder: order, isVisible: true, createdAt: FIXED_TS, ...b });
  };

  for (const section of fx.sections) {
    pushBlock({
      entryId: null,
      blockType: 'section_header',
      sectionName: section.name,
      customContent: null,
      overrideData: section.displayFormat ? { displayFormat: section.displayFormat } : {},
    });
    for (const item of section.items) {
      if ('customText' in item) {
        pushBlock({ entryId: null, blockType: 'custom_text', sectionName: null, customContent: item.customText, overrideData: {} });
        continue;
      }
      const id = `e${entries.length + 1}`;
      entries.push({
        id,
        profileId: PROFILE_ID,
        entryType: item.entryType,
        title: item.title,
        subtitle: item.subtitle ?? null,
        location: item.location ?? null,
        startDate: item.startDate ?? null,
        endDate: item.endDate ?? null,
        isCurrent: item.isCurrent ?? false,
        description: item.description ?? null,
        metadata: {},
        sortOrder: entries.length,
        tags: [],
        createdAt: FIXED_TS,
        updatedAt: FIXED_TS,
      });
      pushBlock({ entryId: id, blockType: 'entry_ref', sectionName: null, customContent: null, overrideData: item.overrideData ?? {} });
    }
  }

  const cv: CVDocument = {
    id: CV_ID,
    profileId: PROFILE_ID,
    name: fx.cv.name,
    templateId,
    targetJob: fx.cv.targetJob ?? null,
    targetCompany: null,
    customSummary: fx.cv.customSummary ?? null,
    settings: fx.cv.settings ?? {},
    isFavorite: false,
    lastExported: null,
    markdownContent: null,
    markdownMode: 0,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };

  return { cv, profile, blocks, entries };
}

/** Charge une fixture pour un template donné. */
export function loadFixture(name: string, templateId: string): LoadedFixture {
  const raw = readJson<BaseFixture | DerivedFixture>(name);
  if ('extends' in raw) {
    const base = buildBase(readJson<BaseFixture>(raw.extends), templateId);
    base.cv.settings = { ...raw.settings };
    return { name, data: base, templates: raw.templates };
  }
  return { name, data: buildBase(raw, templateId) };
}

/** Templates imposés par une fixture dérivée, sinon undefined. */
export function fixtureTemplates(name: string): string[] | undefined {
  const raw = readJson<BaseFixture | DerivedFixture>(name);
  return 'extends' in raw ? raw.templates : undefined;
}
