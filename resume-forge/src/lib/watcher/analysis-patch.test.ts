import { describe, expect, test } from 'bun:test';
import {
  applyChanges, applyLearnedForgets, clearUndoSnapshot, evaluateChanges, loadUndoSnapshot,
  parseWatchAnalysisResponse, saveUndoSnapshot, simulatePatch, type GuardContext, type PatchChange,
  type SnapshotStorage,
} from './analysis-patch';
import type { WatchAnalysisOfferInput } from './analysis-context';
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';

const NOW = new Date('2026-06-15T12:00:00Z');
let seq = 0;
const sp = (over: Partial<SearchProfile> = {}): SearchProfile => ({ ...DEFAULT_SEARCH_PROFILE, contractTypes: [], ...over });
const offer = (over: Partial<WatchAnalysisOfferInput> = {}): WatchAnalysisOfferInput => {
  seq += 1;
  return {
    id: `o${seq}`, source: 'apec', title: `Offre ${seq}`, company: `Société ${seq}`, location: 'Paris', contractType: null,
    salaryMin: null, salaryMax: null, salaryRaw: null, publishedAt: NOW.toISOString(), fetchedAt: NOW.toISOString(),
    storedScore: 50, snippet: null, isRead: false, kanban: false, actions: [], ...over,
  };
};
const parsed = (text: string) => {
  const r = parseWatchAnalysisResponse(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  searchProfile: sp({ jobTitles: ['RSSI', 'DSI'] }), learnedDict: { positive: {}, negative: {} },
  otherTracks: [], offers: [], ...over,
});
const change = (field: PatchChange['field'], op: PatchChange['op'], value: PatchChange['value']): PatchChange =>
  ({ id: `${field}:${op}:${value}`, field, op, value });

describe('parse tolérant', () => {
  const body = `{ "schema": "watch-analysis/v1",
    "diagnostic": { "cause_principale": "requete", "constats": ["trop large"] },
    "patch": { "jobTitles": { "add": ["RSSI adjoint"], "remove": [] }, "salary": { "min": null, "target": 52000 },
               "apecSalaires": { "set": ["50-70k€"] } },
    "learned_to_forget": ["cybersécurité"],
    "justifications": [{ "change": "a", "raison": "b", "impact_attendu": "c" }],
    "actions_utilisateur": ["trier les 12 offres sans action"] }`;

  test('bloc entouré de fences et de texte', () => {
    const v = parsed(`Voici mon analyse :\n\`\`\`json\n${body}\n\`\`\`\n1. Synthèse\n2. ...`);
    expect(v.schemaOk).toBe(true);
    expect(v.cause).toBe('requete');
    expect(v.changes.map(c => c.id)).toEqual([
      'jobTitles:add:RSSI adjoint', 'apecSalaires:set:50-70k€', 'salaryTarget:set:52000', 'learnedTerm:forget:cybersécurité',
    ]);
    expect(v.actionsUtilisateur).toEqual(['trier les 12 offres sans action']);
    expect(v.justifications).toHaveLength(1);
  });
  test('JSON sans fences, virgules finales, champs inconnus ignorés', () => {
    const v = parsed(`Réponse: { "schema": "watch-analysis/v1", "patch": { "skills": { "add": ["ISO 27001",], "remove": [] }, "inconnu": 3, },
      "extra": true } fin.`);
    expect(v.changes).toEqual([{ id: 'skills:add:ISO 27001', field: 'skills', op: 'add', value: 'ISO 27001' }]);
  });
  test('schéma inattendu : lecture tolérante avec avertissement', () => {
    const v = parsed('```json\n{"schema":"autre/v9","patch":{"domains":{"add":["banque"]}}}\n```');
    expect(v.schemaOk).toBe(false);
    expect(v.warnings[0]).toContain('inattendu');
    expect(v.changes).toHaveLength(1);
  });
  test('valeurs APEC validées contre les listes connues (casse corrigée, inconnues ignorées)', () => {
    const v = parsed(JSON.stringify({ schema: 'watch-analysis/v1', patch: {
      apecFonctions: { add: ['responsable recrutement', 'Astronaute'], remove: [] },
      apecTeletravail: { add: ['Télétravail régulier'] },
      apecSalaires: { set: ['40-50k€', '999k€'] },
    } }));
    expect(v.changes.map(c => c.id)).toEqual([
      'apecFonctions:add:Responsable recrutement', 'apecTeletravail:add:Télétravail régulier', 'apecSalaires:set:40-50k€',
    ]);
    expect(v.warnings.filter(w => w.includes('libellé APEC inconnu') || w.includes("n'est pas un libellé APEC connu"))).toHaveLength(2);
  });
  test('types invalides et montants aberrants ignorés avec avertissement', () => {
    const v = parsed(JSON.stringify({ schema: 'watch-analysis/v1', patch: {
      jobTitles: { add: 'RSSI' }, skills: { add: [42, 'x', 'ok ok'] }, salary: { min: -5, target: 'beaucoup' },
    } }));
    expect(v.changes.map(c => c.id)).toEqual(['skills:add:ok ok']);
    expect(v.warnings.length).toBeGreaterThanOrEqual(4);
  });
  test('aucune réponse exploitable', () => {
    expect(parseWatchAnalysisResponse('Je ne peux pas faire ça.').ok).toBe(false);
    expect(parseWatchAnalysisResponse('{ "autre": 1 }').ok).toBe(false);
  });
  test('un terme ajouté et retiré à la fois n\'est conservé que comme retrait', () => {
    const v = parsed('{"schema":"watch-analysis/v1","patch":{"skills":{"add":["Go"],"remove":["go"]}}}');
    expect(v.changes.map(c => c.id)).toEqual(['skills:remove:go']);
  });
});

describe('garde-fous', () => {
  test('exclusion présente dans la description d\'une offre importée : bloquée par défaut mais forçable', () => {
    const imported = offer({ title: 'RSSI Groupe', snippet: 'Vous managez des ingénieurs et un ingénieur senior', kanban: true });
    const [r] = evaluateChanges([change('excludeTitles', 'add', 'ingénieur')], ctx({ offers: [imported, offer()] }));
    expect(r.status).toBe('blocked');
    expect(r.forceable).toBe(true);
    expect(r.reasons[0]).toContain('RSSI Groupe');
  });
  test('exclusion présente dans une offre likée : bloquée', () => {
    const liked = offer({ title: 'RSSI stagiaire', actions: ['thumbs_up'] });
    const [r] = evaluateChanges([change('excludeTitles', 'add', 'stagiaire')], ctx({ offers: [liked] }));
    expect(r.status).toBe('blocked');
  });
  test('exclusion sûre : ok ; touchant > 20 % des offres récentes : avertissement', () => {
    const safe = [offer({ title: 'DSI' }), offer({ title: 'RSSI' }), offer({ title: 'Commercial' }), offer({ title: 'Commercial junior' })];
    const [r] = evaluateChanges([change('excludeTitles', 'add', 'commercial')], ctx({ offers: safe }));
    expect(r.status).toBe('warn');
    expect(r.reasons[0]).toContain('50 %');
    const [ok] = evaluateChanges([change('excludeTitles', 'add', 'btp')], ctx({ offers: safe }));
    expect(ok.status).toBe('ok');
  });
  test('exclusion recoupant le vocabulaire de la piste : bloquée', () => {
    const [r] = evaluateChanges([change('excludeTitles', 'add', 'RSSI')], ctx());
    expect(r.status).toBe('blocked');
  });
  test('exclusion déjà en place : sans effet', () => {
    const [r] = evaluateChanges([change('excludeTitles', 'add', 'Stage')], ctx({ searchProfile: sp({ jobTitles: ['RSSI'], excludeTitles: ['stage'] }) }));
    expect(r.status).toBe('noop');
  });
  test('intitulé déjà couvert par une autre piste (> 0,6) : bloqué, forçable', () => {
    const c = ctx({
      searchProfile: sp({ jobTitles: ['RSSI'] }),
      otherTracks: [{ name: 'Copie', jobTitles: ['RSSI', 'DSI'] }],
    });
    const [r] = evaluateChanges([change('jobTitles', 'add', 'DSI')], c);
    expect(r.status).toBe('blocked');
    expect(r.forceable).toBe(true);
    expect(r.reasons[0]).toContain('Copie');
  });
  test('intitulé partagé mais recouvrement faible : accepté', () => {
    const c = ctx({
      searchProfile: sp({ jobTitles: ['RSSI', 'DPO', 'Auditeur', 'Consultant'] }),
      otherTracks: [{ name: 'Large', jobTitles: ['DSI', 'CTO', 'CIO', 'Directeur technique', 'Chef de projet'] }],
    });
    expect(evaluateChanges([change('jobTitles', 'add', 'DSI')], c)[0].status).toBe('ok');
  });
  test('retirer tous les intitulés : refusé, non forçable', () => {
    const r = evaluateChanges([change('jobTitles', 'remove', 'RSSI'), change('jobTitles', 'remove', 'DSI')], ctx());
    expect(r.map(x => x.status)).toEqual(['ok', 'blocked']);
    expect(r[1].forceable).toBe(false);
  });
  test('salaire minimum supérieur à la cible : refusé', () => {
    const c = ctx({ searchProfile: sp({ jobTitles: ['RSSI'], salary: { min: null, target: 50000 } }) });
    expect(evaluateChanges([change('salaryMin', 'set', 60000)], c)[0].status).toBe('blocked');
  });
  test('terme appris absent : sans effet ; présent : ok', () => {
    const c = ctx({ learnedDict: { positive: {}, negative: { btp: 4 } } });
    expect(evaluateChanges([change('learnedTerm', 'forget', 'BTP')], c)[0].status).toBe('ok');
    expect(evaluateChanges([change('learnedTerm', 'forget', 'autre')], c)[0].status).toBe('noop');
  });
});

describe('application', () => {
  test('ajout, retrait et ensemble, sans modifier le profil d\'origine', () => {
    const base = sp({ jobTitles: ['RSSI', 'DSI'], skills: ['ISO'], excludeTitles: ['stage'], apecSalaires: ['40-50k€'] });
    const frozen = JSON.stringify(base);
    const next = applyChanges(base, [
      change('jobTitles', 'add', 'RSSI adjoint'), change('jobTitles', 'remove', 'dsi'), change('skills', 'add', 'iso'),
      change('excludeTitles', 'add', 'alternance'), change('apecSalaires', 'set', ['50-70k€']), change('salaryTarget', 'set', 55000),
    ]);
    expect(next.jobTitles).toEqual(['RSSI', 'RSSI adjoint']);
    expect(next.skills).toEqual(['ISO']);
    expect(next.excludeTitles).toEqual(['stage', 'alternance']);
    expect(next.apecSalaires).toEqual(['50-70k€']);
    expect(next.salary.target).toBe(55000);
    expect(JSON.stringify(base)).toBe(frozen);
  });
  test('le retrait d\'une exclusion vaut pour excludeTitles ET excludeDomains, et purge sa portée', () => {
    const base = sp({ jobTitles: ['RSSI'], excludeTitles: ['stage'], excludeDomains: ['BTP'], excludeScopes: { btp: 'anywhere', stage: 'anywhere' } });
    const next = applyChanges(base, [change('excludeTitles', 'remove', 'btp'), change('excludeTitles', 'remove', 'stage')]);
    expect(next.excludeDomains).toEqual([]);
    expect(next.excludeTitles).toEqual([]);
    expect(next.excludeScopes).toBeUndefined();
  });
  test('ne vide jamais les intitulés, même si le garde-fou est contourné', () => {
    const next = applyChanges(sp({ jobTitles: ['RSSI'] }), [change('jobTitles', 'remove', 'RSSI')]);
    expect(next.jobTitles).toEqual(['RSSI']);
  });
  test('oubli de termes appris', () => {
    const dict = applyLearnedForgets({ positive: {}, negative: { btp: 4, cybersécurité: 6 } }, [change('learnedTerm', 'forget', 'Cybersécurité')]);
    expect(dict.negative).toEqual({ btp: 4 });
  });
});

describe('simulation', () => {
  const fixtures = [
    offer({ id: 'a', title: 'RSSI Banque', snippet: 'poste', kanban: true }),
    offer({ id: 'b', title: 'DSI Industrie', snippet: 'poste', actions: ['thumbs_up'] }),
    offer({ id: 'c', title: 'Responsable sécurité', snippet: 'poste' }),
    offer({ id: 'd', title: 'DSI Groupe', snippet: 'poste' }),
    offer({ id: 'e', title: 'Commercial', snippet: 'poste' }),
  ];
  const before = sp({ jobTitles: ['RSSI', 'DSI'] });
  const run = (after: SearchProfile) => simulatePatch({ offers: fixtures, before, after, learnedBefore: { positive: {}, negative: {} }, now: NOW });

  test('offres perdues, avec mise en évidence de celles aimées ou importées', () => {
    const r = run(applyChanges(before, [change('jobTitles', 'remove', 'DSI'), change('jobTitles', 'add', 'sécurité')]));
    expect(r.total).toBe(5);
    expect(r.lost.map(o => o.id).sort()).toEqual(['b', 'd']);
    expect(r.lostLiked.map(o => o.id)).toEqual(['b']);
    expect(r.gained.map(o => o.id)).toEqual(['c']);
  });
  test('exclusion : offres perdues avec la raison', () => {
    const r = run(applyChanges(before, [change('excludeTitles', 'add', 'groupe')]));
    expect(r.lost.map(o => o.id)).toEqual(['d']);
    expect(r.lost[0].reason).toContain('groupe');
    expect(r.after.disqualified).toBe(1);
  });
  test('distribution avant/après cohérente', () => {
    const r = run(before);
    expect(r.before).toEqual(r.after);
    expect(r.gained).toHaveLength(0);
    expect(r.lost).toHaveLength(0);
    const sum = (d: typeof r.before) => d.disqualified + d.low + d.medium + d.high;
    expect(sum(r.before)).toBe(5);
  });
  test('l\'oubli d\'un terme appris est pris en compte', () => {
    const learned = { positive: {}, negative: { sécurité: 12 } };
    const withLearned = simulatePatch({
      offers: [offer({ id: 'z', title: 'RSSI sécurité', snippet: 'x' })], before, after: before,
      learnedBefore: learned, learnedAfter: { positive: {}, negative: {} }, now: NOW, threshold: 39,
    });
    expect(withLearned.gained.map(o => o.id)).toEqual(['z']);
  });
});

describe('instantané d\'annulation', () => {
  const memory = (): SnapshotStorage => {
    const m = new Map<string, string>();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) };
  };
  test('aller-retour et effacement', () => {
    const storage = memory();
    const snap = { alertId: 'a1', appliedAt: NOW.toISOString(), searchProfile: sp({ jobTitles: ['RSSI'] }), learnedDict: { positive: {}, negative: { x: 3 } } };
    expect(saveUndoSnapshot(storage, snap)).toBe(true);
    expect(loadUndoSnapshot(storage, 'a1')).toEqual(snap);
    expect(loadUndoSnapshot(storage, 'autre')).toBeNull();
    clearUndoSnapshot(storage, 'a1');
    expect(loadUndoSnapshot(storage, 'a1')).toBeNull();
  });
  test('stockage indisponible : échec silencieux', () => {
    const broken: SnapshotStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(saveUndoSnapshot(broken, { alertId: 'a', appliedAt: '', searchProfile: sp(), learnedDict: { positive: {}, negative: {} } })).toBe(false);
    expect(loadUndoSnapshot(broken, 'a')).toBeNull();
    expect(() => clearUndoSnapshot(broken, 'a')).not.toThrow();
  });
});
