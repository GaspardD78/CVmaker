import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_TARGET_SHEETS, FIRST_READERS, TARGET_TYPES, atsEnabledFor, atsLevelFor, wordingModeFor, defaultFocusFor, parseSheetOverrides,
  resetSheet, resolveTarget, serializeSheetOverrides, sheetFor, titleRuleFor,
} from './cv-targets';
import { resolveBulletFocus } from './cv-focus-rules';
import { PROFILE_SETTING_NAMES } from './profile-settings';

describe('fiches par défaut', () => {
  it('une fiche par type, sans donnée dans les listes vides', () => {
    expect(Object.keys(DEFAULT_TARGET_SHEETS).sort()).toEqual([...TARGET_TYPES].sort());
    for (const type of TARGET_TYPES) expect(DEFAULT_TARGET_SHEETS[type].type).toBe(type);
  });

  it('orientation, ATS et règle de titre par type', () => {
    const table = Object.fromEntries(TARGET_TYPES.map(t => {
      const s = DEFAULT_TARGET_SHEETS[t];
      return [t, [s.focusParDefaut, s.ats, s.titreParDefaut]];
    }));
    expect(table).toEqual({
      esn: ['resultats', true, 'profile+keyword'],
      cabinet: ['resultats', true, 'profile+keyword'],
      'grand-groupe': ['missions', true, 'profile'],
      'eti-pme': ['missions', false, 'profile+keyword'],
      startup: ['resultats', false, 'profile+keyword'],
      public: ['missions', false, 'equivalence'],
      associatif: ['missions', false, 'equivalence'],
    });
  });

  it('avoidTerms : uniquement des mots détectables, vides sauf public et associatif', () => {
    for (const t of TARGET_TYPES) {
      for (const term of DEFAULT_TARGET_SHEETS[t].avoidTerms) expect(term.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
    }
    expect(DEFAULT_TARGET_SHEETS.public.avoidTerms).toEqual([
      'business', 'placement', 'chasse', 'chasseur', 'sourcing', 'talent acquisition', 'hiring manager',
      'practice lead', 'KPI', 'deal', 'pipeline', 'TJM', 'intercontrat', 'staffing',
    ]);
    expect(DEFAULT_TARGET_SHEETS.associatif.avoidTerms).toEqual(['business', 'deal', 'KPI', 'chasse']);
    for (const t of ['esn', 'cabinet', 'grand-groupe', 'eti-pme', 'startup'] as const) expect(DEFAULT_TARGET_SHEETS[t].avoidTerms).toEqual([]);
  });

  it('les consignes d\'évitement non détectables restent en texte', () => {
    expect(DEFAULT_TARGET_SHEETS.esn.eviter).toContain('jargon RH abstrait');
    expect(DEFAULT_TARGET_SHEETS.cabinet.eviter).toContain('vocabulaire purement interne d\'entreprise');
    expect(DEFAULT_TARGET_SHEETS['eti-pme'].eviter).toEqual(['hyper-spécialisation', 'sigles de grand groupe']);
    expect(DEFAULT_TARGET_SHEETS.startup.eviter).toEqual(['formalisme', 'process lourds']);
    expect(DEFAULT_TARGET_SHEETS.associatif.eviter).toEqual(['registre commercial agressif']);
  });

  it('équivalences du public', () => {
    const eq = Object.fromEntries(DEFAULT_TARGET_SHEETS.public.vocabulaire.equivalences.map(e => [e.from, e.to]));
    expect(eq['Talent Acquisition Manager']).toBe('Responsable recrutement');
    expect(eq['Talent Acquisition Partner']).toBe('Chargé de recrutement');
    expect(eq['practice lead']).toBe('responsable de pôle');
    expect(eq['pipeline']).toBe('vivier de candidats');
    expect(eq['candidate experience']).toBe('accueil et suivi des candidats');
    expect(eq['expérience candidat']).toBe('accueil et suivi des candidats');
    expect(eq['staffing']).toBe('affectation sur les projets');
    expect(eq['cooptation']).toBe('recommandation interne');
    expect(eq['sourcing']).toBe('recherche de candidats');
    expect(eq['hiring manager']).toBe('manager opérationnel');
  });

  it('compléments de fiches, photo et champs du public', () => {
    expect(DEFAULT_TARGET_SHEETS.esn.attentes).toEqual(expect.arrayContaining(['connaissance des technologies et des niveaux d\'expertise', 'gestion de l\'intercontrat']));
    expect(DEFAULT_TARGET_SHEETS.esn.valorise).toEqual(expect.arrayContaining(['délais de recrutement', 'recrutement pour des projets au forfait']));
    expect(DEFAULT_TARGET_SHEETS.cabinet.valorise).toEqual(expect.arrayContaining(['présentation de shortlists', 'relation avec les clients donneurs d\'ordre', 'suivi des candidats après embauche']));
    expect(DEFAULT_TARGET_SHEETS['grand-groupe'].valorise).toEqual(expect.arrayContaining(['relations écoles et alternance', 'travail avec les RRH et HRBP', 'mobilité interne']));
    expect(DEFAULT_TARGET_SHEETS['grand-groupe'].affichage.photo).toBe('indifferent');
    expect(DEFAULT_TARGET_SHEETS.public.valorise).toEqual(expect.arrayContaining(['recrutements collectifs et concours', 'accompagnement des encadrants', 'prévention des discriminations et égalité de traitement']));
    expect(DEFAULT_TARGET_SHEETS.public.affichage.photo).toBe('non');
    expect(DEFAULT_TARGET_SHEETS.public.publicFields).toEqual({ frenchOnly: true, savoirs: true });
    expect(DEFAULT_TARGET_SHEETS.esn.publicFields).toBeUndefined();
  });

  it('une fiche « equivalence » ne contient pas de terme évité dans ses propres termes privilégiés', () => {
    for (const t of ['public', 'associatif'] as const) {
      const sheet = DEFAULT_TARGET_SHEETS[t];
      const avoid = sheet.avoidTerms.map(a => a.toLowerCase());
      for (const p of sheet.vocabulaire.privilegier) expect(avoid.some(a => p.toLowerCase().includes(a))).toBe(false);
      for (const e of sheet.vocabulaire.equivalences) expect(avoid.some(a => e.to.toLowerCase().includes(a))).toBe(false);
    }
  });
});

describe('resolveTarget : explicite > détecté > défaut', () => {
  it('tout en auto, rien détecté : aucune fiche, annonce (prompt inchangé)', () => {
    const r = resolveTarget({ type: 'auto', intent: 'auto', firstReader: 'auto' });
    expect(r).toEqual({ type: null, intent: 'annonce', firstReader: null, sheet: null, sources: { type: 'default', intent: 'default', firstReader: 'default' } });
    expect(resolveTarget(undefined)).toEqual(r);
  });

  it('la détection s\'applique quand le choix est auto', () => {
    const r = resolveTarget({ type: 'auto' }, {}, { type: 'public', intent: 'annonce' });
    expect(r.type).toBe('public');
    expect(r.sources.type).toBe('detected');
    expect(r.sheet?.type).toBe('public');
  });

  it('le choix explicite l\'emporte sur la détection, axe par axe', () => {
    const r = resolveTarget({ type: 'esn', intent: 'auto' }, {}, { type: 'public', intent: 'spontanee', firstReader: 'rh' });
    expect(r.type).toBe('esn');
    expect(r.sources).toEqual({ type: 'explicit', intent: 'detected', firstReader: 'detected' });
    expect(r.intent).toBe('spontanee');
    expect(r.firstReader).toBe('rh');
  });

  it('valeurs inconnues ignorées', () => {
    const r = resolveTarget({ type: 'n/a' as never, intent: 'x' as never }, {}, { type: 'zzz' as never });
    expect(r.type).toBeNull();
    expect(r.intent).toBe('annonce');
  });

  it('note du lecteur et détails du public', () => {
    const r = resolveTarget({ type: 'public', readerNote: '  dimensionnement, délais  ', publicDetails: { categorie: 'B', filiere: ' administrative ' } });
    expect(r.readerNote).toBe('dimensionnement, délais');
    expect(r.publicDetails).toEqual({ categorie: 'B', filiere: 'administrative' });
    const notPublic = resolveTarget({ type: 'esn', publicDetails: { categorie: 'A' } });
    expect(notPublic.publicDetails).toBeUndefined();
  });

  it('utilise les surcharges du profil', () => {
    const r = resolveTarget({ type: 'esn' }, { esn: { focusParDefaut: 'missions' } });
    expect(r.sheet?.focusParDefaut).toBe('missions');
    expect(r.sheet?.label).toBe(DEFAULT_TARGET_SHEETS.esn.label);
  });
});

describe('défauts dérivés de la cible', () => {
  it('defaultFocusFor alimente resolveBulletFocus sous le réglage du profil', () => {
    const esn = resolveTarget({ type: 'esn' });
    expect(defaultFocusFor(esn)).toBe('resultats');
    expect(resolveBulletFocus({}, undefined, defaultFocusFor(esn))).toBe('resultats');
    expect(resolveBulletFocus({}, 'missions', defaultFocusFor(esn))).toBe('missions');
    expect(defaultFocusFor(resolveTarget({}))).toBeUndefined();
    expect(resolveBulletFocus({}, undefined, defaultFocusFor(resolveTarget({})))).toBe('missions');
  });

  it('titleRuleFor : règle de la fiche, historique sans fiche', () => {
    expect(titleRuleFor(resolveTarget({ type: 'public' }))).toBe('equivalence');
    expect(titleRuleFor(resolveTarget({ type: 'grand-groupe' }))).toBe('profile');
    expect(titleRuleFor(resolveTarget({}))).toBe('profile+keyword');
  });

  it('atsLevelFor : trois niveaux selon l\'intention et la fiche', () => {
    for (const type of TARGET_TYPES) {
      const ats = DEFAULT_TARGET_SHEETS[type].ats;
      expect(atsLevelFor(resolveTarget({ type, intent: 'annonce' }))).toBe(ats ? 'strict' : 'off');
      expect(atsLevelFor(resolveTarget({ type, intent: 'spontanee' }))).toBe(ats ? 'leger' : 'off');
      for (const intent of ['recommandation', 'mobilite-interne', 'chasseur'] as const) {
        expect(atsLevelFor(resolveTarget({ type, intent }))).toBe('off');
      }
    }
  });

  it('atsLevelFor : sans fiche, strict en annonce (historique), off en spontanée', () => {
    expect(atsLevelFor(resolveTarget({}))).toBe('strict');
    expect(atsLevelFor(resolveTarget({ intent: 'spontanee' }))).toBe('off');
  });

  it('atsLevelFor : le lecteur garde la priorité', () => {
    expect(atsLevelFor(resolveTarget({ type: 'public', firstReader: 'ats' }))).toBe('strict');
    expect(atsLevelFor(resolveTarget({ type: 'public', intent: 'spontanee', firstReader: 'ats' }))).toBe('leger');
    expect(atsLevelFor(resolveTarget({ type: 'esn', firstReader: 'operationnel' }))).toBe('off');
    expect(atsLevelFor(resolveTarget({ type: 'esn', intent: 'spontanee', firstReader: 'direction' }))).toBe('off');
    expect(atsLevelFor(resolveTarget({ type: 'esn', firstReader: 'rh' }))).toBe('strict');
    expect(atsLevelFor(resolveTarget({ type: 'esn', intent: 'recommandation', firstReader: 'ats' }))).toBe('off');
    expect(atsEnabledFor(resolveTarget({ type: 'esn', intent: 'spontanee' }))).toBe(true);
    expect(atsEnabledFor(resolveTarget({ type: 'esn', intent: 'recommandation' }))).toBe(false);
    expect(FIRST_READERS).toHaveLength(4);
  });

  it('wordingModeFor : annonce / cible', () => {
    expect(wordingModeFor(resolveTarget({}), 'texte')).toBe('annonce');
    expect(wordingModeFor(resolveTarget({ intent: 'spontanee' }), 'texte')).toBe('cible');
    expect(wordingModeFor(resolveTarget({ intent: 'recommandation' }), '')).toBe('cible');
    expect(wordingModeFor(resolveTarget({ intent: 'chasseur' }), 'poste décrit')).toBe('annonce');
    expect(wordingModeFor(resolveTarget({ intent: 'mobilite-interne' }), '  ')).toBe('cible');
  });

  it('le formulaire de cible est nettoyé', () => {
    const r = resolveTarget({ brief: { company: ' Orga ', positions: ['A', ' ', 'B'], strengths: [], referrer: '' } });
    expect(r.brief).toEqual({ company: 'Orga', positions: ['A', 'B'] });
    expect(resolveTarget({ brief: { company: ' ' } }).brief).toBeUndefined();
  });
});

describe('fiches personnalisées par profil', () => {
  it('fusionne champ par champ, sous-objets compris', () => {
    const sheet = sheetFor('public', { public: { ats: true, vocabulaire: { registre: 'autre' }, affichage: { photo: 'indifferent' } } });
    expect(sheet.ats).toBe(true);
    expect(sheet.vocabulaire.registre).toBe('autre');
    expect(sheet.vocabulaire.equivalences).toEqual(DEFAULT_TARGET_SHEETS.public.vocabulaire.equivalences);
    expect(sheet.affichage.photo).toBe('indifferent');
    expect(sheet.affichage.longueur).toBe(DEFAULT_TARGET_SHEETS.public.affichage.longueur);
    expect(sheet.publicFields).toEqual({ frenchOnly: true, savoirs: true });
  });

  it('lecture tolérante : JSON invalide, types incorrects, champs inconnus', () => {
    expect(parseSheetOverrides(null)).toEqual({});
    expect(parseSheetOverrides('pas du json')).toEqual({});
    expect(parseSheetOverrides('[]')).toEqual({});
    const parsed = parseSheetOverrides(JSON.stringify({
      esn: { ats: 'oui', focusParDefaut: 'missions', titreParDefaut: 'nope', attentes: ['a', 1, ' b '], inconnu: 1 },
      zzz: { ats: true },
      public: { vocabulaire: { equivalences: [{ from: 'x', to: 'y' }, { from: '', to: 'z' }] } },
    }));
    expect(parsed).toEqual({
      esn: { focusParDefaut: 'missions', attentes: ['a', 'b'] },
      public: { vocabulaire: { equivalences: [{ from: 'x', to: 'y' }] } },
    });
  });

  it('aller-retour JSON et retour aux valeurs par défaut', () => {
    const overrides = { esn: { ats: false }, startup: { focusParDefaut: 'missions' as const } };
    expect(parseSheetOverrides(serializeSheetOverrides(overrides))).toEqual(overrides);
    expect(resetSheet(overrides, 'esn')).toEqual({ startup: { focusParDefaut: 'missions' } });
    expect(sheetFor('esn', resetSheet(overrides, 'esn'))).toEqual(DEFAULT_TARGET_SHEETS.esn);
  });

  it('le réglage suit la sauvegarde par profil', () => {
    expect(PROFILE_SETTING_NAMES).toContain('cv_target_sheets');
  });
});
