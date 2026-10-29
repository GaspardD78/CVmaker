import { describe, it, expect } from 'bun:test';
import { bulletLead, bulletTense, countableNumbers, extractNumbers, extractTechnicalTerms, guardAiCv, titleForRule, type GuardContext } from './ai-cv-guard';
import { SOC_ANGLE, makeAngleEntries } from './test-helpers/angle-fixtures';
import type { AiCvResponse } from './ai-cv-response';
import { TEST_PROFILE, makeEntries, makeEntry } from './test-helpers/cv-fixtures';
import { resolveTarget } from './cv-targets';
import { makeCategoryEntries } from './test-helpers/skill-fixtures';

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
    }), ctx({ pageBudget: 2 }));
    expect(r.data.entries.map(e => e.id)).toEqual(['x1']);
    expect(r.data.entryOrder).toEqual(['s2']);
    expect(r.data.skillGroups).toEqual([{ category: 'A', entryIds: ['s1'] }]);
    expect(codes(r)).toContain('unknown-id');
  });

  it('compétence dans plusieurs groupes : gardée dans le premier uniquement', () => {
    const r = guardAiCv(resp({ skillGroups: [{ category: 'A', entryIds: ['s1', 's2'] }, { category: 'B', entryIds: ['s2', 's3'] }] }), ctx({ pageBudget: 2 }));
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
    }), ctx({ pageBudget: 2, entries: entries.map(e => (e.id === 'x2' ? { ...e, description: null } : e)) }));
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
    expect(r.report.metrics.overflow.exceedsTarget).toBe(false);
  });

  it('cible par défaut : 1 page, même pour un profil senior (15 ans)', () => {
    const senior = [makeEntry('a', 'experience', 'RSSI', { startDate: '2011-01', isCurrent: true, description: '- Pilotage' })];
    expect(guardAiCv(resp(), ctx({ entries: senior })).report.metrics.pageBudget).toBe(1);
    expect(guardAiCv(resp(), ctx({ entries: senior, pageBudget: 2 })).report.metrics.pageBudget).toBe(2);
  });

  it('questions de l\'IA transmises', () => {
    expect(guardAiCv(resp({ warnings: ['Poste X : combien d\'alertes ?'] }), ctx()).report.aiWarnings).toHaveLength(1);
  });
});

describe('guardAiCv - cible 1 page', () => {
  const bullets = (n: number, prefix = 'Action') => Array.from({ length: n }, (_, i) => `- ${prefix} ${i}`).join('\n');
  const exp = (id: string, title: string, start: string, end: string | null, n: number) =>
    makeEntry(id, 'experience', title, { startDate: start, endDate: end, isCurrent: end === null, description: bullets(n) });
  const onePage = (data: AiCvResponse, entriesList = entries, extra: Partial<GuardContext> = {}) =>
    guardAiCv(data, ctx({ entries: entriesList, pageBudget: 1, ...extra }));
  const onePageMsgs = (r: ReturnType<typeof guardAiCv>) => r.report.warnings.filter(w => w.code === 'one-page').map(w => w.message);

  it('résumé de plus de 3 lignes (≈ 330 caractères) signalé', () => {
    const long = 'Analyste SOC. '.repeat(25);
    expect(long.length).toBeGreaterThan(330);
    // 3 lignes (≈ 300 caractères) acceptées.
    expect(onePageMsgs(onePage(resp({ summary: 'Analyste SOC. '.repeat(21) }))).some(m => m.includes('Résumé'))).toBe(false);
    expect(onePageMsgs(onePage(resp({ summary: long }))).some(m => m.includes('Résumé'))).toBe(true);
    expect(onePageMsgs(onePage(resp({ summary: 'Analyste SOC, 7 ans.' }))).some(m => m.includes('Résumé'))).toBe(false);
  });

  it('moins de 5 ans : 3 puces ; 5 à 10 ans : 2 ; plus ancienne : une ligne', () => {
    const list = [
      exp('r', 'Poste récent', '2022-01', null, 4), exp('m', 'Poste moyen', '2014-01', '2018-01', 3),
      exp('o', 'Poste ancien', '2005-01', '2008-01', 1), exp('ok', 'Poste ok', '2023-01', null, 3),
    ];
    const msgs = onePageMsgs(onePage(resp(), list));
    expect(msgs.some(m => m.includes('Poste récent') && m.includes('3 maximum'))).toBe(true);
    expect(msgs.some(m => m.includes('Poste moyen') && m.includes('2 maximum'))).toBe(true);
    expect(msgs.some(m => m.includes('Poste ancien') && m.includes('0 maximum') && m.includes('une ligne'))).toBe(true);
    expect(msgs.some(m => m.includes('Poste ok'))).toBe(false);
  });

  it('expérience ancienne couvrant un indispensable : 3 puces autorisées', () => {
    const list = [exp('o', 'Poste ancien', '2005-01', '2008-01', 3)];
    const r = onePage(resp({ analyse: analyse({ indispensables: ['Action 1'], correspondances: [{ exigence: 'Action 1', entryId: 'o' }] }) }), list);
    expect(onePageMsgs(r).some(m => m.includes('Poste ancien'))).toBe(false);
  });

  it('expérience ancienne en une ligne (sans description) : acceptée', () => {
    const old = [makeEntry('o', 'experience', 'Poste ancien', { startDate: '2005-01', endDate: '2008-01', description: null })];
    expect(codes(onePage(resp(), old))).not.toContain('empty-description');
    // Une expérience récente sans description reste signalée.
    const recent = [makeEntry('r', 'experience', 'Poste récent', { startDate: '2024-01', isCurrent: true, description: null })];
    expect(codes(onePage(resp(), recent))).toContain('empty-description');
  });

  it('expérience sans lien avec l\'annonce : à masquer', () => {
    const list = [exp('a', 'Vendeur', '2023-01', null, 2), exp('b', 'Analyste Splunk', '2021-01', '2022-12', 2)];
    const r = onePage(resp({ analyse: analyse({ indispensables: ['Splunk'], importants: [] }) }), list);
    const msgs = onePageMsgs(r);
    expect(msgs.some(m => m.includes('Vendeur') && m.includes('aucun lien'))).toBe(true);
    expect(msgs.some(m => m.includes('Analyste Splunk'))).toBe(false);
  });

  it('plus de 15 éléments de compétences (compétences isolées) : signalé ; 15 : accepté', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => makeEntry(`k${i}`, 'skill', `Skill${i}`));
    expect(onePageMsgs(onePage(resp(), many(16))).some(m => m.includes('16 éléments de compétences'))).toBe(true);
    expect(onePageMsgs(onePage(resp(), many(15))).some(m => m.includes('éléments de compétences visibles'))).toBe(false);
  });

  it('regroupement des compétences isolées conservé (1 page comme 2 pages)', () => {
    const r = onePage(resp({ skillGroups: [{ category: 'A', entryIds: ['s1', 's2'] }, { category: 'B', entryIds: ['s3', 's4'] }] }));
    expect(r.data.skillGroups).toHaveLength(2);
    expect(onePageMsgs(r).some(m => m.includes('regroupement'))).toBe(false);
    expect(guardAiCv(resp({ skillGroups: [{ category: 'A', entryIds: ['s1', 's2'] }, { category: 'B', entryIds: ['s3', 's4'] }] }), ctx({ pageBudget: 2 })).data.skillGroups).toHaveLength(2);
  });

  it('formations (> 2), certifications (> 3) et descriptions de formation signalées', () => {
    const list = [
      ...[1, 2, 3].map(i => makeEntry(`f${i}`, 'education', `Diplôme ${i}`, { endDate: `20${10 + i}` })),
      ...[1, 2, 3, 4].map(i => makeEntry(`c${i}`, 'certification', `Certif ${i}`, { endDate: `20${20 + i}` })),
      makeEntry('f9', 'education', 'Master', { description: '- Mémoire sur la détection' }),
    ];
    const msgs = onePageMsgs(onePage(resp(), list));
    expect(msgs.some(m => m.includes('4 formations'))).toBe(true);
    expect(msgs.some(m => m.includes('4 certifications'))).toBe(true);
    expect(msgs.some(m => m.includes('Master') && m.includes('une ligne'))).toBe(true);
  });

  it('centres d\'intérêt et bénévolat visibles : signalés sauf lien avec l\'annonce', () => {
    const list = [makeEntry('i1', 'interest', 'Escalade'), makeEntry('v1', 'volunteer', 'CTF étudiant')];
    const r = onePage(resp({ analyse: analyse({ indispensables: ['CTF'] }) }), list);
    const msgs = onePageMsgs(r);
    expect(msgs.some(m => m.includes('Escalade'))).toBe(true);
    expect(msgs.some(m => m.includes('CTF étudiant'))).toBe(false);
  });

  it('2 pages : aucune de ces règles n\'est appliquée', () => {
    const list = [exp('r', 'Poste récent', '2022-01', null, 5), makeEntry('i1', 'interest', 'Escalade')];
    expect(onePageMsgs(guardAiCv(resp(), ctx({ entries: list, pageBudget: 2 })))).toEqual([]);
  });
});

describe('guardAiCv - dépassement : « dépasse probablement 1 page » et éléments à retirer', () => {
  const heavy = (): ReturnType<typeof makeEntry>[] => [
    ...Array.from({ length: 5 }, (_, i) => makeEntry(`e${i}`, 'experience', `Poste ${i}`, {
      startDate: `20${10 + i}-01`, endDate: `20${11 + i}-01`,
      description: Array.from({ length: 5 }, (_, k) => `- Action ${k} sur le périmètre ${i}`).join('\n'),
    })),
    makeEntry('hobby', 'interest', 'Escalade'),
    makeEntry('vol', 'volunteer', 'Banque alimentaire', { description: '- Distribution' }),
    ...Array.from({ length: 22 }, (_, i) => makeEntry(`k${i}`, 'skill', `Skill${i}`)),
  ];

  it('avertit « Dépasse probablement 1 page » avec la liste à retirer en priorité', () => {
    const r = guardAiCv(resp(), ctx({ entries: heavy(), pageBudget: 1 }));
    const w = r.report.warnings.find(x => x.code === 'volume');
    expect(w?.message).toContain('Dépasse probablement 1 page');
    expect(w?.message).toContain('À retirer en priorité');
    expect(w?.message).toContain('Escalade');
    expect(r.report.metrics.overflow.exceedsTarget).toBe(true);
  });

  it('candidats par priorité : intérêts et bénévolat d\'abord, puis compétences en trop, puis puces', () => {
    const { removalCandidates } = guardAiCv(resp(), ctx({ entries: heavy(), pageBudget: 1 })).report.metrics.overflow;
    const labels = removalCandidates.map(c => c.label);
    expect(labels.slice(0, 2).sort()).toEqual(['Banque alimentaire', 'Escalade']);
    const firstSkill = labels.findIndex(l => l.startsWith('Skill'));
    const firstBullets = removalCandidates.findIndex(c => c.reason.startsWith('retirer'));
    if (firstSkill !== -1 && firstBullets !== -1) expect(firstSkill).toBeLessThan(firstBullets);
    expect(removalCandidates.every(c => c.savedLines > 0)).toBe(true);
  });

  it('la liste s\'arrête dès que les lignes gagnées couvrent le dépassement', () => {
    const { removalCandidates, excessLines } = guardAiCv(resp(), ctx({ entries: heavy(), pageBudget: 1 })).report.metrics.overflow;
    const total = removalCandidates.reduce((n, c) => n + c.savedLines, 0);
    expect(total).toBeGreaterThanOrEqual(excessLines);
    const withoutLast = total - removalCandidates[removalCandidates.length - 1].savedLines;
    expect(withoutLast).toBeLessThan(excessLines);
  });

  it('pas de dépassement : aucun candidat', () => {
    const o = guardAiCv(resp(), ctx()).report.metrics.overflow;
    expect(o).toEqual({ exceedsTarget: false, excessLines: 0, removalCandidates: [] });
  });

  it('2 pages : le message cite 2 pages', () => {
    const many = Array.from({ length: 30 }, (_, i) => makeEntry(`m${i}`, 'experience', `P${i}`, { startDate: '2010', endDate: '2012', description: '- a\n- b\n- c\n- d' }));
    const w = guardAiCv(resp(), ctx({ entries: many, pageBudget: 2 })).report.warnings.find(x => x.code === 'volume');
    expect(w?.message).toContain('Dépasse probablement 2 pages');
  });
});

describe('guardAiCv - éléments des catégories de compétences', () => {
  const catEntries = makeCategoryEntries();
  const catCtx = (pageBudget = 2): GuardContext => ({ entries: catEntries, profile: TEST_PROFILE, now: NOW, pageBudget });

  it('élément absent de la source : avertissement skill-item-invented et puce retirée', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'k1', visible: true, description: '- SQL\n- Rust\n- Python' }] }), catCtx());
    const w = r.report.warnings.filter(x => x.code === 'skill-item-invented');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('Rust');
    expect(r.data.entries[0].description).toBe('- SQL\n- Python');
  });

  it('sélection et ordre de l\'IA conservés, libellé exact de la source rétabli', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'k3', visible: true, description: '- analyse de LOGS\n- MITRE ATT&CK' }] }), catCtx());
    expect(r.report.warnings.some(x => x.code === 'skill-item-invented')).toBe(false);
    expect(r.data.entries[0].description).toBe('- Analyse de logs\n- MITRE ATT&CK');
  });

  it('aucun élément valide : la description de la source est conservée', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'k4', visible: true, description: '- Kubernetes' }] }), catCtx());
    expect(r.report.warnings.some(x => x.code === 'skill-item-invented')).toBe(true);
    expect(r.data.entries[0].description).toBeUndefined();
  });

  it('puces ajoutées à une compétence isolée : inventées', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'k5', visible: true, description: '- GitLab CI' }] }), catCtx());
    expect(r.report.warnings.some(x => x.code === 'skill-item-invented')).toBe(true);
  });

  it('1 page : compte les éléments, pas les entrées', () => {
    // 4 catégories (10 éléments) + 1 isolée = 11 éléments, 5 entrées : aucun dépassement.
    const ok = guardAiCv(resp(), catCtx(1)).report.warnings.filter(x => x.code === 'one-page').map(x => x.message);
    expect(ok.some(m => m.includes('éléments de compétences'))).toBe(false);
    // 16 éléments répartis dans 2 catégories : dépassement signalé.
    const big = [makeEntry('g1', 'skill', 'A', { description: Array.from({ length: 8 }, (_, i) => `- a${i}`).join('\n') }),
      makeEntry('g2', 'skill', 'B', { description: Array.from({ length: 8 }, (_, i) => `- b${i}`).join('\n') })];
    const over = guardAiCv(resp(), { entries: big, profile: TEST_PROFILE, now: NOW, pageBudget: 1 }).report.warnings.map(x => x.message);
    expect(over.some(m => m.includes('16 éléments de compétences visibles'))).toBe(true);
  });

  it('skillGroups : une catégorie n\'est jamais rangée dans un groupe', () => {
    const r = guardAiCv(resp({ skillGroups: [{ category: 'X', entryIds: ['k1', 'k5'] }] }), catCtx());
    expect(r.data.skillGroups).toEqual([{ category: 'X', entryIds: ['k5'] }]);
    expect(r.report.warnings.some(x => x.code === 'unknown-id')).toBe(false);
  });
});

describe('guardAiCv - angle', () => {
  const angleEntries = makeAngleEntries();
  const actx = (extra: Partial<GuardContext> = {}): GuardContext => ({ entries: angleEntries, profile: TEST_PROFILE, now: NOW, pageBudget: 2, angle: SOC_ANGLE, ...extra });

  it('hide: visible sans correspondance : avertissement et masquage', () => {
    const r = guardAiCv(resp({ entries: [{ id: 'x2', visible: true }] }), actx());
    expect(r.report.warnings.some(w => w.code === 'angle-hidden-entry-visible' && w.entryId === 'x2')).toBe(true);
    expect(r.data.entries.find(e => e.id === 'x2')!.visible).toBe(false);
    // Absente du JSON (donc affichée telle quelle) : masquée aussi.
    expect(r.data.entries.find(e => e.id === 'x3')!.visible).toBe(false);
  });

  it('hide: visible avec correspondance pour un indispensable : conservée', () => {
    const r = guardAiCv(resp({
      entries: [{ id: 'x2', visible: true }],
      analyse: { indispensables: ['Support'], importants: [], ecarts: [], correspondances: [{ exigence: 'Support', entryId: 'x2' }] },
    }), actx());
    expect(r.data.entries.find(e => e.id === 'x2')!.visible).toBe(true);
    expect(r.report.warnings.some(w => w.code === 'angle-hidden-entry-visible' && w.entryId === 'x2')).toBe(false);
  });

  it('entrée en tête masquée alors qu\'elle étaye un indispensable : réaffichée', () => {
    const r = guardAiCv(resp({
      entries: [{ id: 'x1', visible: false }],
      analyse: { indispensables: ['Splunk'], importants: [], ecarts: [], correspondances: [{ exigence: 'Splunk', entryId: 'x1' }] },
    }), actx());
    expect(r.data.entries.find(e => e.id === 'x1')!.visible).toBe(true);
    expect(r.report.warnings.some(w => w.code === 'angle-lead-entry-hidden')).toBe(true);
  });

  it('titre hors règle : corrigé', () => {
    const r = guardAiCv(resp({ title: 'Ingénieur détection' }), actx());
    expect(r.data.title).toBe('Analyste SOC');
    expect(r.report.warnings.some(w => w.code === 'angle-title-corrected')).toBe(true);
    const ok = guardAiCv(resp({ title: 'Analyste SOC' }), actx());
    expect(ok.report.warnings.some(w => w.code === 'angle-title-corrected')).toBe(false);
  });

  it('choix de l\'IA dans la bibliothèque : angle appliqué d\'après analyse.angle.slug', () => {
    const r = guardAiCv(resp({
      entries: [{ id: 'x2', visible: true }],
      analyse: { indispensables: [], importants: [], ecarts: [], correspondances: [], angle: { slug: 'soc' } },
    }), actx({ angle: undefined, angleChoices: [SOC_ANGLE] }));
    expect(r.report.angle?.slug).toBe('soc');
    expect(r.data.entries.find(e => e.id === 'x2')!.visible).toBe(false);
    // Slug inconnu : aucun angle.
    const none = guardAiCv(resp({ analyse: { indispensables: [], importants: [], ecarts: [], correspondances: [], angle: { slug: 'x' } } }), actx({ angle: undefined, angleChoices: [SOC_ANGLE] }));
    expect(none.report.angle).toBeUndefined();
  });
});

describe('titleForRule', () => {
  it('profile : titre du profil tel quel', () => {
    expect(titleForRule('Autre chose', 'profile', 'Analyste SOC')).toBe('Analyste SOC');
    expect(titleForRule('analyste soc', 'profile', 'Analyste SOC')).toBe('analyste soc');
  });
  it('profile+keyword : « titre - mot-clé »', () => {
    expect(titleForRule('Analyste SOC - Cloud', 'profile+keyword', 'Analyste SOC')).toBe('Analyste SOC - Cloud');
    expect(titleForRule('Ingénieur - Cloud', 'profile+keyword', 'Analyste SOC')).toBe('Analyste SOC - Cloud');
    expect(titleForRule('Ingénieur', 'profile+keyword', 'Analyste SOC')).toBe('Analyste SOC');
  });
  it('sans titre de profil : inchangé', () => {
    expect(titleForRule('Ingénieur', 'profile', null)).toBe('Ingénieur');
  });
});

describe('orientation « missions » : sobriété des chiffres et du gras', () => {
  const NOW_ = new Date(Date.UTC(2026, 5, 15));
  const base = (e: ReturnType<typeof makeEntries>) => ({ entries: e, profile: TEST_PROFILE, now: NOW_ });
  const rich = [
    makeEntry('m1', 'experience', 'Chargé de recrutement', {
      subtitle: 'ACME', startDate: '2019-01', endDate: '2022-01',
      description: '- Recruter 26 consultants en 12 mois\n- Suivre 4 agences\n- Piloter 60 % de sourcing\n- Animer 8 réunions',
    }),
  ];
  const resp_ = (extra: Partial<AiCvResponse> = {}): AiCvResponse => ({
    entries: [{ id: 'm1', visible: true }], suggestedEntries: [], ...extra,
  });

  it('compte les chiffres hors années, dates et durées', () => {
    expect(countableNumbers('Poste de 2019 à 2022, 06/2021, 3 mois, 2 ans, 24 à 48 h, 1 h 30', NOW_)).toEqual([]);
    expect(countableNumbers('26 recrutements en 12 mois pour 4 agences', NOW_)).toEqual(['26', '4']);
    expect(countableNumbers('7 années d\'expérience, 10 ans', NOW_)).toEqual([]);
    expect(countableNumbers('1949 postes', NOW_)).toEqual(['1949']);
    expect(countableNumbers('2031 postes', NOW_)).toEqual(['2031']);
  });

  it('too-many-numbers : plus de 3 chiffres distincts, avec les puces concernées', () => {
    const r = guardAiCv(resp_(), { ...base(rich), focus: 'missions' });
    const w = r.report.warnings.find(x => x.code === 'too-many-numbers');
    expect(w).toBeDefined();
    expect(w!.message).toContain('4 chiffres distincts');
    expect(w!.message).toContain('Recruter 26 consultants');
    expect(w!.message).toContain('Animer 8 réunions');
    expect(r.report.errors).toEqual([]);
  });

  it('pas de too-many-numbers à 3 chiffres ou moins', () => {
    const few = [makeEntry('m1', 'experience', 'Chargé de recrutement', { description: '- Recruter 26 consultants\n- Suivre 4 agences\n- Animer 8 réunions\n- Piloter les entretiens (3 mois)' })];
    const r = guardAiCv(resp_(), { ...base(few), focus: 'missions' });
    expect(codes(r)).not.toContain('too-many-numbers');
  });

  it('retire le gras et le signale', () => {
    const e = [makeEntry('m1', 'experience', 'Chargé de recrutement', { description: '- Piloter le recrutement' })];
    const r = guardAiCv(
      resp_({
        entries: [{ id: 'm1', visible: true, description: '- Piloter le **recrutement** de profils **IAM**' }],
        summary: 'Chargé de **recrutement**',
      }),
      { ...base(e), focus: 'missions' },
    );
    expect(r.data.entries[0].description).toBe('- Piloter le recrutement de profils IAM');
    expect(r.data.summary).toBe('Chargé de recrutement');
    const w = r.report.warnings.find(x => x.code === 'bold-in-missions-mode');
    expect(w?.message).toContain('3 passage(s)');
  });

  it('summary-has-numbers : un chiffre hors années d\'expérience dans l\'accroche', () => {
    const e = [makeEntry('m1', 'experience', 'Chargé de recrutement', { description: '- Recruter 26 consultants' })];
    const withNumber = guardAiCv(resp_({ summary: 'Chargé de recrutement, 26 recrutements par an' }), { ...base(e), focus: 'missions' });
    expect(codes(withNumber)).toContain('summary-has-numbers');
    const onlyYears = guardAiCv(resp_({ summary: 'Chargé de recrutement depuis 2015, 11 ans d\'expérience' }), { ...base(e), focus: 'missions' });
    expect(codes(onlyYears)).not.toContain('summary-has-numbers');
  });

  it('l\'anti-invention des chiffres reste bloquant dans les deux modes', () => {
    for (const focus of ['missions', 'resultats'] as const) {
      const r = guardAiCv(resp_({ entries: [{ id: 'm1', visible: true, description: '- Recruter 999 consultants' }] }), { ...base(rich), focus });
      expect(r.report.errors.map(x => x.code)).toContain('invented-number');
    }
  });

  it('resultats ou absent : aucun de ces avertissements, gras conservé', () => {
    const e = [makeEntry('m1', 'experience', 'Chargé de recrutement', { description: '- Recruter 26 consultants\n- Suivre 4 agences\n- Piloter 60 % de sourcing\n- Animer 8 réunions' })];
    for (const focus of ['resultats', undefined] as const) {
      const r = guardAiCv(
        resp_({ entries: [{ id: 'm1', visible: true, description: '- Recruter **26** consultants\n- Suivre 4 agences\n- Piloter 60 % de sourcing\n- Animer 8 réunions' }], summary: 'Recruteur, 26 recrutements' }),
        { ...base(e), focus },
      );
      const c = codes(r);
      expect(c).not.toContain('too-many-numbers');
      expect(c).not.toContain('bold-in-missions-mode');
      expect(c).not.toContain('summary-has-numbers');
      expect(r.data.entries[0].description).toContain('**26**');
      expect(r.report.focus).toBe(focus);
    }
  });
});

describe('forme du premier mot des puces (réglage cv_verb_tense)', () => {
  const NOW2 = new Date(Date.UTC(2026, 5, 15));
  const exp2 = (description: string) => [makeEntry('m1', 'experience', 'Chargé de recrutement', { subtitle: 'ACME', startDate: '2019-01', endDate: '2022-01', description })];
  const run = (description: string, verbTense?: 'infinitif' | 'passe-present' | 'nominal', language = 'fr') =>
    guardAiCv(
      { entries: [{ id: 'm1', visible: true }], suggestedEntries: [], analyse: { langueAnnonce: language, indispensables: [], importants: [], correspondances: [], ecarts: [] } },
      { entries: exp2(description), profile: TEST_PROFILE, now: NOW2, ...(verbTense ? { verbTense } : {}) },
    );
  const tenseWarnings = (r: ReturnType<typeof run>) => r.report.warnings.filter(w => w.code === 'tense');

  it('bulletLead : infinitif, participe, nom d\'action, présent', () => {
    expect(bulletLead('Recruter des profils', 'fr')).toBe('infinitive');
    expect(bulletLead('Conclure des accords', 'fr')).toBe('infinitive');
    expect(bulletLead('Piloté le recrutement', 'fr')).toBe('past');
    expect(bulletLead('Recrutement de profils', 'fr')).toBe('noun');
    expect(bulletLead('Pilotage des entretiens', 'fr')).toBe('noun');
    expect(bulletLead('Pilote les entretiens', 'fr')).toBe('present');
    expect(bulletLead('Led a team', 'en')).toBe('past');
    expect(bulletLead('Leading a team', 'en')).toBe('noun');
    expect(bulletLead('Recruitment of engineers', 'en')).toBe('noun');
    expect(bulletLead('Lead a team', 'en')).toBe('unknown');
  });

  it('infinitif : signale participes passés et noms d\'action en tête de puce', () => {
    const past = run('- Recruté 12 profils\n- Piloté les entretiens\n- Suivre les candidats', 'infinitif');
    expect(tenseWarnings(past)).toHaveLength(1);
    expect(tenseWarnings(past)[0].message).toContain("ne commencent pas par un verbe à l'infinitif");
    const noun = run('- Recrutement de profils\n- Gestion des entretiens\n- Piloter le suivi', 'infinitif');
    expect(tenseWarnings(noun)).toHaveLength(1);
  });

  it('infinitif : aucun avertissement quand les puces sont à l\'infinitif', () => {
    expect(tenseWarnings(run('- Recruter des profils\n- Piloter les entretiens\n- Conclure les accords', 'infinitif'))).toEqual([]);
  });

  it('infinitif est le comportement du réglage, absent ou passe-present : cohérence passé / présent', () => {
    // Poste terminé avec verbes au présent : avertissement historique.
    const present = run('- Recrute des profils\n- Pilote les entretiens', undefined);
    expect(tenseWarnings(present)[0].message).toContain('présent sur un poste terminé');
    // Infinitifs sur un poste terminé : rien en passe-present.
    expect(tenseWarnings(run('- Recruter des profils\n- Piloter les entretiens', 'passe-present'))).toEqual([]);
  });

  it('nominal : signale les verbes', () => {
    const verbs = run('- Recruter des profils\n- Piloté les entretiens\n- Recrutement de profils', 'nominal');
    expect(tenseWarnings(verbs)[0].message).toContain("ne commencent pas par un nom d'action");
    expect(tenseWarnings(run('- Recrutement de profils\n- Pilotage des entretiens', 'nominal'))).toEqual([]);
  });

  it('anglais : gérondif et passé signalés en infinitif', () => {
    expect(tenseWarnings(run('- Led a team\n- Built a process\n- Lead the hiring', 'infinitif', 'en'))).toHaveLength(1);
    expect(tenseWarnings(run('- Lead a team\n- Build a process', 'infinitif', 'en'))).toEqual([]);
  });

  it('une seule puce : pas de contrôle (seuil de deux)', () => {
    expect(tenseWarnings(run('- Recruté 12 profils', 'infinitif'))).toEqual([]);
  });
});

describe('accroche : ne répète pas le titre du CV', () => {
  const entries2 = [makeEntry('m1', 'experience', 'Chargé de recrutement', { subtitle: 'ACME', startDate: '2019-01', endDate: '2022-01', description: '- Recruter' })];
  const run = (title: string, summary: string) => guardAiCv(
    { entries: [{ id: 'm1', visible: true }], suggestedEntries: [], title, summary },
    { entries: entries2, profile: { ...TEST_PROFILE, title: 'Chargé de recrutement' }, now: new Date(Date.UTC(2026, 5, 15)) },
  );
  it('signale une accroche qui commence par le titre', () => {
    const r = run('Chargé de recrutement', 'Chargé de recrutement depuis 2015, spécialisé dans les profils techniques.');
    expect(r.report.warnings.map(w => w.code)).toContain('summary-starts-with-title');
  });
  it('titre avec séparateur : seule la première partie compte', () => {
    expect(run('Chargé de recrutement · Évaluation et conseil', 'Chargé de recrutement depuis 2015.').report.warnings.map(w => w.code)).toContain('summary-starts-with-title');
    expect(run('Chargé de recrutement - ESN', 'chargé de recrutement depuis 2015.').report.warnings.map(w => w.code)).toContain('summary-starts-with-title');
  });
  it('une accroche qui ne commence pas par le titre : rien', () => {
    expect(run('Chargé de recrutement', 'Onze ans d\'expérience en recrutement de profils techniques.').report.warnings.map(w => w.code)).not.toContain('summary-starts-with-title');
    expect(run('Chargé de recrutement', 'Recruteur depuis 2015.').report.warnings.map(w => w.code)).not.toContain('summary-starts-with-title');
  });
});

describe('titre libre (choix manuel) : prioritaire sur l\'angle', () => {
  const free = resolveTarget({ titleRule: 'free' });
  const base2 = (titleRuleTarget?: ReturnType<typeof resolveTarget>) => guardAiCv(
    { entries: [{ id: 'x1', visible: true }], suggestedEntries: [], title: 'Chargé de recrutement · Évaluation et conseil aux encadrants', analyse: { langueAnnonce: 'fr', indispensables: ['SOC'], importants: [], correspondances: [], ecarts: [] } },
    { entries, profile: TEST_PROFILE, now: NOW, angle: SOC_ANGLE, ...(titleRuleTarget ? { target: titleRuleTarget } : {}) },
  );
  it('sans choix manuel, la règle de l\'angle corrige le titre', () => {
    const r = base2();
    expect(r.report.warnings.map(w => w.code)).toContain('angle-title-corrected');
    expect(r.data.title).toBe(TEST_PROFILE.title ?? undefined);
  });
  it('titre libre : conservé tel quel, ni correction d\'angle ni unsupported-title', () => {
    const r = base2(free);
    expect(r.data.title).toBe('Chargé de recrutement · Évaluation et conseil aux encadrants');
    const codes2 = r.report.warnings.map(w => w.code);
    expect(codes2).not.toContain('angle-title-corrected');
    expect(codes2).not.toContain('unsupported-title');
  });
});
