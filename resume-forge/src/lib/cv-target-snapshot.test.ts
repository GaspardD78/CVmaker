import { describe, expect, it } from 'bun:test';
import { parseAiCvResponse } from './ai-cv-response';
import { applyAiCvToBlocks } from './apply-ai-cv';
import { buildCvPrompt, buildOutputSchema } from './cv-prompt';
import { buildTargetSnapshot, readTargetSnapshot, reconcileAiTarget } from './cv-target-snapshot';
import { cibleAnalysisLine, cibleAxesToAsk } from './cv-target-prompt';
import { DEFAULT_TARGET_SHEETS, resolveTarget } from './cv-targets';
import { TEST_PROFILE, makeBlocks, makeEntries, makeFakeStore } from './test-helpers/cv-fixtures';

const NOW = new Date(Date.UTC(2026, 5, 15));
const JOB = 'Chargé de recrutement (H/F). Vous pilotez le recrutement de profils techniques.';
const promptFor = (choice: Parameters<typeof resolveTarget>[0], detected?: Parameters<typeof resolveTarget>[2], job = JOB) =>
  buildCvPrompt({ profile: TEST_PROFILE, entries: makeEntries(), jobOfferText: job, options: { now: NOW, pageBudget: 1, target: resolveTarget(choice, {}, detected) } });

describe('lecture de analyse.cible', () => {
  const parse = (cible: unknown) => parseAiCvResponse(JSON.stringify({ analyse: { indispensables: ['x'], cible }, entries: [] })).analyse?.cible;

  it('lit type, intention, premier lecteur et raison', () => {
    expect(parse({ type: 'public', intention: 'annonce', premierLecteur: 'rh', raison: 'Collectivité' }))
      .toEqual({ type: 'public', intent: 'annonce', firstReader: 'rh', raison: 'Collectivité' });
  });
  it('tolère la casse, les variantes de clés et ignore les valeurs inconnues', () => {
    expect(parse({ type: 'Grand_Groupe', intention: 'Mobilité interne', premier_lecteur: 'Opérationnel' })).toEqual({ type: 'grand-groupe', intent: 'mobilite-interne', firstReader: 'operationnel' });
    expect(parse({ type: 'GRAND GROUPE', intent: 'chasseur', firstReader: 'direction' })).toEqual({ type: 'grand-groupe', intent: 'chasseur', firstReader: 'direction' });
    expect(parse({ type: 'zzz', intention: 'auto', premierLecteur: '' })).toBeUndefined();
    expect(parse('texte')).toBeUndefined();
  });
  it('champ absent : schéma v2 inchangé', () => {
    const r = parseAiCvResponse(JSON.stringify({ schemaVersion: 2, analyse: { indispensables: ['x'] }, entries: [] }));
    expect(r.analyse?.cible).toBeUndefined();
  });
});

describe('demande de analyse.cible dans le prompt', () => {
  it('tout en auto, rien de détecté : seule la demande de proposition est ajoutée', () => {
    expect(cibleAxesToAsk(resolveTarget(undefined))).toEqual(['type', 'intent', 'firstReader']);
    const prompt = promptFor(undefined);
    expect(prompt).toContain('- cible : propose uniquement type (esn | cabinet | grand-groupe | eti-pme | startup | public | associatif), intention (annonce | spontanee | recommandation | mobilite-interne | chasseur), premierLecteur (rh | operationnel | direction | ats), avec "raison" (une phrase). Cette proposition est seulement affichée au candidat : elle ne change pas ce CV.');
    expect(prompt).toContain('"cible": { "type": "esn|cabinet|grand-groupe|eti-pme|startup|public|associatif", "intention": "annonce|spontanee|recommandation|mobilite-interne|chasseur", "premierLecteur": "rh|operationnel|direction|ats", "raison": "(une phrase)" }');
    expect(prompt).not.toContain('## Cible et intention');
  });

  it('hors le champ cible, le prompt « tout en auto » est identique à l\'ancien', () => {
    const all = (cibleAxes?: readonly ('type' | 'intent' | 'firstReader')[]) =>
      buildCvPrompt({ profile: TEST_PROFILE, entries: makeEntries(), jobOfferText: JOB, options: { now: NOW, pageBudget: 2, bulletFocus: 'resultats', ...(cibleAxes ? { cibleAxes } : {}) } });
    const withAsk = all();
    const withoutAsk = all([]);
    const stripped = withAsk
      .replace(/^- cible : .*\n/m, '')
      .replace(/,\n    "cible": \{.*\}(?=\n  \},)/, '');
    expect(stripped).toBe(withoutAsk);
    expect(withAsk).not.toBe(withoutAsk);
    expect(withAsk.length - withoutAsk.length).toBeLessThan(700);
  });

  it('ce que le candidat a déjà fixé ou ce que l\'application a détecté n\'est pas redemandé', () => {
    const target = resolveTarget({ type: 'esn' }, {}, { intent: 'annonce' });
    expect(cibleAxesToAsk(target)).toEqual(['firstReader']);
    const prompt = promptFor({ type: 'esn' }, { intent: 'annonce' });
    expect(prompt).toContain('- cible : propose uniquement premierLecteur (rh | operationnel | direction | ats)');
    expect(prompt).toContain('"cible": { "premierLecteur": "rh|operationnel|direction|ats", "raison": "(une phrase)" }');
  });
  it('tous les axes fixés : rien à demander', () => {
    expect(cibleAxesToAsk(resolveTarget({ type: 'esn', intent: 'annonce', firstReader: 'rh' }))).toEqual([]);
    expect(promptFor({ type: 'esn', intent: 'annonce', firstReader: 'rh' })).not.toContain('"cible": {');
  });
  it('sans texte d\'annonce : « annonce » n\'est pas une intention proposée', () => {
    expect(cibleAnalysisLine(['intent'], 'cible')).not.toMatch(/annonce/);
    expect(cibleAnalysisLine(['intent'], 'annonce')).toContain('annonce | spontanee');
    const prompt = promptFor({ type: 'esn', intent: 'spontanee' }, undefined, '');
    expect(prompt.replace(/langue_annonce/g, '')).not.toMatch(/annonce/i);
    expect(buildOutputSchema({ cibleAxes: [] })).not.toContain('"cible"');
  });
});

describe('reconcileAiTarget : jamais de remplacement silencieux', () => {
  it('l\'IA comble les axes par défaut', () => {
    const out = reconcileAiTarget(resolveTarget({}), { type: 'public', intent: 'spontanee', firstReader: 'rh', raison: 'r' });
    expect(out.filled).toEqual(['type', 'intent', 'firstReader']);
    expect(out.target.type).toBe('public');
    expect(out.target.sheet?.type).toBe('public');
    expect(out.target.intent).toBe('spontanee');
    expect(out.target.sources).toEqual({ type: 'detected', intent: 'detected', firstReader: 'detected' });
    expect(out.contradictions).toEqual([]);
    expect(out.raison).toBe('r');
  });
  it('un choix explicite contredit est signalé et conservé', () => {
    const out = reconcileAiTarget(resolveTarget({ type: 'esn', firstReader: 'rh' }), { type: 'public', firstReader: 'rh', intent: 'annonce' });
    expect(out.target.type).toBe('esn');
    expect(out.contradictions).toEqual([{ axis: 'type', kept: 'esn', proposed: 'public', keptSource: 'explicit' }]);
    expect(out.filled).toEqual(['intent']);
  });
  it('un type détecté par l\'application est conservé aussi', () => {
    const out = reconcileAiTarget(resolveTarget({}, {}, { type: 'public' }), { type: 'esn' });
    expect(out.target.type).toBe('public');
    expect(out.contradictions).toEqual([{ axis: 'type', kept: 'public', proposed: 'esn', keptSource: 'detected' }]);
  });
  it('accord avec le choix explicite : ni remplissage ni désaccord', () => {
    const out = reconcileAiTarget(resolveTarget({ type: 'esn' }), { type: 'esn' });
    expect(out.filled).toEqual([]);
    expect(out.contradictions).toEqual([]);
  });
  it('sans analyse.cible : ciblage inchangé', () => {
    const t = resolveTarget({ type: 'startup' });
    expect(reconcileAiTarget(t, undefined).target).toEqual(t);
  });
});

describe('instantané cv.settings.target', () => {
  it('aller-retour, fiche comprise', () => {
    const target = resolveTarget({ type: 'public', intent: 'annonce', firstReader: 'rh', readerNote: 'note', publicDetails: { categorie: 'B' }, brief: { company: 'Orga' } });
    const read = readTargetSnapshot({ target: JSON.parse(JSON.stringify(buildTargetSnapshot(target))) });
    expect(read).toEqual(target);
  });
  it('la fiche enregistrée ne suit pas les modifications des fiches par défaut', () => {
    const target = resolveTarget({ type: 'esn' }, { esn: { focusParDefaut: 'missions', ats: false } });
    const snap = JSON.parse(JSON.stringify(buildTargetSnapshot(target)));
    const read = readTargetSnapshot({ target: snap });
    expect(read?.sheet?.focusParDefaut).toBe('missions');
    expect(read?.sheet?.ats).toBe(false);
    expect(DEFAULT_TARGET_SHEETS.esn.focusParDefaut).toBe('resultats');
  });
  it('ciblage sans fiche', () => {
    const read = readTargetSnapshot({ target: buildTargetSnapshot(resolveTarget({})) });
    expect(read?.sheet).toBeNull();
    expect(read?.type).toBeNull();
  });
  it('absent ou invalide : null', () => {
    expect(readTargetSnapshot(undefined)).toBeNull();
    expect(readTargetSnapshot({ target: 'x' })).toBeNull();
    expect(readTargetSnapshot({ target: { type: 'zzz', intent: 'annonce', firstReader: null, sources: {} } })).toBeNull();
  });
});

describe('application : instantané du ciblage, proposition non appliquée', () => {
  const entries = makeEntries();
  it('enregistre le ciblage utilisé ; la proposition de l\'IA est seulement rapportée', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const data = parseAiCvResponse(JSON.stringify({ analyse: { indispensables: ['x'], cible: { type: 'public', firstReader: 'rh', raison: 'Collectivité' } }, entries: [] }));
    const report = await applyAiCvToBlocks('cv1', data, { store: () => store, entries, target: resolveTarget({ intent: 'spontanee' }) });
    // Instantané : le ciblage réellement utilisé pour générer ce CV.
    const snap = readTargetSnapshot(store.settings);
    expect(snap?.type).toBeNull();
    expect(snap?.firstReader).toBeNull();
    expect(snap?.intent).toBe('spontanee');
    // Proposition : à afficher (« Ciblage proposé »), prête pour « Appliquer et régénérer ».
    expect(report.target?.proposed).toEqual(['type', 'firstReader']);
    expect(report.target?.raison).toBe('Collectivité');
    expect(report.target?.target.type).toBe('public');
    expect(report.target?.target.sheet?.type).toBe('public');
  });
  it('désaccord avec un choix explicite : rapporté, non appliqué', async () => {
    const store = makeFakeStore(makeBlocks(entries));
    const data = parseAiCvResponse(JSON.stringify({ analyse: { indispensables: ['x'], cible: { type: 'public' } }, entries: [] }));
    const report = await applyAiCvToBlocks('cv1', data, { store: () => store, entries, target: resolveTarget({ type: 'esn' }) });
    expect(report.target?.contradictions).toHaveLength(1);
    expect(report.target?.target.type).toBe('esn');
    expect(readTargetSnapshot(store.settings)?.type).toBe('esn');
  });
  it('sans option target : aucun réglage écrit (comportement historique)', async () => {
    const store = makeFakeStore(makeBlocks(entries), { x: 1 });
    const report = await applyAiCvToBlocks('cv1', { entries: [], suggestedEntries: [] }, { store: () => store, entries });
    expect(report.target).toBeUndefined();
    expect(store.settings).toEqual({ x: 1 });
  });
});
