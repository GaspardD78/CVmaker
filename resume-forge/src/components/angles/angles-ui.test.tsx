import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NewAngleButton, AffinityImportSummary } from '../settings/CvAnglesSettings';
import { AffinityMatrix } from './AffinityMatrix';
import { rowToAngle, fieldsToRow, DEFAULT_ANGLES, planAffinityImport } from '@/lib/cv-angles';
import { makeAngleEntries } from '@/lib/test-helpers/angle-fixtures';

const angle = rowToAngle({ id: 'a1', profile_id: 'p1', ...fieldsToRow({ ...DEFAULT_ANGLES[0], slug: 'soc', label: 'Analyste SOC' }) });

describe('interface des angles', () => {
  it('« Nouvel angle » désactivé à 4 angles, actif en dessous', () => {
    expect(renderToStaticMarkup(<NewAngleButton count={4} onClick={() => {}} />)).toContain('disabled=""');
    expect(renderToStaticMarkup(<NewAngleButton count={4} onClick={() => {}} />)).toContain('4 au maximum');
    expect(renderToStaticMarkup(<NewAngleButton count={3} onClick={() => {}} />)).not.toContain('disabled=""');
  });

  it('matrice : état de chaque cellule d\'après les tags, titre propre', () => {
    const html = renderToStaticMarkup(<AffinityMatrix entries={makeAngleEntries()} angles={[angle]} onChange={() => {}} />);
    expect(html).toContain('Analyste SOC : Mettre en tête');
    expect(html).toContain('Analyste SOC : Masquer par défaut');
    expect(html).toContain('Analyste SOC : Neutre'); // k2, sans tag
    expect(html).toContain('>Analyste SOC<span class="text-gray-400"> - Acme</span>'); // « (Acme) » retiré sous l'employeur Acme
  });

  it('récapitulatif d\'import avant écriture', () => {
    const plan = planAffinityImport([
      { entryType: 'skill', title: 'Langages', tags: ['angle:soc'] },
      { entryType: 'skill', title: 'Absente', tags: ['angle:soc'] },
    ], makeAngleEntries());
    const html = renderToStaticMarkup(<AffinityImportSummary plan={plan} onConfirm={() => {}} onCancel={() => {}} />);
    expect(html).toContain('1 entrée(s) du fichier retrouvée(s)');
    expect(html).toContain('1 tag(s) ajouté(s) sur 1 entrée(s)');
    expect(html).toContain('1 entrée(s) du fichier sans correspondance');
  });
});
