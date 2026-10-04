import { describe, it, expect } from 'bun:test';
import {
  buildAnalysisStep, buildClarify, buildContext, buildCvPrompt, buildExtraContext, buildMasterProfile,
  buildObjective, buildOutputSchema, buildRole, buildRules, CV_WRITING_RULES, JSON_RULES,
  generateFullCVMatchPrompt, type CvPromptInput,
} from './cv-prompt';
import { SYSTEM_RULES, TEXT_RULES } from './prompt-templates';
import { TEST_PROFILE, makeEntries, makeEntry } from './test-helpers/cv-fixtures';
import type { MasterEntry } from '@/types/profile';

const NOW = new Date(Date.UTC(2026, 5, 15));

const JOB_FR = 'Analyste SOC N2 (H/F). Vous maîtrisez Splunk, Python et la réponse à incident. Anglais courant exigé. CDI Lyon.';
const JOB_EN = 'SOC Analyst (L2). You master Splunk, Python and incident response. Fluent English required. Remote, EU.';

function junior(): MasterEntry[] {
  return [
    makeEntry('j1', 'experience', 'Stagiaire SOC', { subtitle: 'ACME', startDate: '2025-03', endDate: '2025-08', description: '- Tri des alertes Splunk\n- Rédaction de 5 fiches de procédure' }),
    makeEntry('j2', 'education', 'Master Cybersécurité', { subtitle: 'Université de Lyon', startDate: '2023', endDate: '2025' }),
    makeEntry('j3', 'skill', 'Splunk'), makeEntry('j4', 'skill', 'Python'),
    makeEntry('j5', 'certification', 'CompTIA Security+', { subtitle: 'CompTIA', startDate: '2025' }),
    makeEntry('j6', 'language', 'Français', { subtitle: 'Langue maternelle' }),
  ];
}

function confirmed(): MasterEntry[] {
  return makeEntries();
}

function senior(): MasterEntry[] {
  return [
    makeEntry('s-x1', 'experience', 'RSSI', { subtitle: 'Initech', startDate: '2019-01', isCurrent: true, description: '- Pilotage d\'une équipe de 8 personnes\n- Mise en place d\'un SOC externalisé' }),
    makeEntry('s-x2', 'experience', 'Responsable sécurité', { subtitle: 'Globex', startDate: '2013-02', endDate: '2018-12', description: '- Certification ISO 27001 du périmètre production' }),
    makeEntry('s-x3', 'experience', 'Ingénieur systèmes', { subtitle: 'Hooli', startDate: '2010-09', endDate: '2013-01' }),
    makeEntry('s-f1', 'education', 'Diplôme d\'ingénieur', { subtitle: 'INSA', startDate: '2005', endDate: '2010' }),
    makeEntry('s-c1', 'certification', 'CISSP', { subtitle: 'ISC2', startDate: '2016' }),
    makeEntry('s-l1', 'language', 'Français', { subtitle: 'Langue maternelle' }),
    makeEntry('s-l2', 'language', 'Anglais', { subtitle: 'Courant' }),
  ];
}

function input(entries: MasterEntry[], job: string, extra: Partial<CvPromptInput> = {}): CvPromptInput {
  return { profile: TEST_PROFILE, entries, jobOfferText: job, options: { now: NOW }, ...extra };
}

describe('blocs du prompt CV v2', () => {
  it('chaque bloc est autonome et non vide', () => {
    expect(buildRole()).toContain('recruteur senior');
    expect(buildObjective()).toContain('JSON');
    expect(buildAnalysisStep()).toContain('langue_annonce');
    expect(buildOutputSchema()).toContain('"schemaVersion": 2');
    expect(buildClarify(false)).toBe('');
    expect(buildClarify(true)).toContain('affinage par questions');
  });

  it('contexte : entreprise, pages, années calculées et annonce', () => {
    const ctx = buildContext(input(senior(), JOB_FR, { targetCompany: 'Umbrella' }));
    expect(ctx).toContain('Entreprise cible : Umbrella');
    expect(ctx).toContain('Pages cibles : 1');
    expect(ctx).toContain('15 ans');
    expect(ctx).toContain(JOB_FR);
  });

  it('cible par défaut : 1 page, quelle que soit l\'ancienneté ; option 2 pages respectée', () => {
    expect(buildContext(input(junior(), JOB_FR))).toContain('Pages cibles : 1');
    expect(buildContext(input(senior(), JOB_FR))).toContain('Pages cibles : 1');
    expect(buildContext(input(junior(), JOB_FR, { options: { now: NOW, pageBudget: 2 } }))).toContain('Pages cibles : 2');
  });

  it('1 page : impose résumé 2 lignes, 3 puces, masquage, 12 à 15 compétences sans groupes, formations, intérêts', () => {
    const rules = buildRules(input(senior(), JOB_FR));
    expect(rules).toContain('UNE PAGE');
    expect(rules).toContain('RÉSUMÉ : 2 lignes maximum');
    expect(rules).toContain('3 puces maximum chacune');
    expect(rules).toContain('1 ligne (titre, employeur, dates');
    expect(rules).toContain('Une expérience sans lien avec l\'annonce : `visible: false`');
    expect(rules).toContain('12 à 15 maximum');
    expect(rules).toContain('omets "skillGroups"');
    expect(rules).toContain('FORMATIONS et CERTIFICATIONS');
    expect(rules).toContain('CENTRES D\'INTÉRÊT et BÉNÉVOLAT');
    expect(rules).not.toContain('Utilise "skillGroups" seulement');
    expect(rules).not.toContain('soit environ');
  });

  it('2 pages : règles de volume et de regroupement habituelles, sans bloc UNE PAGE', () => {
    const rules = buildRules(input(senior(), JOB_FR, { options: { now: NOW, pageBudget: 2 } }));
    expect(rules).not.toContain('UNE PAGE');
    expect(rules).toContain('2 pages maximum, soit environ 36 puces');
    expect(rules).toContain('au moins 8 compétences visibles');
    expect(rules).toContain('3 à 5 puces');
  });

  it('profil maître : IDs, dates, puces sources sur leurs propres lignes', () => {
    const block = buildMasterProfile(confirmed(), TEST_PROFILE);
    expect(block).toContain('ID: "x1"');
    expect(block).toContain('Dates: "2021-01 - Présent"');
    expect(block).toContain('    - Supervision de 12 sources de logs avec Splunk');
    expect(block).toContain('Résumé actuel du profil : Analyste cybersécurité.');
  });

  it('contexte additionnel vide : suggestedEntries doit être vide', () => {
    expect(buildExtraContext('  ')).toContain('"suggestedEntries" DOIT être un tableau vide');
    expect(buildExtraContext('Certif AWS obtenue en 2024')).toContain('Certif AWS obtenue en 2024');
  });

  it('séparation TEXT_RULES / JSON_RULES : le prompt CV n\'injecte plus SYSTEM_RULES', () => {
    const prompt = buildCvPrompt(input(confirmed(), JOB_EN));
    expect(SYSTEM_RULES).toBe(TEXT_RULES);
    expect(prompt).not.toContain(SYSTEM_RULES);
    expect(prompt).toContain(JSON_RULES);
    expect(prompt).toContain(CV_WRITING_RULES);
    expect(JSON_RULES).toContain('UNIQUEMENT avec l\'objet JSON');
  });

  it('exprime les règles clés du brief', () => {
    const rules = buildRules(input(confirmed(), JOB_EN));
    expect(rules).toContain('120 caractères maximum par puce');
    expect(rules).toContain('analyse.ecarts');
    expect(rules).toContain('question de quantification');
    expect(rules).toContain('Jamais un poste que le profil n\'a pas occupé');
    expect(rules).toContain('Ne relève jamais un niveau');
  });

  it('ordre des blocs : analyse avant les règles, schéma en dernier, clarify avant le schéma', () => {
    const prompt = buildCvPrompt(input(confirmed(), JOB_EN, { clarify: true }));
    const at = (s: string) => prompt.indexOf(s);
    expect(at('## Contexte')).toBeLessThan(at('## Profil maître'));
    expect(at('## Étape 0')).toBeLessThan(at('## Règles'));
    expect(at('affinage par questions')).toBeLessThan(at('## Format de sortie OBLIGATOIRE'));
    expect(prompt.trimEnd().endsWith('}')).toBe(true);
  });

  it('la signature historique est conservée (callers inchangés)', () => {
    const prompt = generateFullCVMatchPrompt(TEST_PROFILE, confirmed(), JOB_FR, 'ACME', 'contexte', true);
    expect(prompt).toContain('Entreprise cible : ACME');
    expect(prompt).toContain('contexte');
  });
});

describe('snapshots du prompt (junior, confirmé, senior 15 ans)', () => {
  const cases: Array<[string, MasterEntry[], string]> = [
    ['junior x annonce FR', junior(), JOB_FR],
    ['confirmé x annonce EN', confirmed(), JOB_EN],
    ['senior 15 ans x annonce FR', senior(), JOB_FR],
  ];
  it('senior 15 ans x annonce FR, cible 2 pages', () => {
    expect(buildCvPrompt(input(senior(), JOB_FR, { options: { now: NOW, pageBudget: 2 } }))).toMatchSnapshot();
  });
  for (const [name, entries, job] of cases) {
    it(name, () => {
      expect(buildCvPrompt(input(entries, job))).toMatchSnapshot();
    });
  }
});

describe('buildMasterProfile - titre propre (lib/entry-display.ts)', () => {
  it('affiche le titre sans l\'employeur en double et garde l\'ID', () => {
    const e = makeEntry('xp-acme', 'experience', 'Analyste SOC (Acme)', { subtitle: 'Acme', startDate: '2020-01', endDate: '2022-01' });
    const out = buildMasterProfile([e]);
    expect(out).toContain('- ID: "xp-acme" | Titre: "Analyste SOC" | Entreprise: "Acme"');
    expect(out).not.toContain('Analyste SOC (Acme)');
  });
});
