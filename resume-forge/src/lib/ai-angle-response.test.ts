import { describe, expect, it } from 'bun:test';
import { buildAnglePrompt, parseAnglePropositions } from './ai-angle-response';
import { TEST_PROFILE } from './test-helpers/cv-fixtures';
import { SOC_ANGLE, makeAngleEntries } from './test-helpers/angle-fixtures';

const entries = makeAngleEntries();
const ctx = { entries, librarySlugs: ['soc'] };
const JOB = 'Chargé de développement RH, secteur public (H/F). Formation des managers, évaluation, conduite de projets RH.';

const prop = (extra: Record<string, unknown> = {}) => ({
  slug: 'soc', label: 'Détection', pourquoi: 'Couvre Splunk.', titleRule: 'profile',
  summaryStructure: '{intitulé} depuis {année}', leadEntryIds: ['x1', 'k1'], hideEntryIds: ['i1'],
  skillCategoryOrder: ['Outils SOC'], sacrifie: 'Le support.', ecarts: ['ITIL'], ...extra,
});
const response = (propositions: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({
  schemaVersion: 1,
  analyse: { langue_annonce: 'fr', indispensables: ['Splunk'], importants: [], correspondances: [{ exigence: 'Splunk', entryId: 'x1' }], ecarts: [] },
  propositions,
  recommandation: { index: 0, raison: 'Plus proche des indispensables.' },
  ...extra,
});

describe('parseAnglePropositions', () => {
  it('réponse valide : propositions, analyse, recommandation', () => {
    const r = parseAnglePropositions(response([prop(), prop({ slug: null, label: 'Langages', leadEntryIds: ['k2', 'x1'], hideEntryIds: [] })]), ctx);
    expect(r.propositions).toHaveLength(2);
    expect(r.propositions[0]).toMatchObject({ slug: 'soc', label: 'Détection', leadEntryIds: ['x1', 'k1'], hideEntryIds: ['i1'], skillCategoryOrder: ['Outils SOC'], ecarts: ['ITIL'] });
    expect(r.propositions[1].slug).toBeNull();
    expect(r.analyse?.indispensables).toEqual(['Splunk']);
    expect(r.recommandation).toEqual({ index: 0, raison: 'Plus proche des indispensables.' });
    expect(r.warnings).toEqual([]);
  });

  it('ID inconnu : retiré avec avertissement', () => {
    const r = parseAnglePropositions(response([prop({ leadEntryIds: ['x1', 'k1', 'zz'] }), prop({ label: 'B' })]), ctx);
    expect(r.propositions[0].leadEntryIds).toEqual(['x1', 'k1']);
    expect(r.warnings.some(w => w.includes('zz'))).toBe(true);
  });

  it('4 propositions : réponse rejetée', () => {
    expect(() => parseAnglePropositions(response([prop(), prop(), prop(), prop()]), ctx)).toThrow('4 propositions');
  });

  it('entrées en tête et masquées qui se recoupent : gardées en tête', () => {
    const r = parseAnglePropositions(response([prop({ hideEntryIds: ['k1', 'i1'] }), prop({ label: 'B' })]), ctx);
    expect(r.propositions[0].hideEntryIds).toEqual(['i1']);
    expect(r.warnings.some(w => w.includes('à la fois en tête et masquée'))).toBe(true);
  });

  it('entrée masquée qui étaye un indispensable : retirée des masquées', () => {
    const r = parseAnglePropositions(response([prop({ leadEntryIds: ['k1', 'k2'], hideEntryIds: ['x1'] }), prop({ label: 'B' })]), ctx);
    expect(r.propositions[0].hideEntryIds).toEqual([]);
  });

  it('moins de 2 entrées en tête valides : proposition rejetée, recommandation réindexée', () => {
    const r = parseAnglePropositions(response(
      [prop({ label: 'Faible', leadEntryIds: ['x1', 'zz'] }), prop({ label: 'B' }), prop({ label: 'C' })],
      { recommandation: { index: 2, raison: 'C' } },
    ), ctx);
    expect(r.propositions.map(p => p.label)).toEqual(['B', 'C']);
    expect(r.recommandation).toEqual({ index: 1, raison: 'C' });
    expect(r.warnings.some(w => w.includes('« Faible » rejetée'))).toBe(true);
  });

  it('texte avant le JSON et bloc de code tolérés', () => {
    const raw = 'Voici mes propositions :\n```json\n' + response([prop(), prop({ label: 'B' })]) + '\n```\nBonne chance.';
    expect(parseAnglePropositions(raw, ctx).propositions).toHaveLength(2);
  });

  it('catégorie inexistante ignorée, slug inconnu = angle nouveau', () => {
    const r = parseAnglePropositions(response([prop({ slug: 'inconnu', skillCategoryOrder: ['Langages', 'Nulle part'] }), prop({ label: 'B' })]), ctx);
    expect(r.propositions[0].slug).toBeNull();
    expect(r.propositions[0].skillCategoryOrder).toEqual(['Langages']);
  });

  it('aucune proposition valide ou JSON absent : erreur', () => {
    expect(() => parseAnglePropositions(response([prop({ leadEntryIds: [] })]), ctx)).toThrow('Aucune proposition valide');
    expect(() => parseAnglePropositions('pas de JSON', ctx)).toThrow('JSON invalide');
  });
});

describe('buildAnglePrompt', () => {
  const prompt = buildAnglePrompt({
    profile: TEST_PROFILE, entries, jobOfferText: JOB, library: [SOC_ANGLE], personalRules: 'Règle fictive : aucun volume.',
  });

  it('profil maître avec IDs et tags d\'angle, bibliothèque, règles personnelles, annonce', () => {
    expect(prompt).toContain('- ID: "x1" | Titre: "Analyste SOC" | Entreprise: "Acme" | Dates: "2021-01 - Présent" | Tags: angle:soc');
    expect(prompt).not.toContain('UX/UI'); // étiquettes hors angles non transmises
    expect(prompt).toContain('### Angle "soc" : Analyste SOC');
    expect(prompt).toContain('Règle fictive : aucun volume.');
    expect(prompt).toContain('secteur public');
    expect(prompt).toContain('"alertes_cap"');
    expect(prompt).toContain('2 à 3 propositions au maximum');
    expect(prompt).toContain('Aucune entrée qui étaye un indispensable ne figure dans "hideEntryIds"');
  });

  it('snapshot', () => {
    expect(prompt).toMatchSnapshot();
  });
});
