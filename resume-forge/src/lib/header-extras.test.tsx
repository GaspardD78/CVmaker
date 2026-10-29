import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { PrintableCV } from '../components/export/PrintableCV';
import { generateDocxBlob } from './export-docx';
import { guardAiCv } from './ai-cv-guard';
import { parseAiCvResponse } from './ai-cv-response';
import { applyAiCvToBlocks } from './apply-ai-cv';
import { buildCvPrompt } from './cv-prompt';
import {
  headerSettingsPatch, matchProfileExtras, parseHeaderExtras, profileForHeader, serializeHeaderExtras,
} from './header-extras';
import { TEST_PROFILE, makeBlocks, makeEntries, makeFakeStore } from './test-helpers/cv-fixtures';
import { getAllTemplates } from '../templates';
import type { CVDocument } from '../types/cv';
import type { Profile } from '../types/profile';

const profile: Profile = { ...TEST_PROFILE, drivingLicense: 'Permis B', headerExtras: ['Mobilité Île-de-France', 'Disponible de suite'] };
const entries = makeEntries();
const cv: CVDocument = {
  id: 'cv1', profileId: 'p1', name: 'T', templateId: 'ats-classic', targetJob: null, targetCompany: null,
  customSummary: null, settings: {}, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0,
  createdAt: '', updatedAt: '',
};

describe('header-extras : lecture et correspondance', () => {
  it('parse un JSON, un tableau, du bruit', () => {
    expect(parseHeaderExtras('["A"," B ","a",1]')).toEqual(['A', 'B']);
    expect(parseHeaderExtras(['x', 'x'])).toEqual(['x']);
    expect(parseHeaderExtras('pas du json')).toEqual([]);
    expect(parseHeaderExtras(null)).toEqual([]);
  });

  it('sérialise en JSON, null si vide', () => {
    expect(serializeHeaderExtras(['A'])).toBe('["A"]');
    expect(serializeHeaderExtras([])).toBeNull();
  });

  it('ne retient que les mentions du profil, avec leur libellé exact', () => {
    expect(matchProfileExtras(['mobilite ile-de-france', 'Inventée'], profile.headerExtras!)).toEqual(['Mobilité Île-de-France']);
  });

  it('profileForHeader applique les réglages du CV sans toucher au profil', () => {
    const shown = profileForHeader(profile, {});
    expect(shown.drivingLicense).toBe('Permis B');
    expect(shown.headerExtras).toEqual(['Mobilité Île-de-France', 'Disponible de suite']);
    const filtered = profileForHeader(profile, { showDrivingLicense: false, hiddenHeaderExtras: ['Disponible de suite'] });
    expect(filtered.drivingLicense).toBeNull();
    expect(filtered.headerExtras).toEqual(['Mobilité Île-de-France']);
    expect(profile.drivingLicense).toBe('Permis B');
  });
});

describe('analyse du champ header', () => {
  it('le parseur l\'ignore s\'il est absent (v2 inchangé)', () => {
    const r = parseAiCvResponse(JSON.stringify({ schemaVersion: 2, entries: [], suggestedEntries: [] }));
    expect(r.header).toBeUndefined();
  });

  it('lit showDrivingLicense et extras', () => {
    const r = parseAiCvResponse(JSON.stringify({ entries: [], header: { showDrivingLicense: true, extras: ['A', 'A'] } }));
    expect(r.header).toEqual({ showDrivingLicense: true, extras: ['A'] });
  });

  it('le garde-fou retire les mentions inventées et avertit', () => {
    const { data, report } = guardAiCv(
      { entries: [], suggestedEntries: [], header: { showDrivingLicense: true, extras: ['Mobilité Île-de-France', 'Pilote de ligne'] } },
      { entries, profile },
    );
    expect(data.header).toEqual({ showDrivingLicense: true, extras: ['Mobilité Île-de-France'] });
    expect(report.warnings.map(w => w.code)).toContain('header-extra-invented');
  });

  it('le garde-fou ignore showDrivingLicense si le profil n\'a pas de permis', () => {
    const { data } = guardAiCv(
      { entries: [], suggestedEntries: [], header: { showDrivingLicense: true } },
      { entries, profile: TEST_PROFILE },
    );
    expect(data.header).toBeUndefined();
  });

  it('headerSettingsPatch masque les mentions non listées', () => {
    expect(headerSettingsPatch({ showDrivingLicense: false, extras: ['Disponible de suite'] }, profile))
      .toEqual({ showDrivingLicense: false, hiddenHeaderExtras: ['Mobilité Île-de-France'] });
    expect(headerSettingsPatch({}, profile)).toEqual({});
  });
});

describe('application du champ header', () => {
  it('écrit cv.settings, jamais le profil', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    await applyAiCvToBlocks('cv1', { entries: [], suggestedEntries: [], header: { extras: ['Disponible de suite'] } }, { store: () => store, entries, profile });
    expect(store.settings.hiddenHeaderExtras).toEqual(['Mobilité Île-de-France']);
    expect(profile.headerExtras).toEqual(['Mobilité Île-de-France', 'Disponible de suite']);
  });

  it('sans header, les réglages ne bougent pas', async () => {
    const store = makeFakeStore(makeBlocks(entries), { showDrivingLicense: false });
    await applyAiCvToBlocks('cv1', { entries: [], suggestedEntries: [] }, { store: () => store, entries, profile });
    expect(store.settings).toEqual({ showDrivingLicense: false });
  });
});

describe('prompt', () => {
  const input = { profile, entries, jobOfferText: 'Annonce', options: { now: new Date(Date.UTC(2026, 5, 15)) } };
  it('documente header quand le profil a un permis ou des mentions', () => {
    const p = buildCvPrompt(input);
    expect(p).toContain('"header"');
    expect(p).toContain('Permis : Permis B');
    expect(p).toContain('Mention : Mobilité Île-de-France');
  });
  it('omet header sinon', () => {
    expect(buildCvPrompt({ ...input, profile: TEST_PROFILE })).not.toContain('"header"');
  });
});

describe('rendu sur tous les templates', () => {
  const html = (templateId: string, settings: Record<string, unknown> = {}) => renderToStaticMarkup(
    <PrintableCV cv={{ ...cv, templateId, settings }} profile={profile} blocks={makeBlocks(entries)} entries={entries}
      template={getAllTemplates().find(t => t.id === templateId)!} />,
  );

  for (const t of getAllTemplates()) {
    it(`${t.id} : permis et mentions après la ville, masquables`, () => {
      const out = html(t.id);
      expect(out).toContain('Permis B');
      expect(out).toContain('Mobilité Île-de-France');
      expect(out.indexOf('Lyon')).toBeLessThan(out.indexOf('Permis B'));
      const hidden = html(t.id, { showDrivingLicense: false, hiddenHeaderExtras: ['Mobilité Île-de-France'] });
      expect(hidden).not.toContain('Permis B');
      expect(hidden).not.toContain('Mobilité Île-de-France');
      expect(hidden).toContain('Disponible de suite');
    });
  }
});

describe('export DOCX', () => {
  const text = async (settings: Record<string, unknown>) => {
    const blob = await generateDocxBlob({ ...cv, settings }, profile, makeBlocks(entries), entries, getAllTemplates()[0]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return (await zip.file('word/document.xml')!.async('string'));
  };
  it('affiche permis et mentions, après la ville', async () => {
    const xml = await text({});
    expect(xml).toContain('Permis B');
    expect(xml).toContain('Mobilité Île-de-France');
    expect(xml.indexOf('Lyon')).toBeLessThan(xml.indexOf('Permis B'));
  });
  it('respecte les réglages du CV', async () => {
    const xml = await text({ showDrivingLicense: false });
    expect(xml).not.toContain('Permis B');
  });
});

describe('mapping DB', () => {
  it('header_extras (JSON texte) est relu en tableau et réécrit en JSON', async () => {
    const { keysToCamelCase, keysToSnakeCase } = await import('./mapping');
    const p = keysToCamelCase<Profile>({ id: 'p', driving_license: 'Permis B', header_extras: '["A","B"]' });
    expect(p.headerExtras).toEqual(['A', 'B']);
    expect(p.drivingLicense).toBe('Permis B');
    expect(keysToSnakeCase<Record<string, unknown>>({ headerExtras: ['A'] }).header_extras).toBe('["A"]');
  });
});
