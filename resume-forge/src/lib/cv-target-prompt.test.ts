import { describe, expect, it } from 'bun:test';
import { buildCvPrompt, buildRules, buildTitleRule, type CvPromptInput, type CvPromptOptions } from './cv-prompt';
import { atsRule, buildTargetBlock } from './cv-target-prompt';
import { resolveTarget, type TargetChoice } from './cv-targets';
import { applyWording } from './cv-wording';
import { SOC_ANGLE } from './test-helpers/angle-fixtures';
import { TEST_PROFILE, makeEntries } from './test-helpers/cv-fixtures';

const NOW = new Date(Date.UTC(2026, 5, 15));
const JOB = 'Chargé de recrutement (H/F). Vous pilotez le recrutement de profils techniques. Paris.';

const input = (choice: TargetChoice | undefined, extra: Partial<CvPromptOptions> = {}, job = JOB, profile = TEST_PROFILE): CvPromptInput => ({
  profile, entries: makeEntries(), jobOfferText: job,
  options: { now: NOW, pageBudget: 1, verbTense: 'passe-present', ...(choice ? { target: resolveTarget(choice) } : {}), ...extra },
});

describe('tout en auto : prompt identique à l\'existant', () => {
  it('aucun bloc de ciblage, mêmes règles', () => {
    expect(buildTargetBlock(resolveTarget(undefined))).toBe('');
    expect(buildTargetBlock(resolveTarget({ type: 'auto', intent: 'auto', firstReader: 'auto' }))).toBe('');
    const plain = buildCvPrompt(input(undefined));
    const auto = buildCvPrompt(input({ type: 'auto', intent: 'auto', firstReader: 'auto' }));
    expect(auto).toBe(plain);
    expect(plain).not.toContain('## Cible et intention');
    expect(plain).toContain(atsRule('strict'));
    expect(plain).toContain('Annonce :\n<<<');
  });
});

describe('instantanés du prompt par ciblage', () => {
  const cases: [string, TargetChoice, string][] = [
    ['esn · annonce · rh', { type: 'esn', intent: 'annonce', firstReader: 'rh' }, JOB],
    ['public · annonce · rh', { type: 'public', intent: 'annonce', firstReader: 'rh', publicDetails: { categorie: 'B', filiere: 'administrative' } }, JOB],
    ['grand-groupe · recommandation · operationnel', {
      type: 'grand-groupe', intent: 'recommandation', firstReader: 'operationnel',
      readerNote: 'directeur des opérations : dimensionnement, délais, engagements tenus',
      brief: {
        company: 'Groupe fictif', activity: 'services numériques', hrContext: 'plan de recrutement en cours',
        positions: ['Responsable recrutement', 'Chargé de recrutement senior'], strengths: ['recrutement de profils rares', 'évaluation technique'],
      },
      readerName: 'Camille Fictif', readerRole: 'directeur des opérations', referrerName: 'Alex Fictif',
    }, ''],
    ['cabinet · chasseur · rh', { type: 'cabinet', intent: 'chasseur', firstReader: 'rh' }, 'Mission de recrutement décrite par le cabinet : responsable recrutement IT.'],
  ];
  for (const [name, choice, job] of cases) {
    it(name, () => {
      expect(buildCvPrompt(input(choice, {}, job))).toMatchSnapshot();
    });
  }
});

describe('mode cible : « cible » partout, jamais « annonce »', () => {
  const spontanee: TargetChoice = {
    type: 'esn', intent: 'spontanee',
    brief: { company: 'Société fictive', positions: ['Chargé de recrutement'], strengths: ['relation avec les managers'] },
  };
  for (const intent of ['spontanee', 'recommandation'] as const) {
    it(`${intent} : aucune occurrence de « annonce » hors clé JSON`, () => {
      const prompt = buildCvPrompt(input({ ...spontanee, intent }, {}, ''));
      expect(prompt.replace(/langue_annonce/g, '')).not.toMatch(/annonce/i);
      expect(prompt).not.toContain('Annonce :\n<<<');
      expect(prompt).toContain('formulation tirée de la cible (postes envisagés, atouts, attentes du premier lecteur)');
      expect(prompt).toContain('la langue de la cible (analyse.langue_annonce)');
      expect(prompt).toContain('Postes envisagés, par ordre de priorité : 1. Chargé de recrutement');
    });
  }

  it('les règles personnelles du candidat ne sont pas réécrites', () => {
    const prompt = buildCvPrompt(input(spontanee, { personalRules: "Ne jamais citer l'annonce d'origine." }, ''));
    expect(prompt).toContain("Ne jamais citer l'annonce d'origine.");
    expect(prompt).toContain('priment sur la cible');
  });

  it('recommandation : la personne qui transmet le CV n\'apparaît jamais, et son nom non plus dans le prompt', () => {
    const prompt = buildCvPrompt(input({ type: 'grand-groupe', intent: 'recommandation', referrerName: 'Alex Fictif' }, {}, ''));
    expect(prompt).toContain('La personne qui transmet le CV n\'apparaît JAMAIS dans le CV');
    expect(prompt).not.toContain('Alex Fictif');
  });

  it('jamais de nom propre dans le prompt : le lecteur y est connu par sa fonction et la note', () => {
    const prompt = buildCvPrompt(input({
      type: 'esn', intent: 'recommandation', firstReader: 'direction',
      readerName: 'Camille Fictif', readerRole: 'directeur des opérations', referrerName: 'Alex Fictif',
      readerNote: 'dimensionnement, délais',
    }, {}, ''));
    expect(prompt).not.toContain('Camille Fictif');
    expect(prompt).not.toContain('Alex Fictif');
    expect(prompt).toContain('Fonction du premier lecteur : directeur des opérations. Ne la cite jamais dans le CV.');
    expect(prompt).toContain('Ce que valorise ce lecteur : « dimensionnement, délais »');
  });

  it('mobilité interne et approche de chasseur : « annonce » seulement avec un texte', () => {
    const withText = buildCvPrompt(input({ intent: 'chasseur' }, {}, 'Poste décrit par le cabinet.'));
    expect(withText).toContain('Annonce :\n<<<');
    const without = buildCvPrompt(input({ intent: 'mobilite-interne' }, {}, ''));
    expect(without.replace(/langue_annonce/g, '')).not.toMatch(/annonce/i);
  });
});

describe('règle des mots-clés ATS', () => {
  const rules = (choice: TargetChoice, job = JOB) => buildRules(input(choice, {}, job));
  it('strict : annonce + fiche ats', () => {
    expect(rules({ type: 'esn', intent: 'annonce' })).toContain(atsRule('strict'));
  });
  it('léger : spontanée + fiche ats', () => {
    const r = rules({ type: 'esn', intent: 'spontanee' }, '');
    expect(r).toContain('- MOTS-CLÉS (ATS léger)');
    expect(r).toContain('sans répétition forcée');
    expect(r).not.toContain('MOTS-CLÉS ATS :');
  });
  it('mobilité interne et chasseur avec un texte d\'annonce : ATS off (le texte sert à l\'analyse, pas aux mots-clés exacts)', () => {
    for (const intent of ['mobilite-interne', 'chasseur'] as const) {
      for (const type of ['esn', 'cabinet', 'grand-groupe'] as const) {
        const r = rules({ type, intent }, 'Poste décrit : responsable recrutement.');
        expect(r).toContain("- MOTS-CLÉS : les mots-clés de l'annonce apparaissent naturellement, sans répétition forcée.");
        expect(r).not.toContain('MOTS-CLÉS ATS :');
        expect(r).not.toContain('ATS léger');
      }
    }
  });
  it('off : recommandation, ou fiche sans ATS, avec la formulation demandée', () => {
    expect(rules({ type: 'esn', intent: 'recommandation' }, '')).toContain('- MOTS-CLÉS : les mots-clés de la cible apparaissent naturellement, sans répétition forcée.');
    expect(rules({ type: 'public', intent: 'annonce' })).toContain("- MOTS-CLÉS : les mots-clés de l'annonce apparaissent naturellement, sans répétition forcée.");
  });
});

describe('règle de titre', () => {
  const own = { title: 'Chargé de recrutement' };
  const target = (choice: TargetChoice) => resolveTarget(choice);
  it('public et associatif : équivalence', () => {
    const t = buildTitleRule(own, undefined, target({ type: 'public' }));
    expect(t).toContain('traduit à l\'aide des équivalences suivantes');
    expect(t).toContain('Talent Acquisition Manager → Responsable recrutement');
    expect(t).toContain('l\'intitulé exact d\'une expérience du profil');
    expect(t).toContain('avec une remarque dans "warnings"');
    expect(buildTitleRule(own, undefined, target({ type: 'associatif' }))).toContain('équivalences');
  });
  it('l\'équivalence l\'emporte sur la règle « profile » d\'un angle', () => {
    expect(buildTitleRule(own, { titleRule: 'profile' }, target({ type: 'public' }))).toContain('équivalences');
    expect(buildTitleRule(own, SOC_ANGLE, target({ type: 'grand-groupe' }))).toContain("règle de l'angle");
  });
  it('grand-groupe : profile ; esn : règle historique', () => {
    expect(buildTitleRule(own, undefined, target({ type: 'grand-groupe' }))).toBe(
      '- TITRE ("title") : « Chargé de recrutement » tel quel (positionnement choisi par le candidat). Aucun autre intitulé. Ne modifie jamais l\'intitulé d\'une expérience pour coller à l\'annonce.',
    );
    expect(buildTitleRule(own, undefined, target({ type: 'esn' }))).toBe(buildTitleRule(own));
  });
  it('sans titre de profil : règle historique', () => {
    expect(buildTitleRule(null, undefined, target({ type: 'public' }))).toBe(buildTitleRule(null));
  });
});

describe('orientation par défaut de la cible', () => {
  const schema = (choice: TargetChoice | undefined, extra: Partial<CvPromptOptions> = {}) => buildCvPrompt(input(choice, extra));
  it('ESN sans réglage : résultats ; le réglage explicite l\'emporte', () => {
    expect(schema({ type: 'esn' })).toContain("Conserve tous les chiffres de la source");
    expect(schema({ type: 'esn' }, { bulletFocus: 'missions' })).toContain("N'invente aucun chiffre ; tu peux en omettre.");
    expect(schema({ type: 'public' })).toContain('### Orientation : périmètre et missions');
    expect(schema(undefined)).toContain('### Orientation : périmètre et missions');
  });
});

describe('bloc de ciblage', () => {
  it('fiche : attentes, valorise, éviter avec termes, vocabulaire et équivalences', () => {
    const b = buildTargetBlock(resolveTarget({ type: 'public', intent: 'annonce' }));
    expect(b).toContain('Type de structure : Fonction publique');
    expect(b).toContain('### Ce que ce type de lecteur cherche à vérifier');
    expect(b).toContain('termes à ne pas employer : business, placement');
    expect(b).toContain('Équivalences autorisées (les seuls changements de terme permis, jamais pour un poste non tenu)');
    expect(b).toContain('La catégorie et la filière ne sont jamais déduites pour le candidat');
  });
  it('lecteur : consigne de ne jamais le citer ni lui attribuer ses compétences', () => {
    const b = buildTargetBlock(resolveTarget({ type: 'esn', firstReader: 'direction', readerNote: 'dimensionnement, délais' }));
    expect(b).toContain('Premier lecteur : dirigeant');
    expect(b).toContain('Ce que valorise ce lecteur : « dimensionnement, délais »');
    expect(b).toContain("Ne le mentionne JAMAIS dans le CV et n'attribue JAMAIS au candidat ses compétences ou sa fonction");
  });
  it('catégorie et filière : seulement pour le public, reprises du texte', () => {
    expect(buildTargetBlock(resolveTarget({ type: 'public', publicDetails: { categorie: 'A', filiere: 'technique' } })))
      .toContain('Catégorie visée : A (reprise du texte fourni).');
    expect(buildTargetBlock(resolveTarget({ type: 'esn', publicDetails: { categorie: 'A' } }))).not.toContain('Catégorie visée');
  });
  it('l\'anti-invention n\'est pas modifiée par le ciblage', () => {
    for (const choice of [undefined, { type: 'public' as const }, { intent: 'spontanee' as const }]) {
      expect(buildRules(input(choice, {}, choice?.intent ? '' : JOB))).toContain(
        '- Aucun chiffre, pourcentage, outil, certification, employeur, diplôme, date ou niveau absent des données fournies',
      );
    }
  });
});

describe('dictionnaire annonce / cible', () => {
  it('annonce : texte inchangé', () => {
    expect(applyWording("l'annonce et cette annonce", 'annonce')).toBe("l'annonce et cette annonce");
    expect(applyWording("l'annonce", undefined)).toBe("l'annonce");
  });
  it('cible : remplacements ordonnés, clé JSON conservée', () => {
    expect(applyWording("Tu optimises un CV pour UNE annonce ; langue_annonce de l'annonce, cette annonce", 'cible'))
      .toBe('Tu optimises un CV pour UNE cible ; langue_annonce de la cible, cette cible');
  });
});

describe('titre libre : prioritaire sur l\'angle et sur la fiche', () => {
  const own = { title: 'Chargé de recrutement' };
  const free = resolveTarget({ type: 'public', titleRule: 'free' });
  it('conservé tel quel, même avec un angle « profile » et une fiche à équivalences', () => {
    const t = buildTitleRule(own, { titleRule: 'profile' }, free);
    expect(t).toContain('intitulé libre, conservé tel quel par l\'application');
    expect(t).not.toContain('équivalences');
    expect(t).not.toContain('règle de l\'angle');
    expect(buildTitleRule(own, SOC_ANGLE, free)).toContain('intitulé libre');
  });
  it('sans titre de profil aussi, sans fiche aussi', () => {
    expect(buildTitleRule(null, undefined, resolveTarget({ titleRule: 'free' }))).toContain('intitulé libre');
  });
  it('le prompt complet applique la règle', () => {
    const prompt = buildCvPrompt(input({ type: 'esn', titleRule: 'free' }));
    expect(prompt).toContain('intitulé libre, conservé tel quel');
  });
});
