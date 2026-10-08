import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../src-tauri/migrations');
const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
const numbers = files.map(f => Number(f.match(/^(\d+)_/)?.[1]));

describe('migrations SQL', () => {
  it('chaque fichier est nommé NNN_description.sql', () => {
    for (const f of files) expect(f).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
  });

  it('les numéros sont uniques', () => {
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('les numéros sont consécutifs, de 1 à N', () => {
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('lib.rs déclare chaque fichier avec la même version', () => {
    const lib = readFileSync(join(__dirname, '../../src-tauri/src/lib.rs'), 'utf8');
    for (const f of files) {
      const version = Number(f.slice(0, 3));
      const re = new RegExp(`version: ${version},[^}]*?include_str!\\("\\.\\./migrations/${f}"\\)`, 's');
      expect(lib).toMatch(re);
    }
  });
});
