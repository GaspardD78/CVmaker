import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetSheetsEditor } from './TargetSheetsEditor';
import { DEFAULT_TARGET_SHEETS, type SheetOverrides } from '@/lib/cv-targets';

const html = (overrides: SheetOverrides = {}) => renderToStaticMarkup(<TargetSheetsEditor overrides={overrides} onChange={() => {}} />);
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('TargetSheetsEditor', () => {
  it('valeurs par défaut en grisé (placeholders), champs vides tant que rien n\'est modifié', () => {
    const out = decode(html());
    expect(out).toContain(`placeholder="${DEFAULT_TARGET_SHEETS.esn.attentes.join('\n')}"`);
    expect(out).toContain('placeholder="direct, orienté projets, délais et profils techniques"');
    expect(out).toContain('Par défaut (Résultats chiffrés)');
    expect(out).toContain('text-gray-400 italic');
    expect(out).not.toContain('(personnalisée)');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Revenir aux valeurs par défaut/);
  });

  it('une fiche modifiée : seule la valeur modifiée est affichée, les autres restent en grisé', () => {
    const out = decode(html({ esn: { eviter: ['mon consigne'], ats: false } }));
    expect(out).toContain('(personnalisée)');
    expect(out).toContain('>mon consigne</textarea>');
    expect(out).toContain(`placeholder="${DEFAULT_TARGET_SHEETS.esn.attentes.join('\n')}"`);
    expect(out).toMatch(/<option value="non"[^>]*selected/);
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Revenir aux valeurs par défaut/);
  });

  it('sept types de structure proposés', () => {
    expect(html().match(/<option value="(esn|cabinet|grand-groupe|eti-pme|startup|public|associatif)"/g)).toHaveLength(7);
  });
});
