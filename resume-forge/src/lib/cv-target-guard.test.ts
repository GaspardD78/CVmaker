import { describe, expect, it } from 'bun:test';
import { guardAiCv, type GuardContext } from './ai-cv-guard';
import type { AiCvResponse } from './ai-cv-response';
import { equivalenceFor, readerRole } from './cv-target-guard';
import { DEFAULT_TARGET_SHEETS, resolveTarget, type TargetChoice } from './cv-targets';
import { TEST_PROFILE, makeEntry } from './test-helpers/cv-fixtures';

const NOW = new Date(Date.UTC(2026, 5, 15));
const exp = (id: string, title: string, description: string) =>
  makeEntry(id, 'experience', title, { subtitle: 'ACME', startDate: '2020-01', endDate: '2024-01', description });
const base = (entries: ReturnType<typeof exp>[], choice: TargetChoice | undefined, extra: Partial<GuardContext> = {}): GuardContext => ({
  entries, profile: { ...TEST_PROFILE, title: 'Chargé de recrutement' }, now: NOW, ...(choice ? { target: resolveTarget(choice) } : {}), ...extra,
});
const resp = (extra: Partial<AiCvResponse> = {}): AiCvResponse => ({ entries: [], suggestedEntries: [], ...extra });
const codes = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.map(w => w.code);

describe('target-forbidden-term', () => {
  const entries = [exp('m1', 'Chargé de recrutement', '- Animer le sourcing de profils techniques\n- Suivre le pipeline des candidatures')];

  it('signale les termes de la fiche dans une puce, avec l\'équivalence', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(entries, { type: 'public' }));
    const issues = r.report.warnings.filter(w => w.code === 'target-forbidden-term');
    expect(issues).toHaveLength(2);
    expect(issues.find(i => i.message.includes('« sourcing »'))?.message).toContain('Équivalence de la fiche : « recherche de candidats »');
    expect(issues.find(i => i.message.includes('« pipeline »'))?.message).toContain('« vivier de candidats »');
    expect(issues[0].entryId).toBe('m1');
    expect(r.report.errors).toEqual([]);
  });

  it('titre, accroche, override : tous contrôlés ; un terme sans équivalence est signalé seul', () => {
    const r = guardAiCv(
      resp({ title: 'Chargé de recrutement', summary: 'Un esprit business et orienté KPI.', entries: [{ id: 'm1', visible: true, description: '- Piloter les recrutements' }] }),
      base(entries, { type: 'public' }),
    );
    const msgs = r.report.warnings.filter(w => w.code === 'target-forbidden-term').map(w => w.message);
    expect(msgs.some(m => m.includes('« business »') && m.includes('accroche'))).toBe(true);
    expect(msgs.some(m => m.includes('« KPI »') && m.includes('Équivalence'))).toBe(false);
  });

  it('un autre type de structure, ou aucun ciblage : aucun avertissement', () => {
    for (const choice of [{ type: 'esn' as const }, { type: 'grand-groupe' as const }, undefined]) {
      expect(codes(guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(entries, choice)))).not.toContain('target-forbidden-term');
    }
  });

  it('mots entiers seulement', () => {
    const e = [exp('m1', 'Chargé de recrutement', '- Gérer le résourcing documentaire')];
    expect(codes(guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(e, { type: 'public' })))).not.toContain('target-forbidden-term');
  });

  it('associatif : business, deal, KPI, chasse', () => {
    const e = [exp('m1', 'Chargé de recrutement', '- Conclure un deal avec les partenaires')];
    const r = guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(e, { type: 'associatif' }));
    expect(r.report.warnings.find(w => w.code === 'target-forbidden-term')?.message).toContain('« deal »');
  });

  it('les entrées masquées ne comptent pas', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'm1', visible: false }] }), base(entries, { type: 'public' }));
    expect(codes(r)).not.toContain('target-forbidden-term');
  });
});

describe('équivalences de titre', () => {
  const entries = [exp('t1', 'Talent Acquisition Partner', '- Recruter des profils')];
  const ctx = (choice: TargetChoice) => base(entries, choice, { profile: { ...TEST_PROFILE, title: 'Talent Acquisition Partner' } });

  it('titleOverride dans la table de la fiche : équivalence appliquée', () => {
    const r = guardAiCv(resp({ entries: [{ id: 't1', visible: true, titleOverride: 'Chargé de recrutement' }] }), ctx({ type: 'public' }));
    const w = r.report.warnings.find(x => x.code === 'target-equivalence-applied');
    expect(w?.message).toContain('« Talent Acquisition Partner » → « Chargé de recrutement »');
    expect(w?.entryId).toBe('t1');
    expect(codes(r)).not.toContain('unsupported-title');
  });

  it('titleOverride hors de la table : unsupported-title', () => {
    const r = guardAiCv(resp({ entries: [{ id: 't1', visible: true, titleOverride: 'Directeur du recrutement' }] }), ctx({ type: 'public' }));
    const w = r.report.warnings.find(x => x.code === 'unsupported-title');
    expect(w?.message).toContain('hors des équivalences de la fiche');
    expect(w?.entryId).toBe('t1');
  });

  it('titre du CV traduit via la table : accepté, sans unsupported-title', () => {
    const r = guardAiCv(resp({ title: 'Chargé de recrutement' }), ctx({ type: 'public' }));
    expect(codes(r)).toContain('target-equivalence-applied');
    expect(codes(r)).not.toContain('unsupported-title');
  });

  it('titre du CV hors table : l\'avertissement existant reste', () => {
    const r = guardAiCv(resp({ title: 'Directeur général' }), ctx({ type: 'public' }));
    expect(codes(r)).toContain('unsupported-title');
    expect(codes(r)).not.toContain('target-equivalence-applied');
  });

  it('CV non français : les traductions fidèles ne sont pas contrôlées par la table', () => {
    const r = guardAiCv(
      resp({ analyse: { langueAnnonce: 'en', indispensables: [], importants: [], correspondances: [], ecarts: [] }, entries: [{ id: 't1', visible: true, titleOverride: 'Talent Acquisition Partner (EN)' }] }),
      ctx({ type: 'public' }),
    );
    expect(codes(r)).not.toContain('unsupported-title');
  });

  it('fiche sans équivalence (esn) ou sans ciblage : rien', () => {
    for (const choice of [{ type: 'esn' as const }, undefined]) {
      const r = guardAiCv(resp({ entries: [{ id: 't1', visible: true, titleOverride: 'Autre' }] }), ctx(choice as TargetChoice));
      expect(codes(r)).not.toContain('target-equivalence-applied');
    }
  });
});

describe('target-photo', () => {
  const entries = [exp('m1', 'Chargé de recrutement', '- Piloter les recrutements')];
  const withPhoto = (choice: TargetChoice | undefined) =>
    guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(entries, choice, { profile: { ...TEST_PROFILE, title: 'Chargé de recrutement', photoPath: 'data:image/png;base64,AAAA' } }));
  it('public + photo : avertissement', () => {
    expect(codes(withPhoto({ type: 'public' }))).toContain('target-photo');
  });
  it('pas de photo, ou photo indifférente : rien', () => {
    expect(codes(withPhoto({ type: 'grand-groupe' }))).not.toContain('target-photo');
    expect(codes(withPhoto({ type: 'esn' }))).not.toContain('target-photo');
    expect(codes(withPhoto(undefined))).not.toContain('target-photo');
    expect(codes(guardAiCv(resp({ entries: [{ id: 'm1', visible: true }] }), base(entries, { type: 'public' })))).not.toContain('target-photo');
  });
});

describe('target-reader-mentioned', () => {
  const entries = [exp('m1', 'Chargé de recrutement', '- Piloter les recrutements')];
  const choice: TargetChoice = {
    type: 'esn', firstReader: 'direction', readerName: 'Camille Fictif',
    readerNote: 'directeur des opérations en infogérance : dimensionnement, délais, engagements tenus',
    brief: { referrer: 'Alex Exemple' },
  };

  it('fonction, nom du lecteur et personne qui transmet le CV', () => {
    const r = guardAiCv(
      resp({ summary: 'Recruteur proche d\'un directeur des opérations en infogérance, recommandé par Alex Exemple, à l\'écoute de Camille Fictif.', entries: [{ id: 'm1', visible: true }] }),
      base(entries, choice),
    );
    const msgs = r.report.warnings.filter(w => w.code === 'target-reader-mentioned').map(w => w.message);
    expect(msgs).toHaveLength(3);
    expect(msgs.join('\n')).toContain('Fonction du premier lecteur');
    expect(msgs.join('\n')).toContain('Nom du premier lecteur');
    expect(msgs.join('\n')).toContain('Personne qui transmet le CV');
    expect(r.report.errors).toEqual([]);
  });

  it('une expression propre au profil du candidat n\'est pas imputée au ciblage', () => {
    const own = [exp('m1', 'Directeur des opérations en infogérance', '- Piloter les opérations')];
    const r = guardAiCv(resp({ title: 'Directeur des opérations en infogérance', entries: [{ id: 'm1', visible: true }] }), base(own, choice));
    expect(r.report.warnings.filter(w => w.code === 'target-reader-mentioned').map(w => w.message).join('')).not.toContain('Fonction du premier lecteur');
  });

  it('rien de cité : aucun avertissement', () => {
    const r = guardAiCv(resp({ summary: 'Chargé de recrutement.', entries: [{ id: 'm1', visible: true }] }), base(entries, choice));
    expect(codes(r)).not.toContain('target-reader-mentioned');
  });

  it('readerRole : fonction avant les deux-points', () => {
    expect(readerRole('directeur des opérations : dimensionnement')).toBe('directeur des opérations');
    expect(readerRole('dimensionnement')).toBeUndefined();
    expect(readerRole(undefined)).toBeUndefined();
  });
});

describe('l\'anti-invention est identique quel que soit le ciblage', () => {
  const entries = [exp('m1', 'Chargé de recrutement', '- Recruter 26 consultants')];
  it('un nombre inventé reste bloquant avec ou sans ciblage', () => {
    for (const choice of [undefined, { type: 'public' as const }, { type: 'esn' as const, intent: 'spontanee' as const }]) {
      const r = guardAiCv(resp({ entries: [{ id: 'm1', visible: true, description: '- Recruter 999 consultants' }] }), base(entries, choice));
      expect(r.report.errors.map(e => e.code)).toContain('invented-number');
    }
  });
  it('sans ciblage, aucun code de ciblage', () => {
    const r = guardAiCv(resp({ title: 'Chargé de recrutement', entries: [{ id: 'm1', visible: true }] }), base(entries, undefined));
    expect(codes(r).filter(c => c.startsWith('target-'))).toEqual([]);
  });
});

describe('équivalences : recherche', () => {
  it('équivalence d\'un terme évité', () => {
    const eqs = DEFAULT_TARGET_SHEETS.public.vocabulaire.equivalences;
    expect(equivalenceFor('sourcing', eqs)?.to).toBe('recherche de candidats');
    expect(equivalenceFor('talent acquisition', eqs)?.to).toBe('Responsable recrutement');
    expect(equivalenceFor('deal', eqs)).toBeUndefined();
  });
});
