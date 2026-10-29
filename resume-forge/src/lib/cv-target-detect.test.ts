import { describe, expect, it } from 'bun:test';
import { detectTarget, detectTargetType } from './cv-target-detect';
import { resolveTarget } from './cv-targets';

// Textes d'annonce fictifs et anonymisés.
const PUBLIC_AD = 'Mairie de Villeneuve-Exemple. Recrutement d\'un chargé de recrutement (cadre d\'emplois des attachés territoriaux). Fonction publique territoriale.';
const PUBLIC_BY_COMPANY = 'Chargé de recrutement, recrutements collectifs et concours.';
const ESN_AD = 'ESN spécialisée en ingénierie et services numériques. Vous recrutez des consultants pour des missions chez nos clients et gérez l\'intercontrat avec les managers de practice.';
const CABINET_AD = 'Cabinet de recrutement spécialisé en chasse de têtes. Mandats de recrutement pour le compte de nos clients, approche directe de candidats.';
const IT_AD = 'Administrateur systèmes et réseaux. Administration Windows et Linux, supervision, sauvegardes.';
const NEUTRAL_AD = 'Chargé de recrutement (H/F). Vous pilotez les recrutements d\'une entreprise industrielle de 800 personnes.';

describe('détection du type de structure', () => {
  it('public : collectivité dans le texte ou dans le nom', () => {
    expect(detectTargetType(PUBLIC_AD)).toBe('public');
    expect(detectTargetType(PUBLIC_BY_COMPANY, 'Conseil départemental de l\'Exemple')).toBe('public');
    expect(detectTargetType(PUBLIC_BY_COMPANY, 'Centre de gestion fictif')).toBe('public');
  });
  it('esn', () => {
    expect(detectTargetType(ESN_AD)).toBe('esn');
    expect(detectTargetType('Poste en société de conseil, staffing de consultants.')).toBe('esn');
  });
  it('cabinet', () => {
    expect(detectTargetType(CABINET_AD)).toBe('cabinet');
    expect(detectTargetType('Recrutement en agence d\'intérim et travail temporaire.')).toBe('cabinet');
  });
  it('aucun signal net, ou signaux contradictoires : pas de détection', () => {
    expect(detectTargetType(NEUTRAL_AD)).toBeUndefined();
    expect(detectTargetType('Cabinet de recrutement et ESN : staffing, mandats de recrutement.')).toBeUndefined();
  });
  it('« administration système » n\'est pas le secteur public', () => {
    expect(detectTargetType(IT_AD)).toBeUndefined();
  });
});

describe('detectTarget', () => {
  it('annonce dès qu\'un texte est fourni, type seulement si net', () => {
    expect(detectTarget({ jobOfferText: NEUTRAL_AD })).toEqual({ intent: 'annonce' });
    expect(detectTarget({ jobOfferText: ESN_AD })).toEqual({ type: 'esn', intent: 'annonce' });
    expect(detectTarget({ jobOfferText: '   ', company: 'Cabinet de recrutement fictif' })).toEqual({ type: 'cabinet' });
    expect(detectTarget({ jobOfferText: '' })).toEqual({});
  });
  it('alimente resolveTarget : le choix explicite l\'emporte', () => {
    const detected = detectTarget({ jobOfferText: PUBLIC_AD });
    expect(resolveTarget({ type: 'auto' }, {}, detected).type).toBe('public');
    expect(resolveTarget({ type: 'startup' }, {}, detected).type).toBe('startup');
  });
});
