import { describe, it, expect } from 'bun:test';
import { normalizeDescription, normalizeTypography } from './cv-typography';

const NB = ' ';

describe('normalizeTypography', () => {
  it('remplace le tiret cadratin dans toutes les langues', () => {
    expect(normalizeTypography('Splunk — SIEM', 'fr')).toBe('Splunk - SIEM');
    expect(normalizeTypography('Splunk—SIEM', 'en')).toBe('Splunk - SIEM');
  });

  it('français : espace insécable avant : ; ? !', () => {
    expect(normalizeTypography('Résultat: 30 % ; vraiment ?', 'fr')).toBe(`Résultat${NB}: 30 %${NB}; vraiment${NB}?`);
    expect(normalizeTypography('Bravo!', 'fr')).toBe(`Bravo${NB}!`);
  });

  it('français : ne touche ni aux URL ni aux horaires', () => {
    const text = 'Voir https://exemple.fr à 10:30';
    expect(normalizeTypography(text, 'fr')).toBe(text);
  });

  it('français : guillemets droits remplacés par « »', () => {
    expect(normalizeTypography('méthode "Purple Team" appliquée', 'fr')).toBe(`méthode «${NB}Purple Team${NB}» appliquée`);
  });

  it('anglais : aucune règle d\'espacement', () => {
    expect(normalizeTypography('Result: 30%; really?', 'en')).toBe('Result: 30%; really?');
  });

  it('est idempotent', () => {
    const once = normalizeTypography('Un test: "ok" ; fini ?', 'fr');
    expect(normalizeTypography(once, 'fr')).toBe(once);
  });
});

describe('normalizeDescription', () => {
  it('ramène les marqueurs étrangers à « - » et retire le point final des puces', () => {
    const out = normalizeDescription('• Supervision des alertes.\n– Rédaction de procédures.\n* Pilotage de projets', 'fr');
    expect(out).toBe('- Supervision des alertes\n- Rédaction de procédures\n- Pilotage de projets');
  });

  it('garde « etc. » et les points de suspension', () => {
    expect(normalizeDescription('- Outils : Splunk, Elastic, etc.\n- Et plus...', 'fr')).toBe(`- Outils${NB}: Splunk, Elastic, etc.\n- Et plus...`);
  });

  it('un paragraphe sans puce garde sa ponctuation', () => {
    expect(normalizeDescription('Une phrase complète.', 'en')).toBe('Une phrase complète.');
  });

  it('supprime les lignes vides', () => {
    expect(normalizeDescription('- a\n\n- b\n', 'en')).toBe('- a\n- b');
  });

  it('est idempotent', () => {
    const once = normalizeDescription('• a: b.\n• c ?', 'fr');
    expect(normalizeDescription(once, 'fr')).toBe(once);
  });
});
