import { describe, it, expect } from 'bun:test';
import {
  decideLanguageSection, defaultSectionLabel, languageCodeOfTitle, normalizeLanguageCode, presentLabel,
  readCvLanguage, translateLanguageLabel,
} from './cv-language';

describe('codes de langue', () => {
  it('normalise codes, régions et noms', () => {
    expect(normalizeLanguageCode('EN')).toBe('en');
    expect(normalizeLanguageCode('en-US')).toBe('en');
    expect(normalizeLanguageCode('Anglais')).toBe('en');
    expect(normalizeLanguageCode('Français')).toBe('fr');
    expect(normalizeLanguageCode('klingon')).toBeUndefined();
    expect(normalizeLanguageCode(42)).toBeUndefined();
  });

  it('langue d\'un titre d\'entrée', () => {
    expect(languageCodeOfTitle('Anglais (courant)')).toBe('en');
    expect(languageCodeOfTitle('German')).toBe('de');
    expect(languageCodeOfTitle('Esperanto')).toBeUndefined();
  });

  it('readCvLanguage : défaut fr, valeur inattendue ignorée', () => {
    expect(readCvLanguage({})).toBe('fr');
    expect(readCvLanguage({ cvLanguage: 'en' })).toBe('en');
    expect(readCvLanguage({ cvLanguage: 'zz' })).toBe('fr');
    expect(readCvLanguage(null)).toBe('fr');
  });
});

describe('traduction fr <-> en', () => {
  it('traduit noms de langues et niveaux, garde les codes CECRL', () => {
    expect(translateLanguageLabel('Anglais', 'en')).toBe('English');
    expect(translateLanguageLabel('Courant - C1', 'en')).toBe('Fluent - C1');
    expect(translateLanguageLabel('Langue maternelle', 'en')).toBe('Native');
    expect(translateLanguageLabel('English', 'fr')).toBe('Anglais');
    expect(translateLanguageLabel('Native', 'fr')).toBe('Langue maternelle');
  });

  it('rien à traduire : undefined ; langue cible non gérée : undefined', () => {
    expect(translateLanguageLabel('C1', 'en')).toBeUndefined();
    expect(translateLanguageLabel('Anglais', 'de')).toBeUndefined();
  });

  it('libellés de sections anglais standard, mots « présent »', () => {
    expect(defaultSectionLabel('Compétences', 'en')).toBe('Skills');
    expect(defaultSectionLabel('competences', 'en')).toBe('Skills');
    expect(defaultSectionLabel('Compétences', 'de')).toBeUndefined();
    expect(presentLabel('fr')).toBe('Présent');
    expect(presentLabel('en')).toBe('Present');
    expect(presentLabel('de')).toBe('Heute');
    expect(presentLabel('xx')).toBe('Present');
  });
});

describe('decideLanguageSection', () => {
  const fr = { id: 'l1', title: 'Français', level: 'Langue maternelle' };
  const en = { id: 'l2', title: 'Anglais', level: 'Courant - C1' };

  it('(b) une autre langue avec niveau : visible, langue du CV en premier', () => {
    expect(decideLanguageSection([en, fr], 'fr', [])).toEqual({ show: true, forceVisibleIds: [], frontId: 'l1' });
  });

  it('seulement la langue du CV : masquée', () => {
    expect(decideLanguageSection([fr], 'fr', []).show).toBe(false);
  });

  it('autre langue sans niveau : masquée', () => {
    expect(decideLanguageSection([fr, { ...en, level: null }], 'fr', []).show).toBe(false);
  });

  it('(a) exigée par l\'annonce : visible et forcée, même sans niveau', () => {
    const d = decideLanguageSection([fr, { ...en, level: null }], 'fr', ['Anglais courant exigé']);
    expect(d.show).toBe(true);
    expect(d.forceVisibleIds).toEqual(['l2']);
  });

  it('(a) exigence générique (« bilingue », « bilingual »)', () => {
    expect(decideLanguageSection([fr], 'fr', ['Profil bilingue']).show).toBe(true);
    expect(decideLanguageSection([fr], 'en', ['Bilingual candidate']).show).toBe(true);
  });

  it('annonce en anglais : « Anglais » (langue du CV) passe en premier', () => {
    expect(decideLanguageSection([fr, en], 'en', []).frontId).toBe('l2');
  });

  it('une langue masquée par l\'IA ne déclenche pas la règle (b)', () => {
    expect(decideLanguageSection([fr, { ...en, visible: false }], 'fr', []).show).toBe(false);
  });
});
