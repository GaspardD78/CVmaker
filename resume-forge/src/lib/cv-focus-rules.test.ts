import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BULLET_FOCUS_OPTIONS, buildFocusRules, normalizeBulletFocus, resolveBulletFocus, warningsLabel,
} from './cv-focus-rules';
import { buildOutputSchema, buildRules, type CvPromptInput } from './cv-prompt';
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
    options: { now: NOW, pageBudget: pages, bulletFocus: focus, cvLanguage: lang },
  });
  for (const focus of ['missions', 'resultats'] as const) {
    for (const [lang, job] of [['fr', JOB_FR], ['en', JOB_EN]] as const) {
      for (const pages of [1, 2] as const) {
        it(`${focus} · ${lang} · ${pages} page(s)`, () => {
          const i = input(job, pages, focus, lang);
          expect(`${buildRules(i)}\n\n${buildOutputSchema({ bulletFocus: focus })}`).toMatchSnapshot();
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
    expect(buildOutputSchema({ bulletFocus: 'missions' })).toContain('"- verbe d\'action + quoi + périmètre + méthode\\n- puce suivante"');
    expect(buildOutputSchema({ bulletFocus: 'missions' })).toContain('(optionnel) périmètres à préciser, points à vérifier');
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
    'prompt-resolver.ts', 'templates/default-markdown.ts',
  ];
  const FORBIDDEN = [/quantification/i, /résultats? chiffrés?/i, /combien/i, /quantifiez/i];
  for (const file of FILES) {
    it(file, () => {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const re of FORBIDDEN) expect(source).not.toMatch(re);
    });
  }
});
