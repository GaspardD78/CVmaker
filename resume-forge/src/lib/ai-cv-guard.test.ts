import { describe, it, expect } from 'bun:test';
import { bulletTense, extractNumbers, extractTechnicalTerms, guardAiCv, type GuardContext } from './ai-cv-guard';
import type { AiCvResponse } from './ai-cv-response';
import { TEST_PROFILE, makeEntries, makeEntry } from './test-helpers/cv-fixtures';

const NOW = new Date(Date.UTC(2026, 5, 15));
const entries = makeEntries();
const ctx = (extra: Partial<GuardContext> = {}): GuardContext => ({ entries, profile: TEST_PROFILE, now: NOW, ...extra });
const resp = (extra: Partial<AiCvResponse> = {}): AiCvResponse => ({ entries: [], suggestedEntries: [], ...extra });
const analyse = (extra: Partial<NonNullable<AiCvResponse['analyse']>> = {}): NonNullable<AiCvResponse['analyse']> =>
  ({ langueAnnonce: 'fr', indispensables: [], importants: [], correspondances: [], ecarts: [], ...extra });
const codes = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.map(w => w.code);

describe('extraction', () => {
  it('nombres canoniques', () => {
    expect(extractNumbers('Réduction de 30 %, 3 000 postes, 1,5 M€ en 2021')).toEqual(['30', '3000', '1.5', '2021']);
  });

  it('termes techniques : sigles, CamelCase, ponctuation', () => {
    expect(extractTechnicalTerms('Déploiement de SIEM avec PowerShell, Node.js et C++ pour le CV')).toEqual(['siem', 'powershell', 'node.js', 'c++']);
    expect(extractTechnicalTerms('Déploiement de Kubernetes chez Globex en Mai', { properNouns: true })).toEqual(['kubernetes', 'globex']);
  });

  it('temps du verbe d\'ouverture (FR / EN)', () => {
    expect(bulletTense('Supervisé 12 sources', 'fr')).toBe('past');
    expect(bulletTense('Supervise 12 sources', 'fr')).toBe('present');
    expect(bulletTense('Superviser les alertes', 'fr')).toBe('unknown');
    expect(bulletTense('Led a team of 8', 'en')).toBe('past');
    expect(bulletTense('Manages incidents', 'en')).toBe('present');
  });
});

describe('guardAiCv - anti-invention', () => {
  it('chiffre inventé dans une puce : erreur bloquante', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x1', visible: true, description: '- Supervision de 45 sources avec Splunk' }] }), ctx());
    expect(r.report.errors).toHaveLength(1);
    expect(r.report.errors[0]).toMatchObject({ code: 'invented-number', entryId: 'x1' });
    expect(r.report.errors[0].message).toContain('45');
  });

  it('chiffre présent dans la source (puce reformulée) : aucune erreur', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x1', visible: true, description: '- Supervision de 12 sources de logs\n- Gain de 30 % sur le traitement' }] }), ctx());
    expect(r.report.errors).toHaveLength(0);
  });

  it('chiffre présent seulement dans le contexte additionnel : accepté', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x1', visible: true, description: '- Pilotage de 7 analystes' }] }), ctx({ extraContext: 'J\'ai encadré 7 analystes' }));
    expect(r.report.errors).toHaveLength(0);
  });

  it('chiffre présent seulement dans l\'annonce : refusé (jamais revendiqué)', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x1', visible: true, description: '- 10 ans d\'expérience en SOC' }] }), ctx());
    expect(r.report.errors).toHaveLength(1);
  });

  it('résumé : les années d\'expérience calculées sont autorisées, pas les autres', () => {
    // 2018-09 -> 2020-12 puis 2021-01 -> 2026-06 = 7 ans calculés
    expect(guardAiCv(resp({ summary: 'Analyste SOC avec 7 ans d\'expérience' }), ctx()).report.errors).toHaveLength(0);
    expect(guardAiCv(resp({ summary: 'Analyste SOC avec 15 ans d\'expérience' }), ctx()).report.errors).toHaveLength(1);
  });

  it('niveau de langue relevé (C1 absent de la source) : détecté', () => {
    const base = [makeEntry('l9', 'language', 'Anglais', { subtitle: 'Courant' })];
    const r = guardAiCv(resp({ entries: [{ id: 'l9', visible: true, subtitleOverride: 'Fluent - C1' }] }), ctx({ entries: base }));
    expect(r.report.errors).toHaveLength(1);
  });

  it('terme technique absent de la source : avertissement', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x1', visible: true, description: '- Déploiement de Kubernetes et du SIEM Splunk' }] }), ctx());
    const w = r.report.warnings.find(x => x.code === 'unsourced-term');
    expect(w?.message).toContain('kubernetes');
    expect(w?.message).toContain('siem');
    expect(w?.message).not.toContain('splunk');
  });

  it('traduction : les mots capitalisés ne sont pas signalés (seuls sigles et CamelCase le sont)', () => {
    const r = guardAiCv(resp({
      analyse: analyse({ langueAnnonce: 'en' }),
      entries: [{ id: 'x1', visible: true, description: '- Monitored 12 log sources with Splunk and PowerShell' }],
    }), ctx());
    const w = r.report.warnings.find(x => x.code === 'unsourced-term');
    expect(w?.message).toContain('powershell');
    expect(w?.message).not.toContain('monitored');
  });

  it('suggestions : rejetées sans contexte, gardées si étayées', () => {
    const suggestion = { entryType: 'certification' as const, title: 'AWS Security Specialty' };
    const without = guardAiCv(resp({ suggestedEntries: [suggestion] }), ctx());
    expect(without.data.suggestedEntries).toHaveLength(0);
    expect(codes(without)).toContain('suggestion-rejected');
    const withCtx = guardAiCv(resp({ suggestedEntries: [suggestion] }), ctx({ extraContext: 'J\'ai passé la certification AWS Security Specialty en 2024.' }));
    expect(withCtx.data.suggestedEntries).toHaveLength(1);
  });

  it('titre qui ne correspond à aucun poste tenu : avertissement ; titre mixte accepté', () => {
    expect(codes(guardAiCv(resp({ title: 'Directeur de la cybersécurité' }), ctx()))).toContain('unsupported-title');
    expect(codes(guardAiCv(resp({ title: 'Analyste SOC - Threat Hunting' }), ctx()))).not.toContain('unsupported-title');
  });
});

describe('guardAiCv - nettoyage structurel', () => {
  it('IDs inexistants retirés de entries, entryOrder et skillGroups, avec avertissement', () => {
    const r = guardAiCv(resp({
      entries: [{ id: 'x1', visible: true }, { id: 'zzz', visible: true }],
      entryOrder: ['zzz', 's2'],
      skillGroups: [{ category: 'A', entryIds: ['s1', 'nope', 'x1'] }],
    }), ctx());
    expect(r.data.entries.map(e => e.id)).toEqual(['x1']);
    expect(r.data.entryOrder).toEqual(['s2']);
    expect(r.data.skillGroups).toEqual([{ category: 'A', entryIds: ['s1'] }]);
    expect(codes(r)).toContain('unknown-id');
  });

  it('compétence dans plusieurs groupes : gardée dans le premier uniquement', () => {
    const r = guardAiCv(resp({ skillGroups: [{ category: 'A', entryIds: ['s1', 's2'] }, { category: 'B', entryIds: ['s2', 's3'] }] }), ctx());
    expect(r.data.skillGroups).toEqual([{ category: 'A', entryIds: ['s1', 's2'] }, { category: 'B', entryIds: ['s3'] }]);
    expect(codes(r)).toContain('skill-in-several-groups');
  });

  it('doublons de compétences visibles', () => {
    const dup = [...entries, makeEntry('s99', 'skill', 'splunk')];
    expect(codes(guardAiCv(resp(), ctx({ entries: dup })))).toContain('duplicate-skill');
  });
});

describe('guardAiCv - rédaction', () => {
  it('puce trop longue, trop de puces, description vide', () => {
    const long = '- ' + 'Analyse '.repeat(20);
    const r = guardAiCv(resp({
      entries: [
        { id: 'x1', visible: true, description: `${long}\n- a\n- b\n- c\n- d\n- e` },
        { id: 'x2', visible: true, description: '' },
      ],
    }), ctx({ entries: entries.map(e => (e.id === 'x2' ? { ...e, description: null } : e)) }));
    expect(codes(r)).toEqual(expect.arrayContaining(['long-bullet', 'too-many-bullets', 'empty-description']));
  });

  it('formulations interdites, tâche générique, pronom', () => {
    const r = guardAiCv(resp({
      summary: 'Analyste passionné, en effet très dynamique',
      entries: [{ id: 'x1', visible: true, description: '- Responsable de la supervision\n- J\'ai géré 12 sources de logs' }],
    }), ctx());
    const found = codes(r);
    expect(found).toContain('forbidden-phrase');
    expect(found).toContain('generic-task');
    expect(found).toContain('pronoun');
  });

  it('corrige le tiret cadratin et les puces « • » dans les données nettoyées', () => {
    const r = guardAiCv(resp({
      title: 'Analyste SOC — Cyber',
      entries: [{ id: 'x1', visible: true, description: '• Supervision de 12 sources de logs.\n• Réduction de 30 %.' }],
    }), ctx());
    expect(r.data.title).toBe('Analyste SOC - Cyber');
    expect(r.data.entries[0].description).toBe('- Supervision de 12 sources de logs\n- Réduction de 30 %');
  });

  it('cohérence des temps : présent sur un poste terminé', () => {
    const r = guardAiCv(resp({
      entries: [{ id: 'x2', visible: true, description: '- Gère le support de niveau 2 pour 200 utilisateurs\n- Anime la formation de 200 utilisateurs' }],
    }), ctx());
    expect(codes(r)).toContain('tense');
  });

  it('datesOverride hétérogènes', () => {
    const r = guardAiCv(resp({
      entries: [
        { id: 'x1', visible: true, datesOverride: 'Jan 2021 - Present' },
        { id: 'x2', visible: true, datesOverride: '2018 / 2020' },
      ],
    }), ctx());
    expect(codes(r)).toContain('dates-format');
  });
});

describe('guardAiCv - métriques', () => {
  it('couverture des mots-clés : forme exacte, sigle ou forme longue, manquants listés', () => {
    const r = guardAiCv(resp({
      analyse: analyse({ indispensables: ['Splunk', 'SIEM (Security Information and Event Management)', 'Kubernetes', 'Python'], ecarts: ['Kubernetes'] }),
      summary: 'Analyste SOC, SIEM et réponse à incident',
      entries: [],
    }), ctx());
    const c = r.report.metrics.keywordCoverage;
    expect(c).toMatchObject({ total: 4, found: 3, pct: 75, missing: ['Kubernetes'] });
    expect(r.report.metrics.ecarts).toEqual(['Kubernetes']);
  });

  it('pas d\'analyse : couverture non calculée', () => {
    expect(guardAiCv(resp(), ctx()).report.metrics.keywordCoverage.pct).toBeNull();
  });

  it('une entrée masquée ne compte pas dans la couverture', () => {
    const r = guardAiCv(resp({
      analyse: analyse({ indispensables: ['Wireshark'] }),
      entries: [{ id: 's3', visible: false }],
    }), ctx());
    expect(r.report.metrics.keywordCoverage.found).toBe(0);
  });

  it('volume : dépassement du budget de pages signalé', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeEntry(`m${i}`, 'experience', `Poste ${i}`, { startDate: '2010', endDate: '2012', description: Array.from({ length: 5 }, (_, k) => `- Action ${k} sur le périmètre ${i}`).join('\n') }));
    const r = guardAiCv(resp(), ctx({ entries: many, pageBudget: 1 }));
    expect(codes(r)).toContain('volume');
    expect(r.report.metrics.visibleBullets).toBe(60);
  });

  it('volume raisonnable : pas d\'avertissement', () => {
    const r = guardAiCv(resp(), ctx());
    expect(codes(r)).not.toContain('volume');
    expect(r.report.metrics.pageBudget).toBe(1);
  });

  it('questions de l\'IA transmises', () => {
    expect(guardAiCv(resp({ warnings: ['Poste X : combien d\'alertes ?'] }), ctx()).report.aiWarnings).toHaveLength(1);
  });
});
