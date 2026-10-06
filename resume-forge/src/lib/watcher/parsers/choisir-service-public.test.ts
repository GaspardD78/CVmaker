/**
 * Choisir le service public — politesse et enchaînement (spec 007, phase 1).
 *
 * Le réseau et l'horloge sont simulés : aucune requête réelle, aucune attente.
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

mock.module('@tauri-apps/plugin-http', () => ({ fetch: async () => new Response('', { status: 500 }) }));

import {
  parseChoisirServicePublic, consumeCspMetrics, resetCspCollectionBudget, CSP_MAX_LIST_REQUESTS, parseRobotsDisallow, isAllowedByRobots, buildCspOffer,
  __resetCspStateForTests, CSP_USER_AGENT, CSP_MAX_PAGES, CSP_MIN_INTERVAL_MS, type CspDeps,
} from './choisir-service-public';
import { failureOf } from '../source-status';
import { DEFAULT_JOB_WATCH_SETTINGS, DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import type { JobWatchConfig, SearchProfile } from '@/types/job-watch';

const fx = (name: string) => readFileSync(join(import.meta.dir, '__fixtures__', name), 'utf8');
const LIST = fx('csp-list-synthetic.html');
const OFFER_ET = fx('csp-offer-et-synthetic.html');
const OFFER_PEP = fx('csp-offer-pep-synthetic.html');

const config: JobWatchConfig = {
  id: 'c', alertId: 'a', source: 'choisir_service_public', rssUrl: null, enabled: 1, lastFetchedAt: null, createdAt: '',
};
const profile = (over: Partial<SearchProfile> = {}): SearchProfile => ({
  ...DEFAULT_SEARCH_PROFILE, jobTitles: ['Chargé de recrutement'], ...over,
});

interface Call { url: string; at: number; headers: Record<string, string> }

function harness(respond: (url: string, call: Call) => Response, known: string[] = []) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const deps: CspDeps = {
    http: async (url, init) => {
      const call = { url, at: clock, headers: init.headers as Record<string, string> };
      calls.push(call);
      return respond(url, call);
    },
    sleep: async ms => { clock += ms; },
    now: () => clock,
    knownUrls: async () => new Set(known),
  };
  return { deps, calls };
}

const html = (body: string, status = 200) => new Response(body, { status });
const isSearch = (u: string) => u.includes('/nos-offres/');
const isOffer = (u: string) => u.includes('/offre-emploi/');
const searchCalls = (calls: Call[]) => calls.filter(c => isSearch(c.url));

/** Page de liste dont les liens portent un suffixe, pour fabriquer des pages distinctes. */
const pageOf = (n: number) =>
  `<ul>${[1, 2].map(i => `<li><a href="/offre-emploi/poste-${n}-${i}-reference-2026-${n}${i}/">Chargé de recrutement ${n}-${i}</a></li>`).join('')}</ul>`;

beforeEach(() => __resetCspStateForTests());

describe('robots.txt', () => {
  test('règles de User-agent: *', () => {
    const rules = parseRobotsDisallow('User-agent: Bot\nDisallow: /tout/\n\nUser-agent: *\nDisallow: /wp-admin/\nDisallow: /wp-content/uploads/pdf-offers/\nAllow: /wp-admin/admin-ajax.php');
    expect(rules).toEqual(['/wp-admin/', '/wp-content/uploads/pdf-offers/']);
  });
  test('chemins autorisés et interdits', () => {
    const rules = ['/wp-admin/', '/wp-content/uploads/pdf-offers/'];
    expect(isAllowedByRobots('https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/rh/', rules)).toBe(true);
    expect(isAllowedByRobots('https://choisirleservicepublic.gouv.fr/wp-admin/x', rules)).toBe(false);
  });
});

describe('collecte', () => {
  test('liste puis enrichissement JSON-LD, origine Emploi Territorial détectée', async () => {
    const { deps } = harness(url => {
      if (url.endsWith('/robots.txt')) return html('User-agent: *\nDisallow: /wp-admin/');
      if (isSearch(url)) return url.includes('/page/') ? html('<p>Aucune offre</p>', 200) : html(LIST);
      return url.includes('o094261002000713') ? html(OFFER_ET) : html(OFFER_PEP);
    });
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    const et = offers.find(o => o.reference === 'O094261002000713');
    expect(et?.origin).toBe('emploi_territorial');
    expect(et?.company).toBe('Département du Val-de-Marne');
    expect(et?.location).toBe('Créteil (94)');
    expect(et?.descriptionSnippet).toContain('Date limite de candidature : 2026-11-15');
    expect(et?.source).toBe('choisir_service_public');
    const pep = offers.find(o => o.reference === '2026-2222222');
    expect(pep?.origin).toBe('place_emploi_public');
  });

  test('politesse : UA honnête et au moins 1 s entre deux requêtes', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html(LIST) : html(OFFER_PEP)));
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(calls.length).toBeGreaterThan(3);
    for (const c of calls) expect(c.headers['User-Agent']).toBe(CSP_USER_AGENT);
    expect(CSP_USER_AGENT).toMatch(/^ResumeForge\/\d+\.\d+\.\d+ \(veille emploi personnelle\)$/);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(CSP_MIN_INTERVAL_MS);
    }
  });

  test('3 pages au plus par requête, 2 requêtes par intitulé (intitulé + mot discriminant)', async () => {
    const { deps, calls } = harness(url => {
      if (isSearch(url)) {
        const page = Number(/\/page\/(\d+)\//.exec(url)?.[1] ?? 1);
        return html(pageOf(page));
      }
      return html(OFFER_PEP);
    });
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(searchCalls(calls)).toHaveLength(2 * CSP_MAX_PAGES);
    expect(searchCalls(calls)[CSP_MAX_PAGES - 1].url).toContain('/page/3/');
    expect(searchCalls(calls)[0].url).toContain('/mot-cles/Charg%C3%A9%20de%20recrutement/');
    expect(searchCalls(calls)[CSP_MAX_PAGES].url).toContain('/mot-cles/recrutement/');
  });

  test('chaque requête a ses propres 3 pages', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html(pageOf(Math.random() * 1e6 | 0)) : html(OFFER_PEP)));
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ jobTitles: ['Chargé de recrutement', 'Responsable des ressources humaines'] }), deps);
    expect(searchCalls(calls)).toHaveLength(4 * CSP_MAX_PAGES); // 2 intitulés × 2 requêtes
  });

  test('arrêt dès qu\'une page ne contient que des offres déjà connues', async () => {
    const known = ['1', '2'].flatMap(n => [1, 2].map(i =>
      `https://choisirleservicepublic.gouv.fr/offre-emploi/poste-${n}-${i}-reference-2026-${n}${i}/`));
    // la page 1 est nouvelle, la page 2 entièrement connue → pas de page 3
    const { deps, calls } = harness(url => {
      if (isSearch(url)) {
        const page = Number(/\/page\/(\d+)\//.exec(url)?.[1] ?? 1);
        return html(pageOf(page === 1 ? 9 : 1));
      }
      return html(OFFER_PEP);
    }, known);
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(searchCalls(calls)).toHaveLength(4); // 2 requêtes × 2 pages
    // 2 nouvelles (enrichies) + 2 connues revues (non enrichies)
    expect(offers).toHaveLength(4);
    expect(calls.filter(c => isOffer(c.url))).toHaveLength(2);
  });

  test('page 1 entièrement connue : une seule requête de liste, aucune offre enrichie', async () => {
    const known = [1, 2].map(i =>
      `https://choisirleservicepublic.gouv.fr/offre-emploi/poste-1-${i}-reference-2026-1${i}/`);
    const { deps, calls } = harness(url => (isSearch(url) ? html(pageOf(1)) : html(OFFER_PEP)), known);
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(searchCalls(calls)).toHaveLength(2); // une page par requête
    expect(calls.filter(c => isOffer(c.url))).toHaveLength(0);
    expect(offers).toHaveLength(2); // renvoyées pour rattachement aux pistes, sans requête
  });

  test('redirection 302 suivie, sur le site seulement', async () => {
    const { deps, calls } = harness(url => {
      if (url.endsWith('/robots.txt')) return html('User-agent: *\nDisallow: /wp-admin/');
      if (url.includes('/nos-offres/')) return html(pageOf(1).slice(0, pageOf(1).indexOf('</li>') + 5) + '</ul>');
      if (url.includes('/offre-emploi/poste-1-1')) {
        return new Response(null, { status: 302, headers: { location: '/offre-emploi/nouvelle-adresse-reference-2026-777/' } });
      }
      return html(OFFER_PEP);
    });
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(calls.some(c => c.url.endsWith('/nouvelle-adresse-reference-2026-777/'))).toBe(true);
    expect(offers[0].company).toBe('Préfecture de l\'Oise');
  });

  test('redirection vers un autre domaine : non suivie, l\'offre de base est conservée', async () => {
    const { deps, calls } = harness(url => {
      if (url.endsWith('/robots.txt')) return html('User-agent: *\nDisallow: /wp-admin/');
      if (isSearch(url)) return html('<a href="/offre-emploi/a-reference-2026-1/">Chargé de recrutement A</a>');
      return new Response(null, { status: 302, headers: { location: 'https://autre.example/piege' } });
    });
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(calls.some(c => c.url.includes('autre.example'))).toBe(false);
    expect(offers).toHaveLength(1);
    expect(offers[0].company).toBeNull();
  });

  test('échec d\'enrichissement : offre de base conservée', async () => {
    const { deps } = harness(url => (isSearch(url) ? html('<a href="/offre-emploi/a-reference-2026-1/">Chargé de recrutement A</a>') : html('boom', 500)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(offers).toHaveLength(1);
    expect(offers[0].title).toBe('Chargé de recrutement A');
    expect(offers[0].origin).toBeNull();
  });

  test('403 sur une offre : les enrichissements suivants s\'arrêtent, les offres de base restent', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html(pageOf(1)) : html('', 403)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(calls.filter(c => isOffer(c.url))).toHaveLength(1);
    expect(offers).toHaveLength(2);
  });

  test('403 sur la recherche : bloquee, sans retry', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html('Forbidden', 403) : html('')));
    let failure = null;
    try { await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps); } catch (e) { failure = failureOf(e); }
    expect(failure?.kind).toBe('bloquee');
    expect(failure?.httpStatus).toBe(403);
    expect(searchCalls(calls)).toHaveLength(1);
  });

  test('page de pare-feu en 200 : bloquee', async () => {
    const { deps } = harness(url => (isSearch(url) ? html('<html><head><title>Request Rejected</title></head></html>') : html('')));
    await expect(parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps)).rejects.toMatchObject({ kind: 'bloquee' });
  });

  test('404 sur la première page : introuvable ; 404 plus loin : fin des résultats', async () => {
    const first = harness(() => html('', 404));
    await expect(parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), first.deps)).rejects.toMatchObject({ kind: 'introuvable' });

    const later = harness(url => {
      if (isSearch(url)) return url.includes('/page/2/') ? html('', 404) : html(pageOf(1));
      return html(OFFER_PEP);
    });
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), later.deps);
    expect(offers).toHaveLength(2);
  });

  test('page non reconnue : reponse_invalide, jamais « 0 offre »', async () => {
    const { deps } = harness(url => (isSearch(url) ? html('<html><body>Structure inattendue</body></html>') : html('')));
    await expect(parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps)).rejects.toMatchObject({ kind: 'reponse_invalide' });
  });

  test('« aucune offre » explicite : liste vide légitime', async () => {
    const { deps } = harness(url => (isSearch(url) ? html('<p>Aucune offre ne correspond</p>') : html('')));
    expect(await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps)).toEqual([]);
  });

  test('intitulés anglais seulement : intitules_inadaptes, aucune requête', async () => {
    const { deps, calls } = harness(() => html(''));
    await expect(parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ jobTitles: ['Talent Acquisition Specialist'] }), deps)).rejects.toMatchObject({ kind: 'intitules_inadaptes' });
    expect(calls).toHaveLength(0);
  });

  test('robots.txt interdisant la recherche : bloquee', async () => {
    const { deps, calls } = harness(url => (url.endsWith('/robots.txt') ? html('User-agent: *\nDisallow: /nos-offres/') : html(LIST)));
    await expect(parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps)).rejects.toMatchObject({ kind: 'bloquee' });
    expect(searchCalls(calls)).toHaveLength(0);
  });

  test('catégorie et lieu (identifiant interne) de la piste dans l\'URL, jamais de segment versant', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html('<p>Aucune offre</p>') : html('')));
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile({
      cspVersant: 'fpt', cspCategorie: 'A',
      location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], radiusKm: 30 },
    }), deps);
    expect(searchCalls(calls)[0].url)
      .toEndWith('/mot-cles/Charg%C3%A9%20de%20recrutement/localisation/289/categorie/1805/');
    expect(searchCalls(calls).every(c => !c.url.includes('versant'))).toBe(true);
  });

  test('rayon large : recherche sur la région (Île-de-France = 208)', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? html('<p>Aucune offre</p>') : html('')));
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile({
      location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], radiusKm: 80 },
    }), deps);
    expect(searchCalls(calls)[0].url).toContain('/localisation/208/');
  });

  test('versant filtré côté client sur la carte (le filtre d\'URL est ignoré par le site)', async () => {
    const card = (slug: string, vers: string) =>
      `<li><a href="/offre-emploi/${slug}/">Chargé de recrutement ${slug}</a><ul><li>Fonction publique : ${vers}</li><li>Employeur : X</li></ul></li>`;
    const page = `<ul>${card('a-reference-O0001', 'Fonction publique Territoriale')}${card('b-reference-DEF_1-2', "Fonction publique de l'État")}</ul>`;
    const run = (cspVersant?: 'all' | 'fpt' | 'etat') => parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ cspVersant }), harness(url => (isSearch(url) ? html(page) : html('', 500))).deps);
    expect((await run('fpt')).map(o => o.reference)).toEqual(['O0001']);
    expect((await run('etat')).map(o => o.reference)).toEqual(['DEF_1-2']);
    expect(await run('all')).toHaveLength(2);
    expect(await run()).toHaveLength(2);
  });

  test('une page sans aucune offre retenue arrête la pagination de la requête', async () => {
    const card = (n: number) =>
      `<ul><li><a href="/offre-emploi/p${n}-reference-DEF_${n}-1/">Chargé de recrutement P${n}</a><ul><li>Fonction publique : Fonction publique de l'État</li></ul></li></ul>`;
    const { deps, calls } = harness(url => (isSearch(url) ? html(card(Number(/\/page\/(\d+)\//.exec(url)?.[1] ?? 1))) : html('', 500)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile({ cspVersant: 'fpt' }), deps);
    expect(offers).toEqual([]);
    expect(searchCalls(calls)).toHaveLength(2); // une page par requête, pas de page 2
  });

  test('post-filtre : exclusions du profil et lieu connu hors zone', async () => {
    const { deps } = harness(url => {
      if (isSearch(url)) return html(LIST);
      return url.includes('o094261002000713') ? html(OFFER_ET) : html(OFFER_PEP);
    });
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['94'], city: '' } }), deps);
    // Créteil (94) reste ; Beauvais (60) est écarté ; les offres sans lieu connu restent
    expect(offers.some(o => o.location === 'Créteil (94)')).toBe(true);
    expect(offers.some(o => o.location === 'Beauvais (60)')).toBe(false);
    const excluded = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ excludeTitles: ['mobilité'] }), harness(url => (isSearch(url) ? html(LIST) : html(OFFER_PEP))).deps);
    expect(excluded.some(o => /mobilité/.test(o.title))).toBe(false);
  });
});

describe('pertinence : post-filtre avant enrichissement', () => {
  const card = (slug: string, title: string, loc = 'Yvelines (78)') =>
    `<li><a href="/offre-emploi/${slug}/">${title}</a><ul><li>Localisation : ${loc}</li><li>Fonction publique : Fonction publique Territoriale</li><li>Employeur : Communes</li></ul></li>`;
  const page = `<ul>
    ${card('a-reference-O0781', 'Chargé de recrutement et formation - H/F - Mairie de TRAPPES')}
    ${card('b-reference-O0782', 'Chargé d\'exploitation déchèterie - H/F - Mairie de X')}
    ${card('c-reference-O0783', 'Chargé de voirie')}
    ${card('d-reference-O0784', 'Chargé de recrutement (h/f)', 'Paris (75)')}
  </ul>`;

  const OFFER_78 = `<script type="application/ld+json">{"@type":"JobPosting","title":"Chargé de recrutement et formation - H/F - Mairie de TRAPPES","jobLocation":{"address":{"addressLocality":"Trappes (78), France"}}}</script>`;
  const firstPageOnly = (url: string) => (url.includes('/page/') ? html('<p>Aucune offre</p>') : html(page));

  test('les offres rejetées ne déclenchent aucune requête d\'enrichissement', async () => {
    const { deps, calls } = harness(url => (isSearch(url) ? firstPageOnly(url) : html(OFFER_78)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], radiusKm: 30 } }), deps);
    const fetched = calls.filter(c => isOffer(c.url)).map(c => c.url);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain('/a-reference-O0781/');
    expect(fetched.some(u => /b-reference|c-reference|d-reference/.test(u))).toBe(false);
    expect(offers).toHaveLength(1);
  });

  test('mesure : listées, retenues, enrichies, durée', async () => {
    const { deps } = harness(url => (isSearch(url) ? firstPageOnly(url) : html(OFFER_PEP)));
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], radiusKm: 30 } }), deps);
    const m = consumeCspMetrics();
    expect(m).toMatchObject({ listed: 4, retained: 1, enriched: 1 });
    expect(m!.listPages).toBe(4); // page 1 et page vide, pour chacune des 2 requêtes
    expect(m!.durationMs).toBeGreaterThanOrEqual(CSP_MIN_INTERVAL_MS);
    expect(consumeCspMetrics()).toBeNull(); // lue une seule fois
  });

  test('page sans offre pertinente : on s\'arrête (pas de page 2)', async () => {
    const irrelevant = `<ul>${card('z-reference-O09', 'Chargé de voirie')}</ul>`;
    const { deps, calls } = harness(url => (isSearch(url) ? html(irrelevant) : html('', 500)));
    expect(await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps)).toEqual([]);
    expect(calls.filter(c => c.url.includes('/page/'))).toHaveLength(0);
  });

  test('titre doublement encodé et préfixe numérique nettoyés dans l\'offre', async () => {
    const p = `<ul>${card('e-reference-O0785', '2026-8271 Chargé de recrutement &amp;amp; mobilité')}</ul>`;
    const { deps } = harness(url => (isSearch(url) ? html(p) : html('', 500)));
    const [o] = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    expect(o.title).toBe('Chargé de recrutement & mobilité');
  });

  test('employeur : catégorie dans employerType, company vide sans suffixe d\'employeur', async () => {
    const p = `<ul>${card('f-reference-O0786', 'Chargé de recrutement - Finances publiques (H/F)')}${card('g-reference-O0787', 'Chargé de recrutement - Mairie de TRAPPES')}</ul>`;
    const { deps } = harness(url => (isSearch(url) ? html(p) : html('', 500)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), deps);
    const byRef = (r: string) => offers.find(o => o.reference === r)!;
    expect(byRef('O0786').company).toBeNull();
    expect(byRef('O0786').employerType).toBe('Communes');
    expect(byRef('O0787').company).toBe('Mairie de TRAPPES');
  });
});

describe('zone : le post-filtre suit la requête', () => {
  const card = (slug: string, loc: string) =>
    `<li><a href="/offre-emploi/${slug}/">Chargé de recrutement ${slug}</a><ul><li>Localisation : ${loc}</li><li>Fonction publique : Fonction publique Territoriale</li><li>Employeur : Communes</li></ul></li>`;
  const page = `<ul>${card('val-de-marne-reference-O094', 'Val de Marne (94)')}${card('yvelines-reference-O078', 'Yvelines (78)')}${card('isere-reference-O038', 'Isère (38)')}</ul>`;
  const run = async (radiusKm: number, departmentCodes = ['78']) => {
    const { deps, calls } = harness(url => (isSearch(url) ? (url.includes('/page/') ? html('<p>Aucune offre</p>') : html(page)) : html('', 500)));
    const offers = await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS,
      profile({ location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes, radiusKm } }), deps);
    return { locations: offers.map(o => o.location), calls };
  };

  test('78, rayon 60 (recherche sur la région 208) : une offre du Val-de-Marne est gardée', async () => {
    const { locations, calls } = await run(60);
    expect(searchCalls(calls)[0].url).toContain('/localisation/208/');
    expect(locations).toContain('Val de Marne (94)');
    expect(locations).toContain('Yvelines (78)');
  });

  test('78, rayon 30 (recherche départementale) : la même offre est écartée', async () => {
    const { locations, calls } = await run(30);
    expect(searchCalls(calls)[0].url).toContain('/localisation/289/');
    expect(locations).not.toContain('Val de Marne (94)');
    expect(locations).toContain('Yvelines (78)');
  });

  test('une offre hors région (Isère) est écartée dans les deux cas', async () => {
    expect((await run(60)).locations).not.toContain('Isère (38)');
    expect((await run(30)).locations).not.toContain('Isère (38)');
  });

  test('plusieurs départements d\'une même région : toute la région est acceptée', async () => {
    const { locations } = await run(30, ['78', '92']);
    expect(locations).toContain('Val de Marne (94)');
    expect(locations).not.toContain('Isère (38)');
  });
});

describe('plafond de requêtes de liste', () => {
  const many = (n: number) =>
    `<ul>${[1, 2].map(i => `<li><a href="/offre-emploi/r${n}-${i}-reference-O0${n}${i}/">Chargé de recrutement r${n}-${i}</a></li>`).join('')}</ul>`;
  const titles = ['Chargé de recrutement', 'Responsable des ressources humaines', 'Gestionnaire de paie', 'Chargé de formation', 'Chef de projet numérique'];
  let counter = 0;
  const respond = (url: string) => (isSearch(url) ? html(many(++counter)) : html('', 500));

  test('au plus 20 pages de liste par collecte, journalisé', async () => {
    const { deps, calls } = harness(respond);
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile({ jobTitles: titles }), deps);
    expect(searchCalls(calls)).toHaveLength(CSP_MAX_LIST_REQUESTS);
    expect(consumeCspMetrics()).toMatchObject({ capped: true, listPages: CSP_MAX_LIST_REQUESTS });
  });

  test('le plafond est partagé entre les pistes d\'une même collecte, puis repart de zéro', async () => {
    const first = harness(respond);
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile({ jobTitles: titles }), first.deps);
    const second = harness(respond);
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), second.deps);
    expect(searchCalls(second.calls)).toHaveLength(0);
    expect(consumeCspMetrics()).toMatchObject({ capped: true });

    resetCspCollectionBudget();
    const third = harness(respond);
    await parseChoisirServicePublic(config, DEFAULT_JOB_WATCH_SETTINGS, profile(), third.deps);
    expect(searchCalls(third.calls).length).toBeGreaterThan(0);
    expect(consumeCspMetrics()).toMatchObject({ capped: false });
  });
});

describe('buildCspOffer', () => {
  const base = { title: 'X', location: null, employer: null, versant: null, publishedAt: null };
  test('sans enrichissement ni versant : pas d\'origine inventée', () => {
    const o = buildCspOffer({ ...base, url: 'https://choisirleservicepublic.gouv.fr/offre-emploi/x-reference-2026-5/' }, null);
    expect(o.origin).toBeNull();
    expect(o.reference).toBe('2026-5');
  });
  test('sans enrichissement mais référence O0… dans l\'adresse : Emploi Territorial', () => {
    const o = buildCspOffer({ ...base, url: 'https://choisirleservicepublic.gouv.fr/offre-emploi/x-reference-o0942610020/' }, null);
    expect(o.origin).toBe('emploi_territorial');
  });
  test('sans enrichissement, le versant de la carte donne l\'origine', () => {
    const url = 'https://choisirleservicepublic.gouv.fr/offre-emploi/x-reference-DEF_1-2/';
    expect(buildCspOffer({ ...base, url, versant: 'etat' }, null).origin).toBe('place_emploi_public');
    expect(buildCspOffer({ ...base, url, versant: 'fpt' }, null).origin).toBe('emploi_territorial');
  });
});
