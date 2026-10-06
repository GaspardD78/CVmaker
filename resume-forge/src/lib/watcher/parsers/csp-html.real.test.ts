/**
 * Choisir le service public — captures RÉELLES (spec 007).
 *
 * `csp-list.html` (bloc des 20 cartes), `csp-offer-et.html` et `csp-offer-pep.html`
 * ont été capturés sur le site avec `tools/capture-csp-fixtures.ts`. La capture
 * complète de la liste (4,5 Mo, `csp-list.full.html`) n'est pas dans le dépôt.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseCspList, parseCspOffer, reduceCspList, parseCspDate, findOriginalUrl, referenceFromOfferUrl,
  detectOrigin, versantFromText, parseFrenchLongDate,
} from './csp-html';
import { buildCspOffer } from './choisir-service-public';
import { dedupeOffers, type DedupableOffer } from '../offer-dedup';

const dir = join(import.meta.dir, '__fixtures__');
const fx = (name: string) => readFileSync(join(dir, name), 'utf8');

const LIST = fx('csp-list.html');
const items = parseCspList(LIST);
const MORBIHAN_URL = items.find(i => i.url.includes('morbihan'))!.url;
const DEFENSE_URL = items.find(i => i.url.endsWith('reference-DEF_15-00064919/'))!.url;
const et = parseCspOffer(fx('csp-offer-et.html'), MORBIHAN_URL);
const pep = parseCspOffer(fx('csp-offer-pep.html'), DEFENSE_URL);

describe('liste réelle', () => {
  test('20 offres, sans doublon, toutes sur le site', () => {
    expect(items).toHaveLength(20);
    expect(new Set(items.map(i => i.url)).size).toBe(20);
    expect(items.every(i => i.url.startsWith('https://choisirleservicepublic.gouv.fr/offre-emploi/'))).toBe(true);
  });
  test('offre Morbihan : titre, lieu, versant, employeur affiché, date', () => {
    const m = items.find(i => i.url === MORBIHAN_URL)!;
    expect(m.title).toBe('Chargé de recrutement (H/F) - CONSEIL DÉPARTEMENTAL DU MORBIHAN');
    expect(m.location).toBe('Morbihan (56)');
    expect(m.versant).toBe('fpt');
    expect(m.employer).toBe('Conseils départementaux');
    expect(m.publishedAt?.slice(0, 10)).toBe('2026-10-01');
  });
  test('offre Défense : lieu, versant État, référence avec tiret bas', () => {
    const d = items.find(i => i.url === DEFENSE_URL)!;
    expect(d.title).toBe('CHARGE DE RECRUTEMENT ET DE LA MOBILITE');
    expect(d.location).toBe('Hauts-de-Seine (92)');
    expect(d.versant).toBe('etat');
    expect(d.employer).toContain('Défense');
    expect(referenceFromOfferUrl(d.url)).toBe('DEF_15-00064919');
  });
  test('16 offres territoriales sur 20, les autres de l\'État', () => {
    expect(items.filter(i => i.versant === 'fpt')).toHaveLength(16);
    expect(items.filter(i => i.versant === 'etat')).toHaveLength(4);
    expect(items.every(i => i.location && i.employer)).toBe(true);
  });
  test('référence O0… lue dans l\'adresse pour les offres territoriales', () => {
    const refs = items.filter(i => i.versant === 'fpt').map(i => referenceFromOfferUrl(i.url));
    expect(refs.every(r => r !== null && /^O0/.test(r))).toBe(true);
  });
});

describe('page d\'offre territoriale réelle (Morbihan)', () => {
  test('JSON-LD : titre, lieu sans « , France », employeur affiché', () => {
    expect(et.title).toBe('Chargé de recrutement (H/F) - CONSEIL DÉPARTEMENTAL DU MORBIHAN');
    expect(et.location).toBe('Morbihan (56)');
    expect(et.company).toBe('Conseils départementaux');
    expect(et.description).toContain('Département du Morbihan recherche');
  });
  test('date de publication : 1er octobre 2026 (jj/mm/aaaa), sans décalage de fuseau', () => {
    expect(et.publishedAt).toBe('2026-10-01T00:00:00.000Z');
  });
  test('date limite : 1er novembre 2026', () => {
    expect(et.deadline).toBe('2026-11-01T00:00:00.000Z');
  });
  test('lien d\'origine lu dans le texte, sans pk_campaign', () => {
    expect(et.originalUrl).toBe('https://www.emploi-territorial.fr/offre/o056261001001569-charge-recrutement');
    expect(et.originalUrl).not.toContain('pk_campaign');
  });
  test('référence du champ « Référence » et versant du champ « Fonction publique »', () => {
    expect(et.reference).toBe('O056261001001569');
    expect(et.versant).toBe('fpt');
  });
  test('offre complète : origine Emploi Territorial, employeur réel (suffixe du titre)', () => {
    const item = items.find(i => i.url === MORBIHAN_URL)!;
    const offer = buildCspOffer(item, et);
    expect(offer.origin).toBe('emploi_territorial');
    expect(offer.company).toBe('CONSEIL DÉPARTEMENTAL DU MORBIHAN');
    expect(offer.location).toBe('Morbihan (56)');
    expect(offer.publishedAt?.slice(0, 10)).toBe('2026-10-01');
    expect(offer.descriptionSnippet).toContain('Date limite de candidature : 2026-11-01');
  });
});

describe('page d\'offre d\'État réelle (Défense)', () => {
  test('référence DEF_15-00064919 (tiret bas), versant État', () => {
    expect(pep.reference).toBe('DEF_15-00064919');
    expect(pep.versant).toBe('etat');
  });
  test('lieu, date de publication, employeur, pas de lien Emploi Territorial', () => {
    expect(pep.location).toBe('Hauts-de-Seine (92)');
    expect(pep.publishedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(pep.company).toContain('Défense');
    expect(pep.originalUrl).toBeNull();
  });
  test('origine Place de l\'emploi public, lue dans « Fonction publique »', () => {
    const item = items.find(i => i.url === DEFENSE_URL)!;
    expect(buildCspOffer(item, pep).origin).toBe('place_emploi_public');
  });
});

describe('origine : le champ officiel prime', () => {
  test('versant territorial → Emploi Territorial même sans référence O0…', () => {
    expect(detectOrigin('2026-1', null, 'fpt')).toBe('emploi_territorial');
  });
  test('versant État ou hospitalier → Place de l\'emploi public, même avec une référence O0…', () => {
    expect(detectOrigin('O094261002000713', null, 'etat')).toBe('place_emploi_public');
    expect(detectOrigin(null, null, 'fph')).toBe('place_emploi_public');
  });
  test('sans versant : la référence ou le lien confirment', () => {
    expect(detectOrigin('O094261002000713', null)).toBe('emploi_territorial');
    expect(detectOrigin(null, 'https://www.emploi-territorial.fr/offre/o0-x')).toBe('emploi_territorial');
  });
});

describe('formats du site', () => {
  test('dates jj/mm/aaaa sans décalage de fuseau, ISO en repli', () => {
    expect(parseCspDate('01/10/2026')).toBe('2026-10-01T00:00:00.000Z');
    expect(parseCspDate('31/12/2026')).toBe('2026-12-31T00:00:00.000Z');
    expect(parseCspDate('2026-10-01')).toBe('2026-10-01T00:00:00.000Z');
    expect(parseCspDate('2026-10-01T08:00:00+02:00')).toBe('2026-10-01T00:00:00.000Z');
    expect(parseCspDate('31/02/2026')).toBeNull();
    expect(parseCspDate('n\'importe quoi')).toBeNull();
  });
  test('« En ligne depuis le 02 octobre 2026 »', () => {
    expect(parseFrenchLongDate('02 octobre 2026')).toBe('2026-10-02T00:00:00.000Z');
    expect(parseFrenchLongDate('1 février 2027')).toBe('2027-02-01T00:00:00.000Z');
  });
  test('lien d\'origine : href ou texte, requête retirée', () => {
    const url = 'https://www.emploi-territorial.fr/offre/o1-x';
    expect(findOriginalUrl(`<a href="${url}?pk_campaign=ep">voir</a>`)).toBe(url);
    expect(findOriginalUrl(`<p>sur la page ${url}?pk_campaign=ep ou en cliquant</p>`)).toBe(url);
    expect(findOriginalUrl(`<p>sur la page ${url}.</p>`)).toBe(url);
    expect(findOriginalUrl('<p>rien</p>')).toBeNull();
  });
  test('versant lu dans « Fonction publique : … »', () => {
    expect(versantFromText('Fonction publique : Fonction publique Territoriale')).toBe('fpt');
    expect(versantFromText('Fonction publique : Fonction publique de l\'État')).toBe('etat');
    expect(versantFromText('Fonction publique : Fonction publique Hospitalière')).toBe('fph');
    expect(versantFromText('autre')).toBeNull();
  });
});

describe('fixture de liste réduite', () => {
  test('petite, mais complète', () => {
    expect(LIST.length).toBeLessThan(200_000);
    expect(LIST).toContain('<title>');
  });
  const fullPath = join(dir, 'csp-list.full.html');
  test.skipIf(!existsSync(fullPath))('la version réduite donne le même résultat que la page complète', () => {
    const full = readFileSync(fullPath, 'utf8');
    expect(full.length).toBeGreaterThan(1_000_000);
    expect(parseCspList(reduceCspList(full))).toEqual(parseCspList(full));
    expect(reduceCspList(full)).toBe(LIST);
  });
  test('reduceCspList : la réduction est idempotente et n\'altère pas une page sans cartes', () => {
    expect(parseCspList(reduceCspList(LIST))).toEqual(items);
    expect(reduceCspList('<html>rien</html>')).toBe('<html>rien</html>');
  });
  test('reduceCspList : bloc de cartes extrait d\'une page bruitée', () => {
    const noisy = `<html><head><title>T</title></head><body>${'<p>facette</p>'.repeat(5000)}${LIST.slice(LIST.indexOf('<ul'), LIST.lastIndexOf('</ul>') + 5)}<footer>${'x'.repeat(100000)}</footer></body></html>`;
    const reduced = reduceCspList(noisy);
    expect(reduced.length).toBeLessThan(noisy.length / 2);
    expect(parseCspList(reduced)).toEqual(items);
  });
});

describe('offres republiées (offer-dedup)', () => {
  const dedupable: DedupableOffer[] = items.map(item => {
    const o = buildCspOffer(item, null);
    return {
      id: o.reference ?? o.url, source: o.source, title: o.title, company: o.company, location: o.location,
      score: 50, isArchived: 0, kanbanId: null, alerts: [], publishedAt: o.publishedAt,
    };
  });
  const groups = dedupeOffers(dedupable);

  test('Champigny-sur-Marne (deux références) et CCAS de Grenoble regroupés', () => {
    expect(groups).toHaveLength(18);
    const champigny = groups.filter(g => /champigny/i.test(g.title));
    expect(champigny).toHaveLength(1);
    expect(champigny[0].duplicateIds).toHaveLength(1);
    const grenoble = groups.filter(g => /grenoble/i.test(g.title));
    expect(grenoble).toHaveLength(1);
    expect(grenoble[0].duplicateIds).toHaveLength(1);
  });
  test('la plus récente représente le groupe', () => {
    const pair = dedupable.filter(o => /champigny/i.test(o.title));
    expect(pair).toHaveLength(2);
    const newest = [...pair].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0];
    const group = groups.find(g => /champigny/i.test(g.title))!;
    if (pair[0].publishedAt !== pair[1].publishedAt) expect(group.id).toBe(newest.id);
    expect(['O094260812000320', 'O094261002000713'].sort()).toEqual([group.id, ...group.duplicateIds].sort());
  });
  test('à dates égales, repli sur le score ; une date plus récente l\'emporte sur le score', () => {
    const base = { source: 's', title: 'T (H/F)', company: 'C', location: 'L', isArchived: 0, kanbanId: null, alerts: [] };
    const [g] = dedupeOffers<DedupableOffer>([
      { ...base, id: 'old', score: 90, publishedAt: '2026-09-01T00:00:00.000Z' },
      { ...base, id: 'new', score: 40, publishedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(g.id).toBe('new');
    const [h] = dedupeOffers<DedupableOffer>([
      { ...base, id: 'a', score: 40, publishedAt: '2026-10-01T00:00:00.000Z' },
      { ...base, id: 'b', score: 90, publishedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(h.id).toBe('b');
  });
});
