import { describe, expect, it } from 'bun:test';
import {
  SourceError, adviceFor, assertExpectedBody, classifyFailureMessage, deriveSourceStatus,
  failureOf, legacyToSourceStatus, looksLikeBlockPage, looksLikeHtml, sanitizeUrl,
} from './source-status';

const REJECTED = '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Your support ID is: 123</body></html>';

describe('statuts de source — un cas par statut', () => {
  it('ok : des offres récupérées', () => {
    expect(deriveSourceStatus({ failure: null, totalFetched: 12 })).toBe('ok');
  });

  it('vide : requête valide, 0 résultat', () => {
    expect(deriveSourceStatus({ failure: null, totalFetched: 0 })).toBe('vide');
  });

  it('bloquee : 403 / 429', () => {
    expect(classifyFailureMessage('APEC HTTP 403').kind).toBe('bloquee');
    expect(classifyFailureMessage('LinkedIn jobs-guest API 429').kind).toBe('bloquee');
    expect(classifyFailureMessage('APEC HTTP 403').httpStatus).toBe(403);
  });

  it('introuvable : 404 sur l\'endpoint', () => {
    const f = classifyFailureMessage('HTTP 404 pour https://www.emploi-territorial.fr/rss/offres-emploi.rss');
    expect(f.kind).toBe('introuvable');
    expect(f.httpStatus).toBe(404);
    expect(f.url).toBe('https://www.emploi-territorial.fr/rss/offres-emploi.rss');
  });

  it('erreur_reseau : coupure, timeout, 5xx', () => {
    expect(classifyFailureMessage('APEC réseau: error sending request').kind).toBe('erreur_reseau');
    expect(classifyFailureMessage('APEC HTTP 503 : service indisponible').kind).toBe('erreur_reseau');
    expect(classifyFailureMessage('Algolia HTTP 500').kind).toBe('erreur_reseau');
  });

  it('reponse_invalide : HTML au lieu de XML/JSON', () => {
    expect(() => assertExpectedBody('<!DOCTYPE html><html><body>Bienvenue</body></html>', 'xml', { url: 'https://x.fr/a.rss' }))
      .toThrow(SourceError);
    try {
      assertExpectedBody('<!DOCTYPE html><html><body>Bienvenue</body></html>', 'json', { url: 'https://x.fr/a' });
    } catch (e) {
      expect(failureOf(e).kind).toBe('reponse_invalide');
    }
    expect(classifyFailureMessage('APEC JSON Parse Error: Unexpected token <').kind).toBe('reponse_invalide');
  });

  it('intitules_inadaptes : porté par une SourceError typée', () => {
    const err = new SourceError('intitules_inadaptes', 'Aucun intitulé français');
    expect(failureOf(err).kind).toBe('intitules_inadaptes');
  });

  it('non_configuree / en_attente ont un conseil', () => {
    expect(adviceFor('non_configuree', 'indeed')).toContain('activez');
    expect(adviceFor('en_attente', 'indeed')).toContain('Aucune collecte');
  });

  it('anciens statuts convertis', () => {
    expect(legacyToSourceStatus('success')).toBe('ok');
    expect(legacyToSourceStatus('empty')).toBe('vide');
    expect(legacyToSourceStatus('error')).toBe('erreur_reseau');
  });
});

describe('page de pare-feu', () => {
  it('« Request Rejected » en 200 est détectée', () => {
    expect(looksLikeBlockPage(REJECTED)).toBe(true);
    expect(looksLikeHtml(REJECTED)).toBe(true);
  });

  it('n\'est jamais comptée comme 0 offre : bloquee, pas vide', () => {
    let failure = null;
    try {
      assertExpectedBody(REJECTED, 'xml', { url: 'https://www.emploi-territorial.fr/rss/offres-emploi.rss', httpStatus: 200 });
    } catch (e) {
      failure = failureOf(e);
    }
    expect(failure).not.toBeNull();
    expect(failure!.kind).toBe('bloquee');
    expect(deriveSourceStatus({ failure, totalFetched: 0 })).toBe('bloquee');
  });

  it('un vrai flux XML ou JSON passe', () => {
    expect(() => assertExpectedBody('<?xml version="1.0"?><rss><channel></channel></rss>', 'xml', { url: 'u' })).not.toThrow();
    expect(() => assertExpectedBody('{"resultats":[]}', 'json', { url: 'u' })).not.toThrow();
    expect(looksLikeBlockPage('<rss><channel><title>Offres</title></channel></rss>')).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('masque les secrets mais garde les mots-clés', () => {
    const out = sanitizeUrl('https://api.example.com/x?q=recruteur&api_key=ABC123&token=zzz');
    expect(out).toContain('q=recruteur');
    expect(out).not.toContain('ABC123');
    expect(out).not.toContain('zzz');
  });

  it('retire les identifiants embarqués', () => {
    expect(sanitizeUrl('https://user:pw@example.com/a')).not.toContain('pw');
  });
});
