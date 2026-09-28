/**
 * Validation croisée, deux usages.
 *
 * 1. Texte : compare le texte d'un PDF exporté depuis l'app réelle à la
 *    référence golden, avec la même méthode d'extraction que le banc.
 *
 *      bun run test:golden:compare <chemin.pdf> <fixture> <template>
 *      ex. bun run test:golden:compare ~/cv_export.pdf anonymized-real ats-classic
 *
 *    Pour charger une fixture dans l'app, voir make-backup.ts et le README.
 *
 * 2. Retours à la ligne : compare la mesure de l'app (window.__RF_PRINT_OVERFLOW__,
 *    exposée en développement) au PDF exporté du même CV, ligne par ligne.
 *
 *      bun run test:golden:compare -- --lines <mesure.json> <chemin.pdf>
 *
 *    Codes de retour : 0 = mêmes retours à la ligne ; 1 = lignes coupées
 *    autrement ; 2 = la mesure et le PDF ne portent pas sur le même CV (ou
 *    fichier de mesure invalide). Procédure : tests/golden/README.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkLineBreaks, extractPdfText, norm } from './lib/extract';
import { lineDiff } from './lib/diff';
import { PRINT_CV_WIDTH_PX, linesSha256, visibleLines, type MeasureSnapshot } from '../../src/lib/print-overflow';

/** Part minimale des lignes mesurées retrouvées dans le texte du PDF pour conclure au même CV. */
const SAME_CV_MIN_RATIO = 0.9;

async function compareLines(measurePath: string, pdfPath: string): Promise<number> {
  let m: MeasureSnapshot;
  try {
    m = JSON.parse(readFileSync(resolve(measurePath), 'utf8')) as MeasureSnapshot;
    if (!Array.isArray(m.lines) || !m.fingerprint) throw new Error('champs lines/fingerprint absents');
  } catch (e) {
    console.error(`Fichier de mesure invalide : ${(e as Error).message}`);
    return 2;
  }
  const sha = await linesSha256(m.lines);
  if (sha !== m.fingerprint.sha256) {
    console.error('Fichier de mesure incohérent : l\'empreinte ne correspond pas aux lignes (copie tronquée ou modifiée ?).');
    return 2;
  }
  const { pages, text, firstPage } = await extractPdfText(new Uint8Array(readFileSync(resolve(pdfPath))));
  const visible = visibleLines(m.lines).filter((l) => norm(l.text));
  console.log(`Mesure : ${resolve(measurePath)} — ${m.fingerprint.visibleLines} ligne(s) visible(s), SHA-256 ${sha.slice(0, 16)}…`);
  console.log(`PDF : ${resolve(pdfPath)} (${pages} page(s))`);
  console.log(`Largeur du CV dans la mesure : ${m.measuredCvWidthPx} px (imposée : ${m.printCvWidthPx} px ; banc : ${PRINT_CV_WIDTH_PX} px) — devicePixelRatio ${m.devicePixelRatio}`);

  // 1. Correspondance : même CV ?
  const pdf = norm(text.replace(/^=== page \d+ ===$/gm, ''));
  const found = visible.filter((l) => pdf.includes(norm(l.text))).length;
  const ratio = visible.length ? found / visible.length : 0;
  const first = m.fingerprint.firstVisibleLine, last = m.fingerprint.lastVisibleLine;
  const missing = [first, last].filter((l): l is string => !!l && !pdf.includes(norm(l)));
  if (missing.length || ratio < SAME_CV_MIN_RATIO) {
    console.error('\nla mesure et le PDF ne portent pas sur le même CV (modifié entre la copie et l\'export ?)');
    for (const l of missing) console.error(`  - ${l === first ? 'première' : 'dernière'} ligne visible absente du PDF : « ${l} »`);
    console.error(`  - lignes mesurées retrouvées dans le PDF : ${found}/${visible.length} (${Math.round(ratio * 100)} %, minimum ${SAME_CV_MIN_RATIO * 100} %)`);
    return 2;
  }
  console.log(`Correspondance : ${found}/${visible.length} lignes mesurées retrouvées dans le PDF, première et dernière comprises.`);

  // 2. Retours à la ligne, comme le banc.
  const diffs = checkLineBreaks(m.lines, firstPage);
  if (!diffs.length) {
    console.log(`\nRetours à la ligne IDENTIQUES : ${visible.length} ligne(s) mesurée(s) retrouvée(s) mot pour mot dans le PDF.`);
    return 0;
  }
  console.log(`\nRetours à la ligne DIFFÉRENTS (${diffs.length} ligne(s)) :\n  ${diffs.join('\n  ')}`);
  return 1;
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const linesIdx = args.indexOf('--lines');
if (linesIdx >= 0) {
  const measurePath = args[linesIdx + 1];
  const pdfArg = args.filter((_, i) => i !== linesIdx && i !== linesIdx + 1)[0];
  if (!measurePath || !pdfArg) {
    console.error('Usage : bun run test:golden:compare -- --lines <mesure.json> <chemin.pdf>');
    process.exit(2);
  }
  process.exit(await compareLines(measurePath, pdfArg));
}

const [pdfPath, fixture, template] = args;
if (!pdfPath || !fixture || !template) {
  console.error('Usage : bun run test:golden:compare <chemin.pdf> <fixture> <template>\n        bun run test:golden:compare -- --lines <mesure.json> <chemin.pdf>');
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
