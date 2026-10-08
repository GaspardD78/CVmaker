import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adviceFor, displayStatus, SOURCE_STATUS_LABELS, UNAVAILABLE_SOURCES } from './source-status';
import { SETUP_WIZARD_SOURCES } from './sources';
import { buildSourceCoverage, renderCoverageSection } from './source-coverage';
import type { JobSource } from '@/types/job-watch';

const MESSAGE =
  'Emploi Territorial bloque les accès automatiques et son API est réservée aux collectivités. ' +
  'Créez une alerte e-mail sur emploi-territorial.fr.';

describe('migration 024 : Emploi Territorial désactivé sans perte de configuration', () => {
  const sql = readFileSync(join(__dirname, '../../../src-tauri/migrations/024_emploi_territorial_unavailable.sql'), 'utf8');

  function seed(): Database {
    const db = new Database(':memory:');
    db.run(`CREATE TABLE job_watch_config (
      id INTEGER PRIMARY KEY, source TEXT, rss_url TEXT, enabled INTEGER, alert_id TEXT)`);
    db.run(`INSERT INTO job_watch_config (source, rss_url, enabled, alert_id) VALUES
      ('emploi_territorial', 'https://www.emploi-territorial.fr/rss/custom.rss', 1, 'A'),
      ('emploi_territorial', NULL, 1, 'B'),
      ('apec', NULL, 1, 'A'),
      ('wttj', NULL, 0, 'A')`);
    return db;
  }

  it('passe enabled à 0 pour emploi_territorial, sur toutes les pistes', () => {
    const db = seed();
    db.run(sql);
    const rows = db.query(`SELECT enabled FROM job_watch_config WHERE source = 'emploi_territorial'`).all() as { enabled: number }[];
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.enabled === 0)).toBe(true);
  });

  it('ne supprime aucune configuration et conserve l\'URL de flux', () => {
    const db = seed();
    db.run(sql);
    expect((db.query('SELECT COUNT(*) AS n FROM job_watch_config').get() as { n: number }).n).toBe(4);
    const custom = db.query(`SELECT rss_url, alert_id FROM job_watch_config WHERE alert_id = 'A' AND source = 'emploi_territorial'`).get() as { rss_url: string };
    expect(custom.rss_url).toBe('https://www.emploi-territorial.fr/rss/custom.rss');
  });

  it('ne touche pas aux autres sources', () => {
    const db = seed();
    db.run(sql);
    const apec = db.query(`SELECT enabled FROM job_watch_config WHERE source = 'apec'`).get() as { enabled: number };
    expect(apec.enabled).toBe(1);
  });
});

describe('statut « Indisponible »', () => {
  it('prime sur le dernier journal et affiche le message prévu', () => {
    expect(displayStatus('emploi_territorial', 'bloquee')).toBe('indisponible');
    expect(displayStatus('emploi_territorial', 'ok')).toBe('indisponible');
    expect(displayStatus('apec', 'bloquee')).toBe('bloquee');
    expect(SOURCE_STATUS_LABELS.indisponible).toBe('Indisponible');
    expect(adviceFor('indisponible', 'emploi_territorial')).toBe(MESSAGE);
    expect(UNAVAILABLE_SOURCES.emploi_territorial).toBe(MESSAGE);
  });

  it('l\'assistant de configuration ne la propose plus', () => {
    expect(SETUP_WIZARD_SOURCES).not.toContain('emploi_territorial');
    expect(SETUP_WIZARD_SOURCES).toContain('apec');
  });

  it('les prompts la signalent hors d\'atteinte, sans la mettre dans les sources à réparer', () => {
    const c = buildSourceCoverage({
      lastLogBySource: new Map(),
      configuredSources: new Set<JobSource>(['emploi_territorial']),
      sampleSources: [],
    });
    expect(c.rows.find(r => r.source === 'emploi_territorial')!.status).toBe('indisponible');
    expect(c.toFix.map(f => f.label)).not.toContain('Emploi Territorial');
    // Intégration avec la spec 007 : une source indisponible mais couverte est présentée comme telle.
    expect(renderCoverageSection(c)).toContain('couvert via Choisir le service public');
  });
});
