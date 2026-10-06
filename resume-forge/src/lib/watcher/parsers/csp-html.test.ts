import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCspSearchUrl, parseCspList, parseCspOffer, detectOrigin, isEmptyResultPage,
  referenceFromEmploiTerritorialUrl, referenceFromOfferUrl, canonicalOfferUrl,
} from './csp-html';

const fx = (name: string) => readFileSync(join(import.meta.dir, '__fixtures__', name), 'utf8');
/** Ce fichier ne lit QUE les fixtures synthétiques ; les captures réelles sont dans csp-html.real.test.ts. */

describe('buildCspSearchUrl', () => {
  test('mot-clé en premier, encodé', () => {
    expect(buildCspSearchUrl({ keywords: 'chargé de recrutement' }))
      .toBe('https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/charg%C3%A9%20de%20recrutement/');
  });
  test('lieu (identifiant interne), catégorie et pagination après le mot-clé', () => {
    const url = buildCspSearchUrl({ keywords: 'rh', locationId: 289, categorie: 'A', page: 2 });
    expect(url).toEndWith('/mot-cles/rh/localisation/289/categorie/1805/page/2/');
  });
  test('plus de segment versant (ignoré par le site)', () => {
    expect(buildCspSearchUrl({ keywords: 'rh', page: 1 })).not.toContain('versant');
  });
  test('« toutes » et page 1 n\'ajoutent rien', () => {
    expect(buildCspSearchUrl({ keywords: 'rh', locationId: null, categorie: 'all', page: 1 }))
      .toEndWith('/mot-cles/rh/');
  });
});

describe('parseCspList', () => {
  const items = parseCspList(fx('csp-list-synthetic.html'));
  test('une entrée par offre, sans doublon ni lien de navigation', () => {
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(new Set(items.map(i => i.url)).size).toBe(items.length);
    expect(items.every(i => i.url.startsWith('https://choisirleservicepublic.gouv.fr/offre-emploi/'))).toBe(true);
  });
  test('titre décodé, requête retirée de l\'URL', () => {
    const first = items[0];
    expect(first.title).toBe('Chargé de recrutement H/F');
    expect(first.url).not.toContain('?');
  });
  test('entités HTML décodées', () => {
    expect(items.some(i => i.title === 'Chargé de recrutement & mobilité')).toBe(true);
  });
  test('titre repris de l\'attribut title quand le lien est vide', () => {
    expect(items.some(i => i.title === 'Gestionnaire RH')).toBe(true);
  });
  test('lieu lu dans le bloc de l\'offre', () => {
    expect(items[0].location).toBe('Vannes (56)');
  });
  test('liens hors /offre-emploi/ ou hors du site ignorés', () => {
    expect(canonicalOfferUrl('https://evil.example/offre-emploi/x/')).toBeNull();
    expect(canonicalOfferUrl('/nos-offres/')).toBeNull();
  });
  test('page vide', () => {
    expect(parseCspList('<html><body>rien</body></html>')).toEqual([]);
    expect(isEmptyResultPage('<p>Aucune offre ne correspond à votre recherche</p>')).toBe(true);
    expect(isEmptyResultPage('<p>Une page quelconque</p>')).toBe(false);
    expect(isEmptyResultPage('<p>Résultats : 10 offres</p>')).toBe(false);
  });
});

describe('parseCspOffer', () => {
  const url = 'https://choisirleservicepublic.gouv.fr/offre-emploi/charge-de-recrutement-reference-o094261002000713/';
  const et = parseCspOffer(fx('csp-offer-et-synthetic.html'), url);

  test('JSON-LD JobPosting', () => {
    expect(et.title).toBeTruthy();
    expect(et.company).toBeTruthy();
    expect(et.publishedAt).toMatch(/^20\d\d-/);
  });
  test('synthétique : valeurs exactes', () => {
    const d = parseCspOffer(fx('csp-offer-et-synthetic.html'), url);
    expect(d.title).toBe('Chargé de recrutement (H/F)');
    expect(d.company).toBe('Département du Val-de-Marne');
    expect(d.location).toBe('Créteil (94)');
    expect(d.deadline?.slice(0, 10)).toBe('2026-11-15');
    expect(d.description).toBe('Vous pilotez les recrutements de la direction des ressources humaines.');
    expect(d.reference).toBe('O094261002000713');
    expect(d.originalUrl).toBe('https://www.emploi-territorial.fr/offre/o094261002000713-charge-recrutement');
  });
  test('JSON-LD en @graph, identifiant PropertyValue, lieu en tableau, date limite du texte', () => {
    const d = parseCspOffer(fx('csp-offer-pep-synthetic.html'), 'https://choisirleservicepublic.gouv.fr/offre-emploi/gestionnaire-rh-reference-2026-2222222/');
    expect(d.title).toBe('Gestionnaire RH');
    expect(d.reference).toBe('2026-2222222');
    expect(d.location).toBe('Beauvais (60)');
    expect(d.deadline?.slice(0, 10)).toBe('2026-11-30');
    expect(d.originalUrl).toBeNull();
  });
  test('JSON-LD illisible : aucune exception, champs nuls', () => {
    const d = parseCspOffer('<script type="application/ld+json">{oups</script>', url);
    expect(d.title).toBeNull();
    expect(d.company).toBeNull();
  });
  test('département de Corse et d\'outre-mer', () => {
    const page = (postal: string) => `<script type="application/ld+json">{"@type":"JobPosting","title":"t","jobLocation":{"address":{"addressLocality":"V","postalCode":"${postal}"}}}</script>`;
    expect(parseCspOffer(page('20000'), url).location).toBe('V (2A)');
    expect(parseCspOffer(page('20600'), url).location).toBe('V (2B)');
    expect(parseCspOffer(page('97400'), url).location).toBe('V (974)');
  });
});

describe('origine et référence', () => {
  test('référence O0… → Emploi Territorial', () => {
    expect(detectOrigin('O094261002000713', null)).toBe('emploi_territorial');
    expect(detectOrigin('o094261002000713', null)).toBe('emploi_territorial');
  });
  test('lien emploi-territorial.fr → Emploi Territorial', () => {
    expect(detectOrigin(null, 'https://www.emploi-territorial.fr/offre/o094261002000713-x')).toBe('emploi_territorial');
  });
  test('référence 2026-… → Place de l\'emploi public', () => {
    expect(detectOrigin('2026-2222222', null)).toBe('place_emploi_public');
  });
  test('un domaine qui contient seulement « emploi-territorial.fr » ne compte pas', () => {
    expect(detectOrigin('2026-1', 'https://faux-emploi-territorial.fr.example.com/offre/x')).toBe('place_emploi_public');
  });
  test('référence tirée de l\'exemple de la spec', () => {
    expect(referenceFromEmploiTerritorialUrl('https://www.emploi-territorial.fr/offre/o094261002000713-charge-recrutement'))
      .toBe('O094261002000713');
    expect(referenceFromEmploiTerritorialUrl('https://exemple.fr/offre/o1-x')).toBeNull();
  });
  test('référence portée par l\'adresse', () => {
    expect(referenceFromOfferUrl('/offre-emploi/x-reference-2026-1234567/')).toBe('2026-1234567');
    expect(referenceFromOfferUrl('/offre-emploi/sans-ref/')).toBeNull();
  });
});
