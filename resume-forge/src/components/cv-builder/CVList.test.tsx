import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Le projet n'a pas de DOM de test (ni happy-dom ni jsdom) : on ne peut pas simuler un clic.
// Ce test vérifie le câblage dans le source : le bouton « Importer » doit appeler navigate('/import').
const source = readFileSync(join(import.meta.dir, 'CVList.tsx'), 'utf8');

describe('CVList : bouton Importer', () => {
  it('récupère navigate via useNavigate dans CVList', () => {
    expect(source).toContain('const navigate = useNavigate();');
  });

  it('le clic sur « Importer » appelle navigate(\'/import\')', () => {
    expect(source).toMatch(
      /<button className="rf-btn-secondary" onClick=\{\(\) => navigate\('\/import'\)\}>\s*<svg[\s\S]*?<\/svg>\s*Importer/,
    );
  });
});
