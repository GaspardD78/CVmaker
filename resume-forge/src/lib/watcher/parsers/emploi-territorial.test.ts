/**
 * Emploi Territorial — échecs de source (spec 006, phase 3).
 *
 * Ni le DOM ni le runtime Tauri n'existent sous bun:test : on simule la couche
 * réseau la plus basse (`@tauri-apps/plugin-http`) et on ne teste que les
 * chemins d'échec, qui s'arrêtent avant l'analyse XML.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

let responder: (url: string) => Response = () => new Response('', { status: 200 });
let calls: string[] = [];

mock.module('@tauri-apps/plugin-http', () => ({
  fetch: async (url: string) => { calls.push(url); return responder(url); },
}));

import { parseEmploiTerritorial } from './emploi-territorial';
import { __resetAllCircuitsForTests } from '../http-client';
import { failureOf } from '../source-status';
import { DEFAULT_JOB_WATCH_SETTINGS, DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import type { JobWatchConfig, SearchProfile } from '@/types/job-watch';

const config: JobWatchConfig = {
  id: 'c', alertId: 'a', source: 'emploi_territorial', rssUrl: null, enabled: 1, lastFetchedAt: null, createdAt: '',
};
const profile = (jobTitles: string[]): SearchProfile => ({
  ...DEFAULT_SEARCH_PROFILE, jobTitles,
  location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], city: 'Versailles' },
});

const REJECTED = '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.</body></html>';

async function failureFor(p: SearchProfile) {
  try {
    await parseEmploiTerritorial(config, DEFAULT_JOB_WATCH_SETTINGS, p);
  } catch (e) {
    return failureOf(e);
  }
  return null;
}

beforeEach(() => {
  __resetAllCircuitsForTests();
  calls = [];
  responder = () => new Response('', { status: 200 });
});

describe('parseEmploiTerritorial — échecs', () => {
  test('page « Request Rejected » en 200 : bloquee, pas de repli sur le flux global', async () => {
    responder = () => new Response(REJECTED, { status: 200 });
    const failure = await failureFor(profile(['Chargé de recrutement']));
    expect(failure?.kind).toBe('bloquee');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('q=');
  });

  test('flux filtré et flux global en 404 : introuvable, un seul message', async () => {
    responder = () => new Response('not found', { status: 404 });
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn;
    try {
      const failure = await failureFor(profile(['Recruteur']));
      expect(failure?.kind).toBe('introuvable');
      expect(failure?.httpStatus).toBe(404);
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(2); // filtré puis global
    expect(warn).not.toHaveBeenCalled(); // pas de « repli » annoncé alors qu'il n'a pas abouti
  });

  test('403 sur le flux filtré : bloquee, le global n\'est pas interrogé', async () => {
    responder = () => new Response('forbidden', { status: 403 });
    const failure = await failureFor(profile(['Recruteur']));
    expect(failure?.kind).toBe('bloquee');
    expect(calls).toHaveLength(1);
  });

  test('aucun intitulé français : intitules_inadaptes, aucune requête', async () => {
    const failure = await failureFor(profile(['Talent Acquisition', 'Tech Recruiter']));
    expect(failure?.kind).toBe('intitules_inadaptes');
    expect(calls).toHaveLength(0);
  });
});
