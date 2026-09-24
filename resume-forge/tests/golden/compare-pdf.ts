/**
 * Validation croisée : compare le texte d'un PDF exporté depuis l'app réelle
 * à la référence golden, avec la même méthode d'extraction que le banc.
 *
 *   bun run test:golden:compare <chemin.pdf> <fixture> <template>
 *   ex. bun run test:golden:compare ~/cv_export.pdf anonymized-real ats-classic
 *
 * Pour charger une fixture dans l'app, voir make-backup.ts et le README.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractPdfText } from './lib/extract';
import { lineDiff } from './lib/diff';

const [pdfPath, fixture, template] = process.argv.slice(2);
if (!pdfPath || !fixture || !template) {
  console.error('Usage : bun run test:golden:compare <chemin.pdf> <fixture> <template>');
  process.exit(2);
}
const refPath = join(import.meta.dir, 'references', fixture, template, 'text.txt');
if (!existsSync(refPath)) {
  console.error(`Référence introuvable : ${refPath}`);
  process.exit(2);
}

const { pages, text } = await extractPdfText(new Uint8Array(readFileSync(resolve(pdfPath))));
const ref = readFileSync(refPath, 'utf8');
const refPages = (ref.match(/^=== page \d+ ===$/gm) ?? []).length;

console.log(`PDF : ${resolve(pdfPath)} (${pages} page(s))`);
console.log(`Référence : references/${fixture}/${template}/text.txt (${refPages} page(s))\n`);
if (text === ref) {
  console.log('Texte IDENTIQUE à la référence (mêmes retours à la ligne, même pagination).');
  process.exit(0);
}
const d = lineDiff(ref, text);
console.log(`Texte DIFFÉRENT (${d.filter((l) => l.startsWith('- ')).length} ligne(s) de la référence, ${d.filter((l) => l.startsWith('+ ')).length} ligne(s) du PDF) :`);
console.log('  (- = référence golden, + = PDF de l\'app)\n');
console.log(d.join('\n'));
process.exit(1);
