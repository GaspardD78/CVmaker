/**
 * Golden tests du rendu PDF des CV.
 *
 *   bun run test:golden                 compare le rendu actuel aux références
 *   bun run test:golden -- --update     régénère les références
 *   bun run test:golden -- --update-overflow   régénère seulement les overflow.json
 *   bun run test:golden -- --update-html       régénère seulement l'empreinte du HTML d'export
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
import { buildFingerprint, compareFingerprint, RuleStore, toHtmlRef, type HtmlRef } from './lib/html-fingerprint';
import { OVERFLOW_SAFETY_MARGIN_MM, PAGE_HEIGHT_MM, overflowStatus, type OverflowStatus, type PrintLine, type PrintOverflow } from '../../src/lib/print-overflow';

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
const BASE_FIXTURES = ['anonymized-real', 'long-titles', 'minimal', 'overflow'];
const DERIVED_FIXTURES = ['my-settings'];
/** Variante fuseau négatif : un template par famille de layout (toutes les dates passent par CVEntryBlock). */
const TZ_TEMPLATES = ['ats-classic', 'sidebar-modern'];

interface GoldenCase { id: string; suite: string; fixture: string; template: string; timezoneId: string; fit?: boolean }

/** Suite fit : ajustement à une page appliqué avant l'export (src/lib/fit-to-page.tsx). */
const FIT_CASES: [string, string][] = [
  ['anonymized-real', 'ats-classic'],
  ['anonymized-real', 'sidebar-modern'],
  ['overflow', 'ats-classic'],
  // Cas d'échec explicite : trop long même au plancher de lisibilité.
  ['overflow', 'ats-modern'],
];

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
  for (const [fixture, template] of FIT_CASES)
    cases.push({ id: `fit-${fixture}/${template}`, suite: `fit-${fixture}`, fixture, template, timezoneId: BASE_TZ, fit: true });
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

// ── Dépassement de page (print-overflow.ts) ──────────────────────────────────

/** Attente par fixture. undefined = pas d'attente fixée (référence seule). */
function expectedStatus(c: GoldenCase): OverflowStatus | undefined {
  if (c.suite === 'minimal' || c.suite === 'long-titles') return 'tient';
  if (c.suite === 'overflow') return 'dépasse';
  // academic, le template le plus compact, fait tenir anonymized-real avec
  // 3,2 mm de marge : sous OVERFLOW_SAFETY_MARGIN_MM, donc « de justesse ».
  if (c.suite === 'anonymized-real') return c.template === 'academic' ? 'de justesse' : 'dépasse';
  return undefined;
}

/** Tolérance sur la quantité dépassée, en mm, face à la référence. */
const OVERFLOW_TOLERANCE_MM = 0.5;
/** Longueur minimale (normalisée) d'une ligne pour la tester dans le texte du PDF : évite les faux positifs. */
const MIN_PROBE_CHARS = 12;

interface OverflowRef {
  overflows: boolean;
  tight: boolean;
  overflowMm: number;
  remainingMm: number;
  hiddenLines: number;
  lastVisibleLine: string | null;
  firstCutLine: string | null;
}

function toOverflowRef(o: PrintOverflow): OverflowRef {
  return {
    overflows: o.overflows,
    tight: o.tight,
    overflowMm: o.overflowMm,
    remainingMm: o.remainingMm,
    hiddenLines: o.hiddenLines,
    lastVisibleLine: o.lastVisibleLine?.text ?? null,
    firstCutLine: o.firstCutLine?.text ?? null,
  };
}

/**
 * Normalisation commune DOM / PDF : lettres et chiffres en majuscules seulement
 * (text-transform, letter-spacing, séparateurs générés en CSS ::after, puces).
 */
const norm = (t: string) => t.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Cohérence de la mesure avec le PDF réellement imprimé, par colonne :
 * - dépassement : la dernière ligne entièrement visible est dans le PDF, la
 *   première ligne entièrement sous la page n'y est pas ;
 * - pas de dépassement : la dernière ligne de chaque colonne est dans le PDF.
 * Retourne aussi, pour information, les lignes mesurées introuvables dans le
 * PDF (retour à la ligne différent à l'impression, voir README).
 */
function checkOverflowCoherence(o: PrintOverflow, pdfText: string, pages: number): { problems: string[]; unmatched: string[] } {
  const problems: string[] = [];
  const pdf = norm(pdfText.replace(/^=== page \d+ ===$/gm, ''));
  const probe = (l: PrintLine) => norm(l.text).length >= MIN_PROBE_CHARS;
  const inPdf = (l: PrintLine) => pdf.includes(norm(l.text));
  if (pages !== 1) problems.push(`le PDF fait ${pages} pages : la mesure suppose une page unique`);
  if (o.overflows) {
    const visible = o.lines.filter((l) => l.bottomMm <= PAGE_HEIGHT_MM && probe(l)).sort((a, b) => b.bottomMm - a.bottomMm);
    const hidden = o.lines.filter((l) => l.topMm >= PAGE_HEIGHT_MM && probe(l));
    if (!visible[0]) problems.push('aucune ligne visible testable');
    else if (!inPdf(visible[0])) problems.push(`dernière ligne visible absente du PDF : « ${visible[0].text} »`);
    if (!hidden[0]) problems.push('aucune ligne entièrement coupée testable');
    else if (inPdf(hidden[0])) problems.push(`ligne annoncée coupée présente dans le PDF : « ${hidden[0].text} »`);
  } else {
    for (const column of ['page', 'main', 'sidebar'] as const) {
      const last = o.lines.filter((l) => l.column === column && probe(l)).sort((a, b) => b.bottomMm - a.bottomMm)[0];
      if (last && !inPdf(last)) problems.push(`pas de dépassement annoncé mais dernière ligne (${column}) absente du PDF : « ${last.text} »`);
    }
  }
  const unmatched = o.lines.filter((l) => l.bottomMm <= PAGE_HEIGHT_MM && probe(l) && !inPdf(l)).map((l) => l.text);
  return { problems, unmatched };
}

function checkOverflow(c: GoldenCase, o: PrintOverflow, pdfText: string, pages: number, refDir: string): { problems: string[]; unmatched: string[] } {
  const problems: string[] = [];
  const expected = expectedStatus(c);
  if (expected !== undefined && expected !== overflowStatus(o)) {
    problems.push(`statut « ${overflowStatus(o)} », attendu « ${expected} »`);
  }
  const shouldBeTight = !o.overflows && o.remainingMm < OVERFLOW_SAFETY_MARGIN_MM;
  if (o.tight !== shouldBeTight) problems.push(`tight=${o.tight} incohérent avec la marge restante ${o.remainingMm} mm (seuil ${OVERFLOW_SAFETY_MARGIN_MM} mm)`);
  const coherence = checkOverflowCoherence(o, pdfText, pages);
  problems.push(...coherence.problems);
  const refPath = join(refDir, 'overflow.json');
  if (!existsSync(refPath)) {
    problems.push('référence overflow.json absente (lancer avec --update-overflow)');
    return { problems, unmatched: coherence.unmatched };
  }
  const ref = JSON.parse(readFileSync(refPath, 'utf8')) as OverflowRef;
  const cur = toOverflowRef(o);
  if (ref.overflows !== cur.overflows) problems.push(`dépassement : ${cur.overflows} au lieu de ${ref.overflows}`);
  if (ref.tight !== cur.tight) problems.push(`de justesse : ${cur.tight} au lieu de ${ref.tight}`);
  if (Math.abs(ref.overflowMm - cur.overflowMm) > OVERFLOW_TOLERANCE_MM) problems.push(`dépassement : ${cur.overflowMm} mm au lieu de ${ref.overflowMm} mm`);
  if (Math.abs(ref.remainingMm - cur.remainingMm) > OVERFLOW_TOLERANCE_MM) problems.push(`marge restante : ${cur.remainingMm} mm au lieu de ${ref.remainingMm} mm`);
  if (ref.hiddenLines !== cur.hiddenLines) problems.push(`lignes coupées : ${cur.hiddenLines} au lieu de ${ref.hiddenLines}`);
  if (ref.lastVisibleLine !== cur.lastVisibleLine) problems.push(`dernière ligne visible : « ${cur.lastVisibleLine} » au lieu de « ${ref.lastVisibleLine} »`);
  if (ref.firstCutLine !== cur.firstCutLine) problems.push(`première ligne coupée : « ${cur.firstCutLine} » au lieu de « ${ref.firstCutLine} »`);
  return { problems, unmatched: coherence.unmatched };
}

// ── Lisibilité ATS (lot 1) ───────────────────────────────────────────────────

/** Expression en mots entiers : casse et espaces libres (retours à la ligne compris), coupure possible après un tiret. */
function phraseRegex(phrase: string): RegExp {
  const words = phrase.normalize('NFC').split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '-\\s*'));
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Titres de section visibles, nom et poste visé : en mots entiers dans le
 * texte extrait par pdfjs-dist (pas « E X P É R I E N C E »). Un titre situé
 * sous la coupure de la page (mesure de dépassement) n'est pas attendu.
 */
function checkAtsText(data: ReturnType<typeof loadFixture>['data'], template: string, text: string, overflow: PrintOverflow): string[] {
  const problems: string[] = [];
  const pdf = text.normalize('NFC');
  const below = (h: string) => overflow.lines.some((l) => l.text.toLowerCase() === h.toLowerCase() && l.bottomMm > PAGE_HEIGHT_MM);
  // Mise en page à deux colonnes : l'extraction peut intercaler du texte de la
  // bande latérale entre les lignes d'un texte long (NOTES.md). On accepte alors
  // l'expression découpée selon ses lignes mesurées (par colonne), à condition
  // que ces lignes la recomposent et que chacune soit en mots entiers.
  const squash = (t: string) => t.normalize('NFC').toLowerCase().replace(/\s+/g, '');
  const readable = (phrase: string) => {
    if (phraseRegex(phrase).test(pdf)) return true;
    const parts = overflow.lines.filter((l) => l.bottomMm <= PAGE_HEIGHT_MM && squash(l.text).length >= 3 && squash(phrase).includes(squash(l.text)));
    return parts.length > 1 && parts.map((l) => squash(l.text)).join('') === squash(phrase) && parts.every((l) => phraseRegex(l.text).test(pdf));
  };
  const headings = data.blocks.filter((b) => b.blockType === 'section_header' && b.sectionName).map((b) => b.sectionName as string);
  const p = data.profile;
  const hasContact = [p.email, p.phone, p.city, p.linkedinUrl, p.githubUrl, p.portfolioUrl].some(Boolean);
  if (template.startsWith('sidebar-') && hasContact) headings.push('Contact');
  for (const h of headings) {
    if (!readable(h) && !below(h)) problems.push(`titre de section illisible pour un ATS (pdfjs-dist) : « ${h} »`);
  }
  const name = `${p.firstName} ${p.lastName}`;
  if (!readable(name)) problems.push(`nom illisible pour un ATS (pdfjs-dist) : « ${name} »`);
  const title = data.cv.targetJob || p.title;
  if (title && !readable(title)) problems.push(`poste visé illisible pour un ATS (pdfjs-dist) : « ${title} »`);
  return problems;
}

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
  overflow: OverflowRef;
  /** Lignes visibles mesurées introuvables dans le PDF (information, non bloquant). */
  unmatchedLines?: string[];
  /** Messages informatifs sur le HTML d'export (non bloquants). */
  htmlInfo?: string[];
  /** Temps de calcul de l'empreinte du HTML d'export (ms). */
  fingerprintMs?: number;
  /** Compte rendu de l'ajustement à une page (suite fit). */
  fit?: Record<string, unknown> | null;
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const updateOverflow = update || args.includes('--update-overflow');
  const updateHtml = update || args.includes('--update-html');
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
  console.log(`Chromium ${renderer.chromiumVersion()} — ${cases.length} cas — mode ${update ? 'MISE À JOUR des références' : [updateOverflow && 'MISE À JOUR des overflow.json', updateHtml && "MISE À JOUR de l'empreinte HTML"].filter(Boolean).join(' + ') || 'comparaison'}\n`);

  const results: CaseResult[] = [];
  const texts = new Map<string, string>();
  // Règles CSS partagées par toutes les références d'empreinte HTML.
  const ruleStore = new RuleStore(join(REF_DIR, '_css', 'rules.txt'));
  const usedRules = new Set<string>();
  const invalidSelectors = new Set<string>();
  try {
    for (const c of cases) {
      const outDir = join(OUT_DIR, 'cases', c.suite, c.template);
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      const refDir = join(REF_DIR, c.suite, c.template);

      const { data } = loadFixture(c.fixture, c.template);
      const { pdf, overflow, checks, html, fingerprint: rawFp, fingerprintMs, fit } = await renderer.renderPdf(c.fit ? { ...data, fit: true } as typeof data : data, c.timezoneId, outDir);
      const fp = buildFingerprint(rawFp, html);
      fp.rules.forEach((id) => usedRules.add(id));
      fp.invalidSelectors.forEach((sel) => invalidSelectors.add(sel));
      writeFileSync(join(outDir, 'markup.txt'), fp.markup);
      writeFileSync(join(outDir, 'rules.txt'), fp.rules.map((id) => `${id}\t${fp.ruleText.get(id)}`).join('\n') + '\n');
      writeFileSync(join(outDir, 'overflow.json'), JSON.stringify(overflow, null, 2));
      writeFileSync(join(outDir, 'actual.pdf'), pdf);
      const { pages, text } = await extractPdfText(pdf);
      texts.set(c.id, text);
      writeFileSync(join(outDir, 'text.txt'), text);
      const pngs = await renderer.rasterize(pdf);
      pngs.forEach((png, k) => writeFileSync(join(outDir, `page-${k + 1}.png`), png));

      const result: CaseResult = { id: c.id, ok: true, problems: [], pages, pageStats: [], overflow: toOverflowRef(overflow) };

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
      if (updateOverflow) {
        mkdirSync(refDir, { recursive: true });
        writeFileSync(join(refDir, 'overflow.json'), JSON.stringify(toOverflowRef(overflow), null, 2) + '\n');
      }
      const overflowCheck = checkOverflow(c, overflow, text, pages, refDir);
      if (overflowCheck.problems.length) { result.ok = false; result.problems.push(...overflowCheck.problems); }
      // Lisibilité ATS : garde-fou letter-spacing et mots entiers dans le texte extrait.
      if (rawFp.letterSpacingViolations.length) {
        result.ok = false;
        result.problems.push(`letter-spacing au-delà du plafond ATS (${rawFp.letterSpacingViolations.length}) :\n      ${rawFp.letterSpacingViolations.slice(0, 12).join('\n      ')}${rawFp.letterSpacingViolations.length > 12 ? '\n      …' : ''}`);
      }
      const atsProblems = checkAtsText(data, c.template, text, overflow);
      if (atsProblems.length) { result.ok = false; result.problems.push(...atsProblems); }
      // Auto-tests de la page de test : mémorisation des mesures, export, ancrage.
      if (checks.length) { result.ok = false; result.problems.push(...checks.map((m) => `auto-test : ${m}`)); }
      result.unmatchedLines = overflowCheck.unmatched;

      // Empreinte du HTML d'export : balisage de #printable-cv et règles CSS applicables.
      result.fingerprintMs = Math.round(fingerprintMs);
      result.fit = fit;
      if (updateHtml) {
        mkdirSync(refDir, { recursive: true });
        writeFileSync(join(refDir, 'html.json'), JSON.stringify(toHtmlRef(fp), null, 2) + '\n');
        writeFileSync(join(refDir, 'markup.txt'), fp.markup);
        ruleStore.add(fp);
      } else if (!existsSync(join(refDir, 'html.json'))) {
        result.ok = false;
        result.problems.push('référence html.json absente (lancer avec --update-html)');
      } else {
        const ref = JSON.parse(readFileSync(join(refDir, 'html.json'), 'utf8')) as HtmlRef;
        const cmp = compareFingerprint(ref, readFileSync(join(refDir, 'markup.txt'), 'utf8'), fp, ruleStore);
        if (cmp.details.length) writeFileSync(join(outDir, 'html.diff'), cmp.details.join('\n') + '\n');
        if (cmp.failures.length) { result.ok = false; result.problems.push(...cmp.failures); }
        result.htmlInfo = cmp.info;
      }

      results.push(result);
      const ov = overflow.overflows
        ? `dépasse de ${overflow.overflowMm} mm, ${overflow.hiddenLines} ligne(s) coupée(s)`
        : overflow.tight
          ? `DE JUSTESSE, marge ${overflow.remainingMm} mm`
          : `tient, marge ${overflow.remainingMm} mm`;
      const wrapInfo = result.unmatchedLines?.length ? ` [${result.unmatchedLines.length} ligne(s) coupée(s) autrement à l'impression]` : '';
      const fitInfo = fit
        ? `\n    ▸ ajustement : ${fit.kind}` +
          (fit.kind === 'fitted' ? ` — S${fit.stateIndex}/${fit.ladderLength} ${JSON.stringify(fit.patch)}, marge ${fit.finalRemainingMm} mm` : '') +
          (fit.kind === 'failed' ? ` — au plancher (S${fit.ladderLength}) dépasse encore de ${fit.floorOverflowMm} mm, dès « ${fit.floorFirstCut} »` : '') +
          ` ; ${fit.measurements} mesure(s), ${fit.ms} ms`
        : '';
      const htmlInfo = result.htmlInfo?.length ? result.htmlInfo.map((m) => `\n    · ${m}`).join('') : '';
      console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${c.id.padEnd(34)} ${pages} p. — ${ov}${wrapInfo}${fitInfo}${result.problems.map((p) => `\n    - ${p}`).join('')}${htmlInfo}`);
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

  // Fichier partagé des règles : nettoyé des règles inutilisées sur une passe complète.
  if (updateHtml) ruleStore.save(only ? undefined : usedRules);

  const fpTimes = results.map((r) => r.fingerprintMs ?? 0);
  const htmlChangedOutsideCv = results.filter((r) => r.htmlInfo?.length).length;
  console.log(`\nEmpreinte HTML : ${fpTimes.reduce((a, b) => a + b, 0)} ms au total (${Math.round(fpTimes.reduce((a, b) => a + b, 0) / Math.max(1, fpTimes.length))} ms/cas)` +
    `${htmlChangedOutsideCv ? ` ; HTML d'export modifié hors CV dans ${htmlChangedOutsideCv} cas (informatif)` : ''}` +
    `${invalidSelectors.size ? ` ; ${invalidSelectors.size} sélecteur(s) invalide(s) après nettoyage, comptés comme applicables (voir report.json)` : ''}`);

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ update, pixelTolerance: PIXEL_TOLERANCE, maxDiffRatio: MAX_DIFF_RATIO, results, tzProblems, invalidSelectors: [...invalidSelectors].sort() }, null, 2));

  const failed = results.filter((r) => !r.ok);
  const ok = failed.length === 0 && tzProblems.length === 0;
  console.log(`\n${results.length - failed.length}/${results.length} cas conformes${tzProblems.length ? `, ${tzProblems.length} assertion(s) fuseau en échec` : ''}. Détails : tests/golden/.out/`);
  process.exit(ok ? 0 : 1);
}

await main();
