import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { generateDocxBlob } from './export-docx';
import { getTemplate } from '../templates';
import type { CVBlock, CVDocument } from '../types/cv';
import type { EntryType, MasterEntry, Profile } from '../types/profile';

const TS = '2026-01-01T00:00:00.000Z';

const profile: Profile = {
  id: 'p', firstName: 'Léo', lastName: 'Martin', email: 'leo.martin@example.com', phone: null, address: null,
  city: null, postalCode: null, country: 'France', linkedinUrl: null, githubUrl: null, portfolioUrl: null,
  photoPath: null, title: null, summary: null, createdAt: TS, updatedAt: TS,
};

interface Spec {
  key: string;
  type: EntryType;
  start?: string | null;
  end?: string | null;
  current?: boolean;
  datesOverride?: string;
}

// Un titre sans espace superflu ni caractère à échapper par entrée, pour retrouver son paragraphe.
const SPECS: Spec[] = [
  { key: 'EnCours', type: 'experience', start: '2022-09', current: true },
  { key: 'Terminee', type: 'experience', start: '2020-03', end: '2022-08' },
  { key: 'MemeAnnee', type: 'experience', start: '2023-02', end: '2023-09' },
  { key: 'SansFin', type: 'experience', start: '2019-05' },
  { key: 'SansDebut', type: 'experience', current: true },
  { key: 'Surcharge', type: 'experience', start: '2011-09', end: '2012-09', datesOverride: '2011 – 2012 (alternance, 1 an)' },
  { key: 'Formation', type: 'education', start: '2010-09', end: '2012-06' },
  { key: 'FormationSurcharge', type: 'education', start: '2007-01', end: '2010-06', datesOverride: '2007 - 2010 (diplôme)' },
  { key: 'Projet', type: 'project', start: '2021-05', end: '2022-01' },
];

function build(settings: Record<string, unknown>): { cv: CVDocument; blocks: CVBlock[]; entries: MasterEntry[] } {
  const entries: MasterEntry[] = SPECS.map((s, i) => ({
    id: `e${i}`, profileId: 'p', entryType: s.type, title: s.key, subtitle: null, location: null,
    startDate: s.start ?? null, endDate: s.end ?? null, isCurrent: s.current ?? false, description: null,
    metadata: {}, sortOrder: i, tags: [], createdAt: TS, updatedAt: TS,
  }));
  const blocks: CVBlock[] = SPECS.map((s, i) => ({
    id: `b${i}`, cvId: 'c', entryId: `e${i}`, blockType: 'entry_ref', sectionName: null, customContent: null,
    sortOrder: i, isVisible: true, overrideData: s.datesOverride ? { datesOverride: s.datesOverride } : {}, createdAt: TS,
  }));
  const cv: CVDocument = {
    id: 'c', profileId: 'p', name: 'CV', templateId: 'ats-classic', targetJob: null, targetCompany: null,
    customSummary: null, settings, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0,
    createdAt: TS, updatedAt: TS,
  };
  return { cv, blocks, entries };
}

const decode = (t: string) => t.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Date affichée (texte entre parenthèses) de chaque entrée du DOCX, par titre ; null si le paragraphe n'en porte pas. */
async function docxDates(settings: Record<string, unknown>): Promise<Record<string, string | null>> {
  const { cv, blocks, entries } = build(settings);
  const blob = await generateDocxBlob(cv, profile, blocks, entries, getTemplate('ats-classic'));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const out: Record<string, string | null> = {};
  for (const [paragraph] of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const texts = [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decode(m[1]));
    const key = SPECS.find((s) => texts.includes(s.key))?.key;
    if (!key) continue;
    out[key] = texts.map((t) => /^ {2}\((.*)\)$/.exec(t)?.[1]).find((d) => d !== undefined) ?? null;
  }
  return out;
}

// Mois et année : la lecture historique passe par Date (NOTES.md §3), donc ces valeurs
// supposent un fuseau sans décalage négatif (UTC, Europe/Paris).
describe('export DOCX, mois et année (défaut)', () => {
  test('comportement historique conservé, « Aujourd\'hui » compris', async () => {
    const d = await docxDates({});
    expect(d.EnCours).toBe('septembre 2022 - Présent');
    expect(d.Terminee).toBe('mars 2020 - août 2022');
    expect(d.MemeAnnee).toBe('février 2023 - septembre 2023');
    expect(d.SansFin).toBe("mai 2019 - Aujourd'hui");
    expect(d.Formation).toBe('2010 - 2012');
    expect(d.Projet).toBe('mai 2021 - janvier 2022');
  });

  test('surcharge datesOverride affichée telle quelle', async () => {
    expect((await docxDates({})).Surcharge).toBe('2011 – 2012 (alternance, 1 an)');
  });

  test('« en cours » sans date de début : « Présent », comme le PDF', async () => {
    expect((await docxDates({})).SansDebut).toBe('Présent');
  });
});

describe('export DOCX, mode année', () => {
  const settings = { dateFormat: 'year' };

  test('toutes les dates en années seules, « Présent » et « Aujourd\'hui » conservés', async () => {
    const d = await docxDates(settings);
    expect(d.EnCours).toBe('2022 - Présent');
    expect(d.Terminee).toBe('2020 - 2022');
    expect(d.SansFin).toBe("2019 - Aujourd'hui");
    expect(d.SansDebut).toBe('Présent');
    expect(d.Formation).toBe('2010 - 2012');
    expect(d.Projet).toBe('2021 - 2022');
  });

  test('période dans une seule année : une année', async () => {
    expect((await docxDates(settings)).MemeAnnee).toBe('2023');
  });

  test('surcharge datesOverride conservée telle quelle', async () => {
    expect((await docxDates(settings)).Surcharge).toBe('2011 – 2012 (alternance, 1 an)');
  });

  test('une valeur inattendue retombe sur mois et année', async () => {
    expect((await docxDates({ dateFormat: 'annee' })).Terminee).toBe('mars 2020 - août 2022');
  });
});

describe('export DOCX, années de formation masquées', () => {
  test('aucune date pour les formations, surcharge comprise, sans parenthèses vides', async () => {
    for (const settings of [{ showEducationYears: false }, { dateFormat: 'year', showEducationYears: false }]) {
      const d = await docxDates(settings);
      expect(d.Formation).toBeNull();
      expect(d.FormationSurcharge).toBeNull();
    }
  });

  test('les autres types gardent leurs dates', async () => {
    const d = await docxDates({ dateFormat: 'year', showEducationYears: false });
    expect(d.EnCours).toBe('2022 - Présent');
    expect(d.Terminee).toBe('2020 - 2022');
    expect(d.Projet).toBe('2021 - 2022');
    expect(d.Surcharge).toBe('2011 – 2012 (alternance, 1 an)');
  });

  test('affichées par défaut, surcharge comprise', async () => {
    const d = await docxDates({});
    expect(d.Formation).toBe('2010 - 2012');
    expect(d.FormationSurcharge).toBe('2007 - 2010 (diplôme)');
  });
});

// ── Sections vides et sous-en-têtes (spec 004) ────────────────────────────────

async function docxParagraphs(cv: CVDocument, blocks: CVBlock[], entries: MasterEntry[]): Promise<string[]> {
  const blob = await generateDocxBlob(cv, profile, blocks, entries, getTemplate('ats-classic'));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decode(m[1])).join(''),
  );
}

describe('export DOCX, sections vides (même règle que le PDF)', () => {
  const entry = (id: string, type: EntryType, title: string): MasterEntry => ({
    id, profileId: 'p', entryType: type, title, subtitle: null, location: null, startDate: null, endDate: null,
    isCurrent: false, description: null, metadata: {}, sortOrder: 0, tags: [], createdAt: TS, updatedAt: TS,
  });
  const header = (id: string, name: string, order: number, overrideData: Record<string, unknown> = {}): CVBlock => ({
    id, cvId: 'c', entryId: null, blockType: 'section_header', sectionName: name, customContent: null,
    sortOrder: order, isVisible: true, overrideData, createdAt: TS,
  });
  const ref = (id: string, entryId: string, order: number, isVisible = true): CVBlock => ({
    id, cvId: 'c', entryId, blockType: 'entry_ref', sectionName: null, customContent: null,
    sortOrder: order, isVisible, overrideData: {}, createdAt: TS,
  });
  const entries = [entry('e1', 'experience', 'Poste'), entry('e2', 'education', 'Diplome'), entry('s1', 'skill', 'Python'), entry('s2', 'skill', 'Go')];
  const { cv } = build({});

  test('masque la section dont toutes les entrées sont masquées et celle sans entrée', async () => {
    const blocks = [
      header('h1', 'Expériences', 0), ref('b1', 'e1', 1),
      header('h2', 'Formations', 2), ref('b2', 'e2', 3, false),
      header('h3', 'Langues', 4),
    ];
    const text = (await docxParagraphs(cv, blocks, entries)).join('\n');
    expect(text).toContain('EXPÉRIENCES');
    expect(text).not.toContain('FORMATIONS');
    expect(text).not.toContain('LANGUES');
  });

  test('rend un sous-en-tête de catégorie en paragraphe simple et masque celui sans compétence', async () => {
    const blocks = [
      header('h1', 'Compétences', 0),
      header('g1', 'Langages', 1, { level: 'sub' }), ref('b1', 's1', 2), ref('b2', 's2', 3),
      header('g2', 'Vide', 4, { level: 'sub' }),
    ];
    const paragraphs = await docxParagraphs(cv, blocks, entries);
    expect(paragraphs).toContain('COMPÉTENCES');
    expect(paragraphs).toContain('Langages');
    expect(paragraphs).not.toContain('Vide');
    expect(paragraphs).not.toContain('LANGAGES');
  });

  test('« Present » quand le CV est en anglais', async () => {
    const { cv: enCv, blocks, entries: e } = build({ cvLanguage: 'en' });
    const blob = await generateDocxBlob(enCv, profile, blocks, e, getTemplate('ats-classic'));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('September 2022 - Present');
  });
});
