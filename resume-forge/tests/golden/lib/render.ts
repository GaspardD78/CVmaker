/**
 * Rendu PDF / PNG des cas golden avec Chromium (playwright-core).
 *
 * 1. La page de test (build Vite de harness/) rend <PrintableCV> et appelle la
 *    vraie exportNativePdf() ; le HTML destiné à la commande Rust
 *    `generate_pdf` est capturé.
 * 2. Ce HTML est écrit dans un fichier temporaire puis ouvert en file://,
 *    comme le fait generate_pdf (src-tauri/src/lib.rs), et imprimé avec les
 *    mêmes options Page.printToPDF.
 * 3. Les pages du PDF sont rastérisées en PNG par pdfjs-dist dans Chromium,
 *    et la comparaison de pixels se fait aussi dans Chromium (canvas).
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CaseData } from './fixtures';
import type { PrintOverflow } from '../../../src/lib/print-overflow';
import { collectInPage, type RawFingerprint } from './html-fingerprint';

const GOLDEN_DIR = resolve(import.meta.dir, '..');
const PROJECT_DIR = resolve(GOLDEN_DIR, '../..');
export const OUT_DIR = join(GOLDEN_DIR, '.out');
export const FONTCONFIG_FILE = join(GOLDEN_DIR, 'fonts', 'fonts.conf');
const HARNESS_DIST = join(OUT_DIR, 'harness-dist');
const PDFJS_DIR = join(PROJECT_DIR, 'node_modules', 'pdfjs-dist', 'legacy', 'build');

/** Résolution des PNG de référence : 96 dpi (A4 = 794 × 1123 px). */
export const RASTER_SCALE = 96 / 72;

/** Options identiques à generate_pdf (src-tauri/src/lib.rs). */
const PDF_OPTIONS = {
  landscape: false,
  displayHeaderFooter: false,
  printBackground: true,
  scale: 1,
  width: '8.27in',
  height: '11.69in',
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
  preferCSSPageSize: true,
} as const;

/** Fenêtre de la page A4 imprimée (210 × 297 mm à 96 dpi), pour l'empreinte du HTML. */
const PAGE_VIEWPORT = { width: 794, height: 1123 };

/** Fenêtre par défaut de Chrome headless lancé par la crate headless_chrome. */
const PRINT_VIEWPORT = { width: 800, height: 600 };

const RASTER_HTML = `<!doctype html><html><body><script type="module">
import * as pdfjs from '/pdfjs/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
window.pdfjs = pdfjs;
window.__ready = true;
</script></body></html>`;

export interface PageStats {
  width: number;
  height: number;
  /** Pixels dont au moins une composante RVBA diffère (écart > 0). */
  diffPixels: number;
  /** Pixels dont l'écart max de composante dépasse la tolérance. */
  overTolerance: number;
  /** Plus grand écart de composante observé (0-255). */
  maxDelta: number;
  totalPixels: number;
  sizeMismatch: boolean;
  /** PNG (data URL) de visualisation de l'écart, seulement si diffPixels > 0. */
  diffPng?: string;
}

export class GoldenRenderer {
  private browser!: Browser;
  private server!: ReturnType<typeof Bun.serve>;
  private rasterContext!: BrowserContext;
  private rasterPage!: Page;

  async start(): Promise<void> {
    this.server = Bun.serve({
      port: 0,
      fetch(req) {
        const { pathname } = new URL(req.url);
        if (pathname === '/raster.html') return new Response(RASTER_HTML, { headers: { 'content-type': 'text/html' } });
        const file = pathname.startsWith('/pdfjs/')
          ? Bun.file(join(PDFJS_DIR, pathname.slice('/pdfjs/'.length)))
          : Bun.file(join(HARNESS_DIST, pathname));
        return new Response(file);
      },
    });
    this.browser = await chromium.launch({
      headless: true,
      // Chromium complet (pas headless-shell), comme le Chrome système utilisé par l'app.
      executablePath: process.env.GOLDEN_CHROMIUM || chromium.executablePath(),
      env: { ...process.env, FONTCONFIG_FILE } as Record<string, string>,
    });
    this.rasterContext = await this.browser.newContext();
    this.rasterPage = await this.rasterContext.newPage();
    await this.rasterPage.goto(`${this.baseUrl}/raster.html`);
    await this.rasterPage.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.server.port}`;
  }

  async stop(): Promise<void> {
    await this.browser?.close();
    this.server?.stop(true);
  }

  chromiumVersion(): string {
    return this.browser.version();
  }

  /** Rend un cas : HTML d'export capturé, mesure de dépassement de page et PDF imprimé. */
  async renderPdf(data: CaseData, timezoneId: string, workDir: string): Promise<{
    html: string; overflow: PrintOverflow; checks: string[]; pdf: Uint8Array; fingerprint: RawFingerprint; fingerprintMs: number;
  }> {
    const context = await this.browser.newContext({
      timezoneId,
      locale: 'fr-FR',
      viewport: { width: 1280, height: 900 },
    });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.addInitScript((d) => { (window as unknown as { __GOLDEN_CASE__: unknown }).__GOLDEN_CASE__ = d; }, data);
      await page.goto(`${this.baseUrl}/tests/golden/harness/index.html`);
      await page.waitForFunction(() => {
        const w = window as unknown as { __GOLDEN_OVERFLOW__?: unknown; __GOLDEN_ERROR__?: string };
        return Boolean(w.__GOLDEN_OVERFLOW__ || w.__GOLDEN_ERROR__);
      }, undefined, { timeout: 30_000 });
      const { html, overflow, checks, error } = await page.evaluate(() => {
        const w = window as unknown as { __GOLDEN_HTML__?: string; __GOLDEN_OVERFLOW__?: PrintOverflow; __GOLDEN_CHECKS__?: string[]; __GOLDEN_ERROR__?: string };
        return { html: w.__GOLDEN_HTML__ ?? '', overflow: w.__GOLDEN_OVERFLOW__ as PrintOverflow, checks: w.__GOLDEN_CHECKS__ ?? ['auto-tests absents'], error: w.__GOLDEN_ERROR__ ?? '' };
      });
      if (error) throw new Error(`Erreur dans la page de test : ${error}`);
      if (pageErrors.length) throw new Error(`Erreurs JS dans la page de test : ${pageErrors.join(' | ')}`);
      await page.close();

      // Étape « Rust » : fichier HTML temporaire ouvert en file:// puis printToPDF.
      mkdirSync(workDir, { recursive: true });
      const htmlPath = join(workDir, 'export.html');
      writeFileSync(htmlPath, html);
      const printPage = await context.newPage();
      await printPage.setViewportSize(PRINT_VIEWPORT);
      await printPage.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      const pdf = await printPage.pdf(PDF_OPTIONS);
      await printPage.close();

      // Empreinte du HTML d'export, règles d'impression actives (page séparée :
      // la page d'impression ci-dessus reste celle de generate_pdf).
      const t0 = performance.now();
      const fpPage = await context.newPage();
      await fpPage.setViewportSize(PAGE_VIEWPORT);
      await fpPage.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await fpPage.emulateMedia({ media: 'print' });
      const fingerprint = await fpPage.evaluate(collectInPage);
      await fpPage.close();
      const fingerprintMs = performance.now() - t0;

      return { html, overflow, checks, pdf: new Uint8Array(pdf), fingerprint, fingerprintMs };
    } finally {
      await context.close();
    }
  }

  /** Rastérise chaque page du PDF en PNG (octets). */
  async rasterize(pdf: Uint8Array): Promise<Uint8Array[]> {
    const b64 = Buffer.from(pdf).toString('base64');
    const dataUrls = await this.rasterPage.evaluate(async ({ b64, scale }) => {
      const pdfjs = (window as unknown as { pdfjs: typeof import('pdfjs-dist') }).pdfjs;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      const urls: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        urls.push(canvas.toDataURL('image/png'));
        page.cleanup();
      }
      await doc.destroy();
      return urls;
    }, { b64, scale: RASTER_SCALE });
    return dataUrls.map((u) => new Uint8Array(Buffer.from(u.split(',')[1], 'base64')));
  }

  /** Compare deux PNG pixel à pixel. `tolerance` : écart de composante toléré (0-255). */
  async comparePng(expected: Uint8Array, actual: Uint8Array, tolerance: number): Promise<PageStats> {
    return this.rasterPage.evaluate(async ({ a, b, tolerance }) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
      };
      const [ea, eb] = await Promise.all([load(a), load(b)]);
      const width = Math.max(ea.w, eb.w);
      const height = Math.max(ea.h, eb.h);
      const sizeMismatch = ea.w !== eb.w || ea.h !== eb.h;
      if (sizeMismatch) {
        return { width, height, diffPixels: width * height, overTolerance: width * height, maxDelta: 255, totalPixels: width * height, sizeMismatch };
      }
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      const octx = out.getContext('2d')!;
      const diff = octx.createImageData(width, height);
      let diffPixels = 0, overTolerance = 0, maxDelta = 0;
      for (let i = 0; i < ea.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(ea.data[i + k] - eb.data[i + k]));
        // Fond : référence estompée ; écarts en rouge (au-delà de la tolérance) ou orange.
        const g = 255 - (255 - ea.data[i]) * 0.25;
        diff.data[i] = g; diff.data[i + 1] = g; diff.data[i + 2] = g; diff.data[i + 3] = 255;
        if (d > 0) {
          diffPixels++;
          if (d > maxDelta) maxDelta = d;
          const over = d > tolerance;
          if (over) overTolerance++;
          diff.data[i] = 255; diff.data[i + 1] = over ? 0 : 165; diff.data[i + 2] = 0;
        }
      }
      let diffPng: string | undefined;
      if (diffPixels > 0) { octx.putImageData(diff, 0, 0); diffPng = out.toDataURL('image/png'); }
      return { width, height, diffPixels, overTolerance, maxDelta, totalPixels: width * height, sizeMismatch, diffPng };
    }, { a: Buffer.from(expected).toString('base64'), b: Buffer.from(actual).toString('base64'), tolerance });
  }
}
