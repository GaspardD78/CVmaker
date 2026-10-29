import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BULLET_FOCUS_OPTIONS, VERB_TENSE_OPTIONS, bulletForm, bulletShape, buildFocusRules, normalizeBulletFocus, normalizeVerbTense, resolveBulletFocus,
  resolveVerbTense, schemaDescriptionExample, tenseRule, warningsLabel,
} from './cv-focus-rules';
import { buildCvPrompt, buildOutputSchema, buildRules, buildWritingRules, type CvPromptInput } from './cv-prompt';
import { buildTextRules, generateEnrichPrompt } from './prompt-templates';
import { TEST_PROFILE, makeEntries } from './test-helpers/cv-fixtures';
import { profileSettingKey, PROFILE_SETTING_NAMES } from './profile-settings';

const NOW = new Date(Date.UTC(2026, 5, 15));
const JOB_FR = 'Chargé de recrutement (H/F). Vous pilotez le recrutement de profils techniques. Télétravail partiel, Paris.';
const JOB_EN = 'Technical Recruiter. You lead the hiring of engineers. Fluent English required. Remote, EU.';

describe('resolveBulletFocus : priorités', () => {
  it('défaut : missions', () => {
    expect(resolveBulletFocus(undefined, undefined)).toBe('missions');
    expect(resolveBulletFocus({}, null)).toBe('missions');
  });
  it('profil > défaut', () => {
    expect(resolveBulletFocus({}, 'resultats')).toBe('resultats');
  });
  it('CV > profil', () => {
    expect(resolveBulletFocus({ bulletFocus: 'missions' }, 'resultats')).toBe('missions');
    expect(resolveBulletFocus({ bulletFocus: 'resultats' }, 'missions')).toBe('resultats');
  });
  it('défaut de la cible : sous le profil, au-dessus de « missions »', () => {
    expect(resolveBulletFocus({}, undefined, 'resultats')).toBe('resultats');
    expect(resolveBulletFocus({}, 'missions', 'resultats')).toBe('missions');
    expect(resolveBulletFocus({ bulletFocus: 'resultats' }, 'missions', 'missions')).toBe('resultats');
  });
  it('ignore une valeur inconnue', () => {
    expect(resolveBulletFocus({ bulletFocus: 'n/a' }, 'autre')).toBe('missions');
    expect(normalizeBulletFocus('x')).toBeUndefined();
    expect(BULLET_FOCUS_OPTIONS.map(o => o.value)).toEqual(['missions', 'resultats']);
  });
});

describe('buildFocusRules', () => {
  it('resultats : aucun bloc ajouté (texte historique inchangé)', () => {
    expect(buildFocusRules('resultats', { onePage: true, language: 'en' })).toBe('');
  });
  it('missions FR : le bloc demandé, tel quel', () => {
    const b = buildFocusRules('missions');
    expect(b.startsWith('### Orientation : périmètre et missions\n- PRIORITÉ :')).toBe(true);
    expect(b).toContain('- CHIFFRES : 3 au maximum sur tout le CV, hors années d\'expérience');
    expect(b).toContain('- GRAS : aucun.');
    expect(b).not.toContain('UNE PAGE');
  });
  it('missions EN : rédigé en anglais', () => {
    const b = buildFocusRules('missions', { language: 'en' });
    expect(b).toContain('### Focus: scope and responsibilities');
    expect(b).toContain('- BOLD: none.');
    expect(b).not.toContain('PRIORITÉ');
  });
  it('une page : ajoute la ligne de périmètre', () => {
    expect(buildFocusRules('missions', { onePage: true })).toContain('- UNE PAGE : le périmètre tient dans la première puce');
    expect(buildFocusRules('missions', { onePage: true, language: 'en' })).toContain('- ONE PAGE:');
  });
  it('mode cible : « l\'annonce » devient « la cible »', () => {
    expect(buildFocusRules('missions', { mode: 'cible' })).not.toContain("l'annonce");
  });
  it('libellé des warnings : seulement en missions', () => {
    expect(warningsLabel('missions')).toBe('Périmètres à préciser');
    expect(warningsLabel('resultats')).toBeNull();
    expect(warningsLabel(undefined)).toBeNull();
  });
});

describe('instantanés des règles et du schéma, par orientation', () => {
  const input = (job: string, pages: 1 | 2, focus: 'missions' | 'resultats', lang: string): CvPromptInput => ({
    profile: TEST_PROFILE, entries: makeEntries(), jobOfferText: job,
    options: { now: NOW, pageBudget: pages, bulletFocus: focus, verbTense: 'passe-present', cvLanguage: lang },
  });
  for (const focus of ['missions', 'resultats'] as const) {
    for (const [lang, job] of [['fr', JOB_FR], ['en', JOB_EN]] as const) {
      for (const pages of [1, 2] as const) {
        it(`${focus} · ${lang} · ${pages} page(s)`, () => {
          const i = input(job, pages, focus, lang);
          expect(`${buildRules(i)}\n\n${buildOutputSchema({ bulletFocus: focus, verbTense: 'passe-present' })}`).toMatchSnapshot();
        });
      }
    }
  }

  it('missions : les consignes de remplacement sont en place', () => {
    const rules = buildRules(input(JOB_FR, 2, 'missions', 'fr'));
    expect(rules).toContain("N'invente aucun chiffre ; tu peux en omettre.");
    expect(rules).not.toContain("Conserve tous les chiffres de la source");
    expect(rules).toContain('2 éléments de périmètre ou de mission reliés aux indispensables');
    expect(rules).toContain('- Pas de gras (**).');
    expect(buildOutputSchema({ bulletFocus: 'missions', verbTense: 'passe-present' })).toContain('"- verbe d\'action + quoi + périmètre + méthode\\n- puce suivante"');
    expect(buildOutputSchema({ bulletFocus: 'missions', verbTense: 'passe-present' })).toContain('(optionnel) périmètres à préciser, points à vérifier');
  });
  it('resultats : consignes historiques', () => {
    const rules = buildRules(input(JOB_FR, 2, 'resultats', 'fr'));
    expect(rules).toContain("Conserve tous les chiffres de la source, n'en ajoute aucun.");
    expect(rules).toContain('question de quantification');
  });
  it('l\'anti-invention des chiffres est identique dans les deux modes', () => {
    for (const focus of ['missions', 'resultats'] as const) {
      expect(buildRules(input(JOB_FR, 1, focus, 'fr'))).toContain('- Aucun chiffre, pourcentage, outil, certification, employeur, diplôme, date ou niveau absent des données fournies');
    }
  });
});

describe('prompts annexes', () => {
  it('enrichissement du profil : périmètre d\'abord en missions, texte historique en resultats', () => {
    const entries = makeEntries();
    const missions = generateEnrichPrompt(TEST_PROFILE, entries, undefined, 'missions');
    expect(missions).toContain('Quels profils ? Pour quels interlocuteurs ? Sur quelles étapes ? Seul ou en équipe ?');
    expect(missions).not.toContain('"Combien ?"');
    const resultats = generateEnrichPrompt(TEST_PROFILE, entries, undefined, 'resultats');
    expect(resultats).toContain('Cherche toujours le "Combien ?" (chiffres)');
    expect(resultats).toContain('(résultats concrets, chiffres, outils)');
  });
  it('règles de texte libre : métriques chiffrées seulement en resultats', () => {
    expect(buildTextRules('resultats')).toContain('métriques chiffrées');
    expect(buildTextRules('missions')).not.toContain('métriques');
  });
});

describe('réglages par profil', () => {
  it('clé <nom>:<profileId>, reprise par la sauvegarde', () => {
    expect(profileSettingKey('cv_bullet_focus', 'p1')).toBe('cv_bullet_focus:p1');
    expect(PROFILE_SETTING_NAMES).toContain('cv_bullet_focus');
    expect(PROFILE_SETTING_NAMES).toContain('cv_personal_rules');
  });
});

describe('aucune consigne de quantification en dur hors de cv-focus-rules.ts', () => {
  const FILES = [
    'cv-prompt.ts', 'prompt-templates.ts', 'cv-angle-prompt.ts', 'cv-angles.ts', 'ai-angle-response.ts',
    'prompt-resolver.ts', 'templates/default-markdown.ts', 'cv-target-prompt.ts', 'cv-wording.ts', 'cv-targets.ts',
  ];
  const FORBIDDEN = [/quantification/i, /résultats? chiffrés?/i, /combien/i, /quantifiez/i, /verbes? au passé/i, /verbes? au présent/i];
  for (const file of FILES) {
    it(file, () => {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const re of FORBIDDEN) expect(source).not.toMatch(re);
    });
  }
});

describe('temps des verbes : une seule définition de la puce, composée avec l\'orientation', () => {
  it('défaut : infinitif ; réglage inconnu ignoré', () => {
    expect(resolveVerbTense(undefined)).toBe('infinitif');
    expect(resolveVerbTense('nominal')).toBe('nominal');
    expect(resolveVerbTense('autre')).toBe('infinitif');
    expect(normalizeVerbTense('passe-present')).toBe('passe-present');
    expect(VERB_TENSE_OPTIONS.map(o => o.value)).toEqual(['infinitif', 'passe-present', 'nominal']);
  });

  it('bulletForm : orientation × temps', () => {
    expect(bulletForm('missions', 'infinitif')).toBe("verbe d'action à l'infinitif + quoi + pour qui ou sur quel périmètre + comment");
    expect(bulletForm('resultats', 'infinitif')).toBe("verbe d'action à l'infinitif + quoi + outil ou méthode + résultat");
    expect(bulletForm('missions', 'passe-present')).toBe("verbe d'action + quoi + pour qui ou sur quel périmètre + comment");
    expect(bulletForm('missions', 'nominal')).toBe("nom d'action + quoi + pour qui ou sur quel périmètre + comment");
  });

  it('passé / présent : texte historique conservé', () => {
    expect(bulletShape('resultats', 'passe-present')).toBe("Puce = verbe d'action + quoi + outil ou méthode + résultat. Le résultat n'apparaît que s'il figure dans la source.");
    expect(tenseRule('passe-present')).toBe('Postes terminés : verbes au passé ; poste actuel : verbes au présent.');
  });

  it('règles de rédaction : définition + règle du premier mot, sans second énoncé ailleurs', () => {
    const inf = buildWritingRules('missions', 'infinitif');
    expect(inf).toContain("- Puce = verbe d'action à l'infinitif + quoi + pour qui ou sur quel périmètre + comment. Un résultat n'est ajouté que s'il éclaire la mission. Toutes les puces commencent par un verbe d'action à l'infinitif (« Recruter », « Piloter »)");
    expect(inf).not.toContain('verbes au passé');
    const nom = buildWritingRules('resultats', 'nominal');
    expect(nom).toContain("Puce = nom d'action + quoi + outil ou méthode + résultat.");
    expect(nom).toContain('« Recrutement de… »');
    expect(buildWritingRules('resultats', 'passe-present')).toContain('Postes terminés : verbes au passé ; poste actuel : verbes au présent.');
  });

  it('le bloc « missions » reprend la définition composée (FR et EN)', () => {
    expect(buildFocusRules('missions', { tense: 'infinitif' })).toContain("- PUCE = verbe d'action à l'infinitif + quoi + pour qui ou sur quel périmètre + comment. Un résultat n'est ajouté que s'il éclaire la mission.");
    expect(buildFocusRules('missions', { tense: 'nominal' })).toContain("- PUCE = nom d'action + quoi + pour qui");
    expect(buildFocusRules('missions', { tense: 'passe-present' })).toContain("- PUCE = verbe d'action + quoi + pour qui");
    expect(buildFocusRules('missions', { tense: 'infinitif', language: 'en' })).toContain('- BULLET = action verb in the base form + what + for whom or on what scope + how.');
    expect(buildFocusRules('missions', { tense: 'nominal', language: 'en' })).toContain('- BULLET = action noun + what');
  });

  it('exemple du schéma', () => {
    expect(schemaDescriptionExample('missions', 'infinitif')).toBe("- verbe à l'infinitif + quoi + périmètre + méthode\\n- puce suivante");
    expect(schemaDescriptionExample('resultats', 'nominal')).toBe("- nom d'action + quoi + outil + résultat sourcé\\n- puce suivante");
    expect(schemaDescriptionExample('missions', 'passe-present')).toBe("- verbe d'action + quoi + périmètre + méthode\\n- puce suivante");
  });

  const promptWith = (verbTense?: 'infinitif' | 'passe-present' | 'nominal'): string => buildCvPrompt({
    profile: TEST_PROFILE, entries: makeEntries(), jobOfferText: JOB_FR,
    options: { now: NOW, pageBudget: 1, bulletFocus: 'resultats', ...(verbTense ? { verbTense } : {}) },
  });

  it('prompt complet : infinitif par défaut, une seule définition de la puce', () => {
    const p = promptWith();
    expect(p).toContain("Toutes les puces commencent par un verbe d'action à l'infinitif");
    expect(p).not.toContain('Postes terminés : verbes au passé');
    expect((p.match(/Puce = /g) ?? []).length).toBe(1);
    expect(promptWith('infinitif')).toBe(p);
    expect(promptWith('passe-present')).toContain('Postes terminés : verbes au passé ; poste actuel : verbes au présent.');
    expect(promptWith('nominal')).toContain("Toutes les puces commencent par un nom d'action");
    expect(promptWith('nominal')).toContain('"description": "- nom d\'action + quoi + outil + résultat sourcé');
  });

  it('infinitif et nominal : instantanés des règles de rédaction', () => {
    expect(buildWritingRules('missions', 'infinitif')).toMatchSnapshot();
    expect(buildWritingRules('resultats', 'nominal')).toMatchSnapshot();
  });

  it('accroche : ne répète pas le titre du CV', () => {
    expect(promptWith()).toContain("Ne répète pas le titre du CV en début d'accroche.");
  });
});
