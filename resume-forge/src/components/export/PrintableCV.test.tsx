import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrintableCV } from './PrintableCV';
import { getTemplate, templates } from '../../templates';
import type { CVBlock, CVDocument } from '../../types/cv';
import { TEST_PROFILE, makeBlocks, makeEntries, makeEntry } from '../../lib/test-helpers/cv-fixtures';
import { makeCategoryBlocks, makeCategoryEntries } from '../../lib/test-helpers/skill-fixtures';

const entries = makeEntries();

const cv: CVDocument = {
  id: 'cv1', profileId: 'p1', name: 'Test', templateId: 'ats-classic', targetJob: 'Analyste SOC', targetCompany: null,
  customSummary: 'Résumé', settings: {}, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0,
  createdAt: '', updatedAt: '',
};

function render(blocks: CVBlock[], templateId = 'ats-classic', settings: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <PrintableCV cv={{ ...cv, settings }} profile={TEST_PROFILE} blocks={blocks} entries={entries} template={getTemplate(templateId)} />,
  );
}

const hide = (blocks: CVBlock[], ids: string[]): CVBlock[] =>
  blocks.map(b => (b.entryId && ids.includes(b.entryId) ? { ...b, isVisible: false } : b));

describe('PrintableCV - B : aucune section vide', () => {
  it('masque l\'en-tête dont toutes les entrées sont masquées', () => {
    const html = render(hide(makeBlocks(entries), ['f1']));
    expect(html).not.toContain('Formations');
    expect(html).toContain('Expériences Professionnelles');
  });

  it('masque l\'en-tête sans aucune entrée (suivi directement d\'un autre en-tête)', () => {
    const blocks = makeBlocks(entries).filter(b => b.entryId !== 'f1');
    const html = render(blocks);
    expect(html).not.toContain('Formations');
  });

  it('masque un en-tête final sans bloc après lui', () => {
    const blocks = makeBlocks(entries).filter(b => b.entryId !== 'l1' && b.entryId !== 'l2');
    expect(render(blocks)).not.toContain('Langues');
  });

  it('masque un sous-en-tête sans entrée visible, mais garde la section', () => {
    const blocks = makeBlocks(entries);
    const sub: CVBlock = {
      id: 'sub1', cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: 'Catégorie vide',
      customContent: null, sortOrder: 4.5, isVisible: true, overrideData: { level: 'sub' }, createdAt: '',
    };
    const html = render([...blocks, sub].map(b => (b.id === 'sub1' ? { ...b, sortOrder: blocks.find(x => x.id === 'b-s10')!.sortOrder + 0.5 } : b)));
    expect(html).not.toContain('Catégorie vide');
    expect(html).toContain('Compétences');
  });

  it('masque aussi les sections vides dans la bande latérale', () => {
    const html = render(hide(makeBlocks(entries), ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']), 'sidebar-tech');
    expect(html).not.toContain('Compétences');
  });

  it('un texte libre non vide suffit à justifier un en-tête', () => {
    const blocks: CVBlock[] = [
      { id: 'h', cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: 'À propos', customContent: null, sortOrder: 0, isVisible: true, overrideData: {}, createdAt: '' },
      { id: 't', cvId: 'cv1', entryId: null, blockType: 'custom_text', sectionName: null, customContent: 'Bonjour', sortOrder: 1, isVisible: true, overrideData: {}, createdAt: '' },
    ];
    expect(render(blocks)).toContain('À propos');
  });
});

describe('PrintableCV - sous-en-têtes de compétences', () => {
  function withSubs(): CVBlock[] {
    const base = makeBlocks(entries);
    const skillBlocks = base.filter(b => b.entryId?.startsWith('s'));
    const first = skillBlocks[0].sortOrder;
    const sub = (id: string, name: string, order: number): CVBlock => ({
      id, cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: name, customContent: null,
      sortOrder: order, isVisible: true, overrideData: { level: 'sub', displayFormat: 'badges' }, createdAt: '',
    });
    return [...base, sub('sa', 'Outils SOC', first - 0.5), sub('sb', 'Langages', skillBlocks[5].sortOrder - 0.5)];
  }

  it('rend les catégories comme sous-titres, pas comme titres de section', () => {
    const html = render(withSubs());
    expect(html).toContain('Outils SOC');
    expect(html).toContain('Langages');
    // Le titre de section reste unique (« Compétences »).
    expect(html.match(/Compétences/g)).toHaveLength(1);
    // Les catégories ne sont pas des <h3> de section.
    expect(html).not.toMatch(/<h3[^>]*>Outils SOC/);
  });

  it('range les sous-en-têtes dans la bande latérale sous « Compétences »', () => {
    const html = render(withSubs(), 'sidebar-tech');
    expect(html).toContain('Outils SOC');
    expect(html.match(/Compétences/g)).toHaveLength(1);
  });
});

describe('PrintableCV - C : langue du CV', () => {
  it('rend « Present » quand le CV est en anglais', () => {
    const html = render(makeBlocks(entries), 'ats-classic', { cvLanguage: 'en' });
    expect(html).toContain('Present');
    expect(html).not.toContain('Présent');
    expect(html).toContain('January 2021');
  });

  it('reste en français par défaut', () => {
    expect(render(makeBlocks(entries))).toContain('Présent');
  });
});

describe('PrintableCV - les 11 templates (états de référence, ARCHITECTURE.md §4.1)', () => {
  const templateIds = Object.keys(templates);

  function structured(): CVBlock[] {
    const base = hide(makeBlocks(entries), ['f1']); // « Formations » entièrement masquée
    const first = base.find(b => b.entryId === 's1')!.sortOrder;
    const mid = base.find(b => b.entryId === 's6')!.sortOrder;
    const sub = (id: string, name: string, order: number): CVBlock => ({
      id, cvId: 'cv1', entryId: null, blockType: 'section_header', sectionName: name, customContent: null,
      sortOrder: order, isVisible: true, overrideData: { level: 'sub' }, createdAt: '',
    });
    return [...base, sub('sa', 'Outils SOC', first - 0.5), sub('sb', 'Systèmes', mid - 0.5), sub('sc', 'Catégorie vide', 99999)];
  }

  it('couvre bien les 11 templates', () => {
    expect(templateIds).toHaveLength(11);
  });

  for (const id of templateIds) {
    it(`${id} : section vide masquée, sous-en-têtes rendus, « Compétences » unique`, () => {
      const html = render(structured(), id);
      expect(html).not.toContain('Formations');
      expect(html).not.toContain('Catégorie vide');
      expect(html).toContain('Outils SOC');
      expect(html).toContain('Systèmes');
      expect(html.match(/Compétences/g)).toHaveLength(1);
      expect(html).toContain('Expériences Professionnelles');
    });
  }
});

describe('PrintableCV - catégories de compétences (lib/skill-lines.ts)', () => {
  const catEntries = makeCategoryEntries();
  const renderCat = (blocks: CVBlock[], templateId = 'ats-classic') => renderToStaticMarkup(
    <PrintableCV cv={cv} profile={TEST_PROFILE} blocks={blocks} entries={catEntries} template={getTemplate(templateId)} />,
  );
  const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

  it('une ligne par catégorie, libellé en gras, dans l\'ordre des blocs', () => {
    const html = renderCat(makeCategoryBlocks());
    expect(html).toMatch(/<strong[^>]*>Langages<\/strong> : Python · SQL · Bash/);
    const t = text(html);
    const order = ['Langages', 'Outils SOC', 'Méthodes', 'Cloud', 'Git'].map(l => t.indexOf(l));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('catégorie vidée par surcharge absente ; centre d\'intérêt avec son titre', () => {
    const t = text(renderCat(makeCategoryBlocks('badges', { k3: { description: '' } })));
    expect(t).not.toContain('Méthodes');
    expect(t).toContain('Astronomie');
    expect(t).not.toContain('Observation du ciel');
  });

  it('bande latérale : libellé puis éléments en liste', () => {
    const html = renderCat(makeCategoryBlocks('columns2'), 'sidebar-tech');
    expect(html).toMatch(/<strong[^>]*>Cloud<\/strong>/);
    expect(html).toMatch(/<li[^>]*>Azure<\/li>/);
  });
});

describe('PrintableCV - titre sans employeur en double (lib/entry-display.ts)', () => {
  it('retire « (Acme) » sous l\'employeur Acme, garde une surcharge de titre', () => {
    const own = [makeEntry('x', 'experience', 'Analyste SOC (Acme)', { subtitle: 'Acme' })];
    const block: CVBlock = { id: 'b', cvId: 'cv1', entryId: 'x', blockType: 'entry_ref', sectionName: null, customContent: null, sortOrder: 0, isVisible: true, overrideData: {}, createdAt: '' };
    const html = (b: CVBlock) => renderToStaticMarkup(<PrintableCV cv={cv} profile={TEST_PROFILE} blocks={[b]} entries={own} template={getTemplate('ats-classic')} />);
    expect(html(block)).toMatch(/cv-title[^>]*>Analyste SOC<\/span>/);
    expect(html({ ...block, overrideData: { title: 'Lead (Acme)' } })).toMatch(/cv-title[^>]*>Lead \(Acme\)<\/span>/);
  });
});
