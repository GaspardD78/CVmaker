import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleMatches, normalizeTitle, discriminantWord, searchTermsFor, searchTermsForAll } from './csp-relevance';
import { parseCspList, cleanTitle, decodeEntitiesDeep, resolveEmployer, isEmployerSuffix, buildCspSearchUrl } from './csp-html';

const LIST = readFileSync(join(import.meta.dir, '__fixtures__/csp-list.html'), 'utf8');
const INTITULES = ['chargé de recrutement', 'Talent Acquisition'];

describe('normalisation et correspondance des titres', () => {
  test('casse, accents, genre', () => {
    expect(normalizeTitle('CHARGÉ DE RECRUTEMENT (H/F)')).toBe('charge de recrutement');
    expect(normalizeTitle('Chargé(e) de recrutement F/H')).toBe('chargee de recrutement');
    expect(normalizeTitle('Chargé de recrutement (h/f/x) - Mairie')).toBe('charge de recrutement mairie');
  });
  test('le titre contient l\'intitulé', () => {
    expect(titleMatches('Chargé de recrutement (h/f)', INTITULES)).toBe(true);
    expect(titleMatches('Chargé de recrutement et formation - H/F - Mairie de TRAPPES', INTITULES)).toBe(true);
    expect(titleMatches('CHARGÉE DE RECRUTEMENT', INTITULES)).toBe(true);
    expect(titleMatches('Chargés de recrutement F/H', INTITULES)).toBe(true);
    expect(titleMatches('Une chargée ou un chargé de recrutement', INTITULES)).toBe(true);
  });
  test('à défaut, tous les mots significatifs (ordre libre)', () => {
    expect(titleMatches('Chargé de mission recrutement et mobilité', INTITULES)).toBe(true);
    expect(titleMatches('Talent Acquisition Manager', INTITULES)).toBe(true);
  });
  test('rejette les « chargé de… » sans rapport', () => {
    for (const t of [
      'Chargé d\'exploitation déchèterie', 'Chargé de voirie', 'Chargé de tarification', 'Chargé de communication',
      'Chargé de métrologie',
    ]) expect(titleMatches(t, INTITULES)).toBe(false);
  });
  test('un seul mot de l\'intitulé ne suffit pas (choix strict)', () => {
    expect(titleMatches('Assistant administratif et recrutement', INTITULES)).toBe(false);
  });
  test('sans intitulé exploitable, rien n\'est écarté', () => {
    expect(titleMatches('N\'importe quoi', [])).toBe(true);
    expect(titleMatches('N\'importe quoi', ['de la'])).toBe(true);
  });
  test('le préfixe numérique du titre ne gêne pas', () => {
    expect(titleMatches('2026-8271 Chargé de recrutement', INTITULES)).toBe(true);
  });
});

describe('capture réelle de liste', () => {
  const items = parseCspList(LIST);
  test('liste les titres gardés : tous portent « chargé de recrutement »', () => {
    const kept = items.filter(i => titleMatches(i.title, INTITULES));
    // eslint-disable-next-line no-console
    console.debug('titres gardés :', kept.map(i => i.title));
    expect(kept).toHaveLength(20);
    expect(kept.every(i => /charg/i.test(i.title) && /recrutement/i.test(i.title))).toBe(true);
  });
  test('liste mêlée de cartes réelles aux titres modifiés : le hors-sujet est rejeté, le pertinent gardé', () => {
    const mixed = LIST
      .split('CHARGE DE RECRUTEMENT ET DE LA MOBILITE').join('Chargé d\'exploitation déchèterie')
      .split('Chargé de recrutement (H/F) - CONSEIL DÉPARTEMENTAL DU MORBIHAN').join('Chargé de voirie (H/F) - CONSEIL DÉPARTEMENTAL DU MORBIHAN');
    const titles = parseCspList(mixed).map(i => i.title);
    const kept = parseCspList(mixed).filter(i => titleMatches(i.title, INTITULES)).map(i => i.title);
    expect(titles).toContain('Chargé d\'exploitation déchèterie');
    expect(kept).not.toContain('Chargé d\'exploitation déchèterie');
    expect(kept.some(t => t.startsWith('Chargé de voirie'))).toBe(false);
    expect(kept).toContain('Chargé de recrutement et formation - H/F - Mairie de TRAPPES');
    expect(kept).toHaveLength(18);
  });
});

describe('requêtes', () => {
  test('mot le plus discriminant', () => {
    expect(discriminantWord('chargé de recrutement')).toBe('recrutement');
    expect(discriminantWord('Responsable des ressources humaines')).toBe('ressources');
    expect(discriminantWord('chargé de mission')).toBeNull();
    expect(discriminantWord('recrutement')).toBe('recrutement');
  });
  test('2 requêtes au plus par intitulé ; un intitulé d\'un seul mot n\'en ajoute pas', () => {
    expect(searchTermsFor('chargé de recrutement')).toEqual(['chargé de recrutement', 'recrutement']);
    expect(searchTermsFor('recrutement')).toEqual(['recrutement']);
    expect(searchTermsFor('chargé de mission')).toEqual(['chargé de mission']);
  });
  test('fusion sans doublon entre intitulés', () => {
    expect(searchTermsForAll(['chargé de recrutement', 'Responsable du recrutement', 'Recrutement']))
      .toEqual(['chargé de recrutement', 'recrutement', 'Responsable du recrutement']);
  });
  test('ordre des segments d\'URL : mot-clé, lieu, catégorie, page', () => {
    const url = buildCspSearchUrl({ keywords: 'recrutement', locationId: 289, categorie: 'A', page: 2 });
    expect(url).toBe('https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/recrutement/localisation/289/categorie/1805/page/2/');
    const path = new URL(url).pathname;
    expect(path.indexOf('mot-cles')).toBeLessThan(path.indexOf('localisation'));
    expect(path.indexOf('localisation')).toBeLessThan(path.indexOf('categorie'));
    expect(path.indexOf('categorie')).toBeLessThan(path.indexOf('page'));
    expect(path).not.toContain('categorie/1805/localisation');
  });
});

describe('titres : entités et préfixe numérique', () => {
  test('&amp; décodé, y compris doublement encodé', () => {
    expect(cleanTitle('CHARGE DE MISSION INCLUSION &amp; HANDICAP H/F')).toBe('CHARGE DE MISSION INCLUSION & HANDICAP H/F');
    expect(cleanTitle('CHARGE DE MISSION INCLUSION &amp;amp; HANDICAP H/F')).toBe('CHARGE DE MISSION INCLUSION & HANDICAP H/F');
    expect(decodeEntitiesDeep('a &amp;amp;amp; b')).toBe('a &amp; b'); // deux passes au plus
  });
  test('titre de liste doublement encodé', () => {
    const html = '<a href="/offre-emploi/x-reference-O01/">CHARGE DE MISSION INCLUSION &amp;amp; HANDICAP H/F</a>';
    expect(parseCspList(html)[0].title).toBe('CHARGE DE MISSION INCLUSION & HANDICAP H/F');
  });
  test('numéro de référence en tête retiré', () => {
    expect(cleanTitle('2026-8271 Chargé de mission Stratégies et Animations Territoriales'))
      .toBe('Chargé de mission Stratégies et Animations Territoriales');
    expect(parseCspList('<a href="/offre-emploi/x-reference-2026-8271/">2026-8271 Chargé de mission</a>')[0].title).toBe('Chargé de mission');
  });
  test('un titre sans préfixe ni entité est inchangé ; une année seule n\'est pas retirée', () => {
    expect(cleanTitle('Chargé de recrutement (h/f)')).toBe('Chargé de recrutement (h/f)');
    expect(cleanTitle('2026 Plan climat')).toBe('2026 Plan climat');
  });
});

describe('employeur', () => {
  test('« Finances publiques (H/F) » n\'est pas un employeur', () => {
    const e = resolveEmployer('Chargé de missions en collectivité - Finances publiques (H/F)', 'Communes', 'fpt');
    expect(e).toEqual({ company: null, employerType: 'Communes' });
  });
  test('« Mairie de TRAPPES » en est un', () => {
    const e = resolveEmployer('Chargé de recrutement et formation - H/F - Mairie de TRAPPES', 'Communes', 'fpt');
    expect(e).toEqual({ company: 'Mairie de TRAPPES', employerType: 'Communes' });
  });
  test('types d\'employeur reconnus', () => {
    for (const s of ['Conseil départemental de l\'Essonne', 'Communauté d\'agglomération Paris-Saclay', 'REGION AUVERGNE RHONE-ALPES',
      'C.C.A.S DE GRENOBLE', 'CCAS de Grenoble', 'Centre de gestion de l\'Oise', 'Département du Val-de-Marne', 'Ville de Poissy']) {
      expect(isEmployerSuffix(s)).toBe(true);
    }
  });
  test('mots de métier et mention de genre refusés', () => {
    for (const s of ['Finances publiques (H/F)', 'H/F', 'Gestionnaire paie', 'Responsable RH', 'Service recrutement', 'F/H']) {
      expect(isEmployerSuffix(s)).toBe(false);
    }
  });
  test('une commune sans type (Créteil) reste acceptée ; les tirets des noms ne coupent pas', () => {
    expect(resolveEmployer('Chargé de recrutement H/F - Créteil', 'Communes', 'fpt').company).toBe('Créteil');
    expect(resolveEmployer('Chargé de recrutement (h/f) - Champigny-sur-Marne', 'Communes', 'fpt').company).toBe('Champigny-sur-Marne');
    expect(resolveEmployer('Chargé de recrutement (h/f) - Département du Val-de-Marne', 'Conseils départementaux', 'fpt').company)
      .toBe('Département du Val-de-Marne');
  });
  test('sans suffixe : company vide, catégorie dans employerType (jamais dans company)', () => {
    expect(resolveEmployer('Chargé de recrutement (h/f)', 'Etablissements publics de coopération intercommunale', 'fpt'))
      .toEqual({ company: null, employerType: 'Etablissements publics de coopération intercommunale' });
  });
  test('État et hospitalier : l\'employeur affiché est le bon', () => {
    expect(resolveEmployer('CHARGE DE RECRUTEMENT', 'Cour des Comptes', 'etat')).toEqual({ company: 'Cour des Comptes', employerType: null });
  });
});
