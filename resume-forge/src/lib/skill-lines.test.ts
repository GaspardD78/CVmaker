import { describe, expect, it } from 'bun:test';
import { buildBadgeRows, bulletItems, isSkillCategory, rowText, type BadgeBlockLike } from './skill-lines';
import { makeEntry } from './test-helpers/cv-fixtures';
import { makeCategoryEntries } from './test-helpers/skill-fixtures';

const entries = makeCategoryEntries();
const blocks = (ids: string[], overrides: Record<string, Record<string, unknown>> = {}): BadgeBlockLike[] =>
  ids.map(entryId => ({ entryId, overrideData: overrides[entryId] ?? {} }));

describe('bulletItems / isSkillCategory', () => {
  it('extrait les puces « - » et « * », ignore le reste', () => {
    expect(bulletItems('- a\n* b\ntexte\n-   c  ')).toEqual(['a', 'b', 'c']);
    expect(bulletItems('Une phrase.')).toEqual([]);
    expect(bulletItems(null)).toEqual([]);
  });

  it('une compétence à puces est une catégorie, pas une compétence isolée ni un autre type', () => {
    expect(isSkillCategory(entries[0])).toBe(true);
    expect(isSkillCategory(entries[4])).toBe(false);
    expect(isSkillCategory(makeEntry('x', 'interest', 'X', { description: '- a' }))).toBe(false);
  });
});

describe('buildBadgeRows', () => {
  it('une ligne par catégorie, dans l\'ordre des blocs, compétences isolées en dernier', () => {
    const rows = buildBadgeRows(blocks(['k5', 'k3', 'k1', 'k2', 'k4']), entries);
    expect(rows.map(rowText)).toEqual([
      'Méthodes : MITRE ATT&CK · Analyse de logs',
      'Langages : Python · SQL · Bash',
      'Outils SOC : Splunk · Elastic · Wireshark',
      'Cloud : Azure · Docker',
      'Git',
    ]);
  });

  it('la surcharge description réduit et réordonne les éléments', () => {
    const rows = buildBadgeRows(blocks(['k1'], { k1: { description: '- SQL\n- Python' } }), entries);
    expect(rows.map(rowText)).toEqual(['Langages : SQL · Python']);
  });

  it('une catégorie vidée par la surcharge disparaît', () => {
    const rows = buildBadgeRows(blocks(['k1', 'k2'], { k1: { description: '' } }), entries);
    expect(rows.map(r => r.category)).toEqual(['Outils SOC']);
  });

  it('la surcharge de titre renomme la catégorie', () => {
    const rows = buildBadgeRows(blocks(['k4'], { k4: { title: 'Cloud & conteneurs' } }), entries);
    expect(rowText(rows[0])).toBe('Cloud & conteneurs : Azure · Docker');
  });

  it('un centre d\'intérêt affiche son titre, pas sa description', () => {
    expect(buildBadgeRows(blocks(['i1']), entries)).toEqual([{ category: null, items: [{ name: 'Astronomie' }] }]);
  });

  it('langue et certification : titre + sous-titre (niveau, émetteur)', () => {
    const others = [
      makeEntry('l', 'language', 'Espagnol', { subtitle: 'B2', description: 'Séjours réguliers' }),
      makeEntry('c', 'certification', 'Certif fictive', { subtitle: 'Organisme X' }),
    ];
    const rows = buildBadgeRows(blocks(['l', 'c']), others);
    expect(rows).toEqual([{ category: null, items: [{ name: 'Espagnol', level: 'B2' }, { name: 'Certif fictive', level: 'Organisme X' }] }]);
    expect(rowText(rows[0])).toBe('Espagnol — B2 · Certif fictive — Organisme X');
  });

  it('compétence isolée avec une description sans puces : la description reste le libellé', () => {
    const e = [makeEntry('s', 'skill', 'Titre', { description: 'Libellé détaillé' })];
    expect(rowText(buildBadgeRows(blocks(['s']), e)[0])).toBe('Libellé détaillé');
  });

  it('ignore les blocs dont l\'entrée est introuvable', () => {
    expect(buildBadgeRows(blocks(['inconnue']), entries)).toEqual([]);
  });
});
