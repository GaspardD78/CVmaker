/**
 * Vérifications d'environnement exécutées au démarrage :
 * - intégrité des polices versionnées (SHA-256) ;
 * - correspondance fontconfig des polices des templates vers leurs équivalents métriques.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FONTCONFIG_FILE } from './render';

const FONTS_DIR = join(import.meta.dir, '..', 'fonts');

/** Polices versionnées et leur empreinte (source : README, section Polices). */
export const VENDORED_FONTS: Record<string, string> = {
  'Gelasio-wght.ttf': '4daecea457258c9ebeb8bc99ed3fd24353618bfad3ea4b93fa0b5d0468fc04e4',
  'Gelasio-Italic-wght.ttf': '52559e845a4d33514e5f93bb9ae7dbeae1894a53f2c565a15f18af40cd337c09',
};

/** Police demandée par les templates → famille attendue après résolution fontconfig. */
const EXPECTED_MATCH: [string, string][] = [
  ['Calibri', 'Carlito'],
  ['Calibri:bold', 'Carlito'],
  ['Cambria', 'Caladea'],
  ['Cambria:bold', 'Caladea'],
  ['Georgia', 'Gelasio'],
  ['Georgia:bold', 'Gelasio'],
  ['Georgia:italic', 'Gelasio'],
  ['Arial', 'Liberation Sans'],
  ['Helvetica', 'Liberation Sans'],
  ['Times New Roman', 'Liberation Serif'],
];

export function checkEnvironment(): string[] {
  const errors: string[] = [];
  for (const [file, sha] of Object.entries(VENDORED_FONTS)) {
    let actual = '';
    try { actual = createHash('sha256').update(readFileSync(join(FONTS_DIR, file))).digest('hex'); }
    catch { errors.push(`Police manquante : fonts/${file}`); continue; }
    if (actual !== sha) errors.push(`SHA-256 inattendu pour fonts/${file} : ${actual} (attendu ${sha})`);
  }
  for (const [pattern, family] of EXPECTED_MATCH) {
    const r = spawnSync('fc-match', ['-f', '%{family}', pattern], { env: { ...process.env, FONTCONFIG_FILE }, encoding: 'utf8' });
    if (r.error) { errors.push(`fc-match introuvable (paquet fontconfig) : ${r.error.message}`); break; }
    const got = r.stdout.trim();
    if (!got.split(',').includes(family)) errors.push(`fc-match « ${pattern} » → « ${got} », attendu « ${family} » (voir README, section Installation)`);
  }
  return errors;
}
