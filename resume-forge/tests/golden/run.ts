/**
 * Golden tests du rendu PDF des CV.
 *
 *   bun run test:golden                 compare le rendu actuel aux références
 *   bun run test:golden -- --update     régénère les références
 *   bun run test:golden -- --only tech  ne traite que les cas dont l'id contient « tech »
 *
 * Voir tests/golden/README.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TEMPLATE_ORDER } from '../../src/templates';
import { fixtureTemplates, loadFixture } from './lib/fixtures';
import { extractPdfText } from './lib/extract';
import { GoldenRenderer, OUT_DIR, type PageStats } from './lib/render';
import { lineDiff } from './lib/diff';
import { checkEnvironment } from './lib/env-check';

const GOLDEN_DIR = import.meta.dir;
const PROJECT_DIR = resolve(GOLDEN_DIR, '../..');
const REF_DIR = join(GOLDEN_DIR, 'references');

// ── Seuils de comparaison visuelle ──────────────────────────────────────────
// Un pixel est « différent » si une composante RVBA s'écarte de plus de
// PIXEL_TOLERANCE ; une page échoue si la proportion de pixels différents
// dépasse MAX_DIFF_RATIO. Calibrage (README, section Seuils) : sur 5 passes
// × 37 pages, le bruit maximal observé est de 5 px par page (écart de
// composante jusqu'à 27, anti-aliasing d'un bord de glyphe). Tolérance de
// composante nulle (un changement de couleur, même léger, compte) et au plus
// 1e-5 de la page, soit 8 px sur 794 × 1123.
export const PIXEL_TOLERANCE = 0;
export const MAX_DIFF_RATIO = 0.00001;

const BASE_TZ = 'Europe/Paris';
const NEGATIVE_TZ = 'America/New_York';
const BASE_FIXTURES = ['anonymized-real', 'long-titles', 'minimal'];
const DERIVED_FIXTURES = ['my-settings'];
/** Variante fuseau négatif : un template par famille de layout (toutes les dates passent par CVEntryBlock). */
const TZ_TEMPLATES = ['ats-classic', 'sidebar-modern'];

interface GoldenCase { id: string; suite: string; fixture: string; template: string; timezoneId: string }

function buildCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const fixture of BASE_FIXTURES)
    for (const template of TEMPLATE_ORDER)
      cases.push({ id: `${fixture}/${template}`, suite: fixture, fixture, template, timezoneId: BASE_TZ });
  for (const fixture of DERIVED_FIXTURES)
    for (const template of fixtureTemplates(fixture) ?? [])
      cases.push({ id: `${fixture}/${template}`, suite: fixture, fixture, template, timezoneId: BASE_TZ });
  for (const template of TZ_TEMPLATES)
    cases.push({ id: `tz-new-york/${template}`, suite: 'tz-new-york', fixture: 'anonymized-real', template, timezoneId: NEGATIVE_TZ });
  return cases;
}

/**
 * Comportement connu (NOTES.md §3) : une date « AAAA-MM » est lue en UTC puis
 * affichée en heure locale ; dans un fuseau négatif elle recule d'un mois
 * (et d'une année pour janvier en affichage année seule). Ces assertions
 * figent le bug ; elles devront être inversées par le lot « dates ».
 */
const KNOWN_TZ_SHIFTS: { paris: string; newYork: string; what: string }[] = [
  { what: 'expérience, mois (2020-03)', paris: 'mars 2020', newYork: 'février 2020' },
  { what: 'expérience, janvier (2016-01)', paris: 'janvier 2016', newYork: 'décembre 2015' },
  { what: 'formation, année seule (2007-01)', paris: '2007 -', newYork: '2006 -' },
];

function listPngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
}

interface CaseResult {
  id: string;
  ok: boolean;
  problems: string[];
  pages: number;
  pageStats: (Omit<PageStats, 'diffPng'> & { page: number; ratio: number })[];
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  const envErrors = checkEnvironment();
  if (envErrors.length) {
    console.error('Environnement invalide :\n  - ' + envErrors.join('\n  - '));
    process.exit(2);
  }

  console.log('Build de la page de test (vite)…');
  const build = spawnSync('bunx', ['vite', 'build', '--config', 'tests/golden/vite.golden.config.ts'], { cwd: PROJECT_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  if (build.status !== 0) { console.error('Échec du build de la page de test.'); process.exit(2); }

  const cases = buildCases().filter((c) => !only || c.id.includes(only));
  const renderer = new GoldenRenderer();
  await renderer.start();
  console.log(`Chromium ${renderer.chromiumVersion()} — ${cases.length} cas — mode ${update ? 'MISE À JOUR des références' : 'comparaison'}\n`);

  const results: CaseResult[] = [];
  const texts = new Map<string, string>();
  try {
    for (const c of cases) {
      const outDir = join(OUT_DIR, 'cases', c.suite, c.template);
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      const refDir = join(REF_DIR, c.suite, c.template);

      const { data } = loadFixture(c.fixture, c.template);
      const { pdf } = await renderer.renderPdf(data, c.timezoneId, outDir);
      writeFileSync(join(outDir, 'actual.pdf'), pdf);
      const { pages, text } = await extractPdfText(pdf);
      texts.set(c.id, text);
      writeFileSync(join(outDir, 'text.txt'), text);
      const pngs = await renderer.rasterize(pdf);
      pngs.forEach((png, k) => writeFileSync(join(outDir, `page-${k + 1}.png`), png));

      const result: CaseResult = { id: c.id, ok: true, problems: [], pages, pageStats: [] };

      if (update) {
        rmSync(refDir, { recursive: true, force: true });
        mkdirSync(refDir, { recursive: true });
        writeFileSync(join(refDir, 'text.txt'), text);
        pngs.forEach((png, k) => writeFileSync(join(refDir, `page-${k + 1}.png`), png));
      } else if (!existsSync(join(refDir, 'text.txt'))) {
        result.ok = false;
        result.problems.push('référence absente (lancer avec --update)');
      } else {
        const refText = readFileSync(join(refDir, 'text.txt'), 'utf8');
        const refPngs = listPngs(refDir);
        if (refPngs.length !== pngs.length) {
          result.ok = false;
          result.problems.push(`nombre de pages : ${pngs.length} au lieu de ${refPngs.length}`);
        }
        if (refText !== text) {
          result.ok = false;
          const d = lineDiff(refText, text);
          writeFileSync(join(outDir, 'text.diff'), d.join('\n') + '\n');
          result.problems.push(`texte différent :\n      ${d.slice(0, 20).join('\n      ')}${d.length > 20 ? '\n      …' : ''}`);
        }
        for (let k = 0; k < Math.min(refPngs.length, pngs.length); k++) {
          const stats = await renderer.comparePng(readFileSync(join(refDir, refPngs[k])), pngs[k], PIXEL_TOLERANCE);
          const { diffPng, ...rest } = stats;
          const ratio = rest.overTolerance / rest.totalPixels;
          result.pageStats.push({ page: k + 1, ratio, ...rest });
          if (diffPng) writeFileSync(join(outDir, `diff-${k + 1}.png`), Buffer.from(diffPng.split(',')[1], 'base64'));
          if (rest.sizeMismatch || ratio > MAX_DIFF_RATIO) {
            result.ok = false;
            result.problems.push(`page ${k + 1} : ${rest.overTolerance} px au-delà de la tolérance (${(ratio * 100).toFixed(4)} %, écart max ${rest.maxDelta})${rest.sizeMismatch ? ', dimensions différentes' : ''}`);
          }
        }
      }
      results.push(result);
      console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${c.id.padEnd(34)} ${pages} p.${result.problems.map((p) => `\n    - ${p}`).join('')}`);
    }
  } finally {
    await renderer.stop();
  }

  // ── Comportement connu : décalage de date en fuseau négatif ──────────────
  const tzProblems: string[] = [];
  for (const template of TZ_TEMPLATES) {
    const ny = texts.get(`tz-new-york/${template}`);
    if (ny === undefined) continue;
    const parisPath = join(REF_DIR, 'anonymized-real', template, 'text.txt');
    const paris = texts.get(`anonymized-real/${template}`) ?? (existsSync(parisPath) ? readFileSync(parisPath, 'utf8') : undefined);
    for (const s of KNOWN_TZ_SHIFTS) {
      if (paris !== undefined && !paris.includes(s.paris)) tzProblems.push(`${template} / Paris : « ${s.paris} » attendu (${s.what})`);
      if (!ny.includes(s.newYork)) tzProblems.push(`${template} / New York : « ${s.newYork} » attendu (${s.what})`);
      if (ny.includes(s.paris)) tzProblems.push(`${template} / New York : « ${s.paris} » ne devrait pas apparaître (${s.what})`);
    }
  }
  if (results.some((r) => r.id.startsWith('tz-new-york/'))) {
    console.log(`\nDécalage de date connu en ${NEGATIVE_TZ} (NOTES.md §3) : ${tzProblems.length ? 'NON CONFORME' : 'reproduit comme attendu'}`);
    tzProblems.forEach((p) => console.log(`    - ${p}`));
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ update, pixelTolerance: PIXEL_TOLERANCE, maxDiffRatio: MAX_DIFF_RATIO, results, tzProblems }, null, 2));

  const failed = results.filter((r) => !r.ok);
  const ok = failed.length === 0 && tzProblems.length === 0;
  console.log(`\n${results.length - failed.length}/${results.length} cas conformes${tzProblems.length ? `, ${tzProblems.length} assertion(s) fuseau en échec` : ''}. Détails : tests/golden/.out/`);
  process.exit(ok ? 0 : 1);
}

await main();
