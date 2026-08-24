/**
 * Tests de la composition du digest sectionné par piste.
 *
 * Le rendu HTML n'est pas figé ici : on vérifie la logique de répartition,
 * qui est ce qui peut réellement mentir à l'utilisateur — une offre comptée
 * deux fois, une piste silencieusement omise, un score qui n'est pas celui de
 * la section.
 */

import { describe, expect, test, mock } from 'bun:test';

// email-digest importe l'API Tauri pour l'envoi ; on neutralise la feuille.
mock.module('@tauri-apps/api/core', () => ({ invoke: async () => {} }));

import { buildDigestSections, buildEmailHtml } from './email-digest';
import type { JobOfferWithAlerts, JobWatchAlert, OfferAlertLink } from '@/types/job-watch';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';

function alert(id: string, name: string, position: number): JobWatchAlert {
  return {
    id, name, color: '#6366f1', kind: 'core', position, enabled: 1,
    searchProfile: { ...DEFAULT_SEARCH_PROFILE, name },
    aiFilterRule: null, learnedDict: { positive: {}, negative: {} },
    companyReputation: {}, learnedDecayedAt: null, lastFetchedAt: null,
    createdAt: '', sources: [],
  };
}

function offer(title: string, score: number, links: OfferAlertLink[]): JobOfferWithAlerts {
  return {
    id: title, source: 'apec', url: `https://x.test/${title}`, hash: title,
    title, company: 'Acme', location: 'Paris',
    locationLat: null, locationLon: null, contractType: 'CDI',
    descriptionSnippet: null, publishedAt: null, fetchedAt: '2026-01-01',
    score, commuteMinutes: null, commuteStatus: 'pending',
    salaryMin: null, salaryMax: null, salaryRaw: null,
    isRead: 0, isArchived: 0, archivedAt: null, kanbanId: null,
    alerts: links,
  };
}

const link = (alertId: string, score: number): OfferAlertLink =>
  ({ alertId, score, matchedAt: '2026-01-01' });

describe('buildDigestSections', () => {
  const alerts = [alert('a', 'Piste RH', 0), alert('b', 'Piste Ops', 1)];

  test('les sections suivent l\'ordre du portefeuille', () => {
    const sections = buildDigestSections([], [alert('b', 'Piste Ops', 1), alert('a', 'Piste RH', 0)]);
    expect(sections.map(s => s.name)).toEqual(['Piste RH', 'Piste Ops']);
  });

  test('une piste sans nouvelle offre garde sa section', () => {
    const sections = buildDigestSections([offer('o1', 80, [link('a', 80)])], alerts);
    expect(sections).toHaveLength(2);
    expect(sections[1].offers).toHaveLength(0);
  });

  test('une offre multi-pistes n\'apparaît qu\'une fois, dans sa meilleure section', () => {
    const sections = buildDigestSections(
      [offer('o1', 80, [link('a', 45), link('b', 80)])],
      alerts,
    );
    expect(sections[0].offers).toHaveLength(0);
    expect(sections[1].offers).toHaveLength(1);
    // Le score affiché est celui de la piste qui l'accueille.
    expect(sections[1].offers[0].score).toBe(80);
    expect(sections[1].offers[0].alsoIn).toEqual(['Piste RH']);
  });

  test('les offres d\'une section sont triées par le score de cette piste', () => {
    const sections = buildDigestSections(
      [
        offer('faible', 30, [link('a', 30)]),
        offer('fort', 90, [link('a', 90)]),
        offer('moyen', 60, [link('a', 60)]),
      ],
      alerts,
    );
    expect(sections[0].offers.map(o => o.offer.title)).toEqual(['fort', 'moyen', 'faible']);
  });

  test('une offre orpheline est regroupée en fin de digest, jamais perdue', () => {
    const sections = buildDigestSections([offer('orpheline', 50, [])], alerts);
    expect(sections).toHaveLength(3);
    expect(sections[2].name).toBe('Non rattachées');
    expect(sections[2].offers).toHaveLength(1);
  });

  test('un rattachement vers une piste supprimée est ignoré', () => {
    const sections = buildDigestSections(
      [offer('o1', 50, [link('disparue', 90), link('a', 50)])],
      alerts,
    );
    expect(sections[0].offers).toHaveLength(1);
    expect(sections[0].offers[0].score).toBe(50);
    expect(sections[0].offers[0].alsoIn).toEqual([]);
  });
});

describe('buildEmailHtml', () => {
  const alerts = [alert('a', 'Piste RH', 0), alert('b', 'Piste Ops', 1)];

  test('le total annoncé ne double pas les offres multi-pistes', () => {
    const sections = buildDigestSections(
      [offer('o1', 80, [link('a', 45), link('b', 80)])],
      alerts,
    );
    const html = buildEmailHtml(sections, '1er janvier 2026');
    expect(html).toContain('1 nouvelle offre détectée');
    // Une seule carte, donc un seul lien « Voir l'offre ».
    expect(html.split("Voir l'offre").length - 1).toBe(1);
  });

  test('les noms de pistes et la mention « Aussi » apparaissent', () => {
    const sections = buildDigestSections(
      [offer('o1', 80, [link('a', 45), link('b', 80)])],
      alerts,
    );
    const html = buildEmailHtml(sections, '1er janvier 2026');
    expect(html).toContain('Piste Ops');
    expect(html).toContain('Aussi : Piste RH');
    expect(html).toContain('Aucune nouvelle offre sur cette piste.');
  });

  test('le contenu des offres est échappé', () => {
    const evil = offer('<script>alert(1)</script>', 50, [link('a', 50)]);
    const html = buildEmailHtml(buildDigestSections([evil], alerts), 'date');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('une URL hostile ne peut pas sortir de l\'attribut href', () => {
    // Les URLs viennent de pages tierces scrapées : un guillemet permettrait
    // d'injecter du balisage dans l'email.
    const evil = offer('offre', 50, [link('a', 50)]);
    evil.url = 'https://x.test/"><img src=x onerror=alert(1)>';
    const html = buildEmailHtml(buildDigestSections([evil], alerts), 'date');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&quot;&gt;');
  });

  test('un schéma non http est neutralisé', () => {
    const evil = offer('offre', 50, [link('a', 50)]);
    evil.url = 'javascript:alert(1)';
    const html = buildEmailHtml(buildDigestSections([evil], alerts), 'date');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });
});
