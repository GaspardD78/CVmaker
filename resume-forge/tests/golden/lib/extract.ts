/**
 * Extraction du texte d'un PDF avec pdfjs-dist (déjà dépendance du projet).
 *
 * Méthode (identique pour le banc et pour la validation croisée) :
 * - les fragments de texte d'une page sont regroupés en lignes par ligne de
 *   base (coordonnée y arrondie au point) ;
 * - dans une ligne, tri par x ; un espace est inséré quand l'écart entre deux
 *   fragments dépasse 1 pt et qu'aucun des deux ne porte déjà d'espace ;
 * - les lignes sont triées de haut en bas, séparées par « \n ».
 * Deux éléments sur la même ligne de base (ex. entreprise + dates) sortent
 * donc sur la même ligne de texte, et un changement de retour à la ligne
 * modifie le texte extrait.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PAGE_HEIGHT_MM, normalizeLineText, type PrintLine } from '../../../src/lib/print-overflow';

/** Normalisation commune DOM / PDF (normalizeLineText, print-overflow.ts). */
export const norm = normalizeLineText;

interface Frag { str: string; x: number; y: number; w: number }

/** Fragment de texte de la page 1 : position en mm depuis le haut de la page (ligne de base), taille en mm. */
export interface PdfFragment { str: string; xMm: number; wMm: number; baselineMm: number; sizeMm: number }

export async function extractPdfText(pdfBytes: Uint8Array): Promise<{ pages: number; text: string; firstPage: PdfFragment[] }> {
  // pdfjs peut détacher le buffer reçu : on lui passe une copie.
  const doc = await getDocument({ data: pdfBytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  const out: string[] = [];
  const firstPage: PdfFragment[] = [];
  const MM = 25.4 / 72;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const frags: Frag[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str === '') continue;
      frags.push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width });
      if (p === 1) firstPage.push({ str: item.str, xMm: item.transform[4] * MM, wMm: item.width * MM, baselineMm: (page.view[3] - item.transform[5]) * MM, sizeMm: Math.hypot(item.transform[2], item.transform[3]) * MM });
    }
    const lines = new Map<number, Frag[]>();
    for (const f of frags) {
      const key = Math.round(f.y);
      const bucket = lines.get(key) ?? lines.get(key - 1) ?? lines.get(key + 1);
      if (bucket) bucket.push(f); else lines.set(key, [f]);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    out.push(`=== page ${p} ===`);
    for (const [, fs] of sorted) {
      fs.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd: number | null = null;
      for (const f of fs) {
        if (prevEnd !== null && f.x - prevEnd > 1 && !/\s$/.test(line) && !/^\s/.test(f.str)) line += ' ';
        line += f.str;
        prevEnd = f.x + f.w;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    page.cleanup();
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { pages, text: out.join('\n') + '\n', firstPage };
}

/**
 * Retours à la ligne : chaque ligne mesurée entièrement visible doit être,
 * mot pour mot, une ligne du PDF (une suite de fragments entiers sur une même
 * ligne de base, à ±2 mm de la position mesurée). Un mot passé à la ligne
 * suivante à l'impression fait échouer le cas, même si le texte mis bout à
 * bout est identique. Retourne les lignes en écart, avec la ligne du PDF la
 * plus proche. Partagée par le banc (run.ts) et la validation croisée.
 */
export function checkLineBreaks(lines: Pick<PrintLine, 'text' | 'topMm' | 'bottomMm'>[], frags: PdfFragment[]): string[] {
  const rows: PdfFragment[][] = [];
  for (const f of [...frags].filter((f) => f.str.trim()).sort((a, b) => a.baselineMm - b.baselineMm)) {
    const row = rows.find((r) => Math.abs(r[0].baselineMm - f.baselineMm) <= 0.9);
    if (row) row.push(f); else rows.push([f]);
  }
  rows.forEach((r) => r.sort((a, b) => a.xMm - b.xMm));
  // Centre vertical approché d'un groupe de fragments (ligne de base moins 0,35 corps).
  const center = (fs: PdfFragment[]) => fs[0].baselineMm - 0.35 * Math.max(...fs.map((f) => f.sizeMm));
  const out: string[] = [];
  for (const l of lines) {
    if (l.bottomMm > PAGE_HEIGHT_MM) continue;
    const m = norm(l.text);
    if (!m) continue;
    const mid = (l.topMm + l.bottomMm) / 2;
    const exact = rows.some((r) => r.some((_, i) => {
      let acc = '';
      for (let j = i; j < r.length; j++) {
        acc += norm(r[j].str);
        if (acc === m) {
          // Bornes : pas de fragment accolé avant ou après (même ligne de texte qui continuerait).
          const glued = (a?: PdfFragment, b?: PdfFragment) => Boolean(a && b && norm(a.str) && norm(b.str)
            && Math.abs(a.sizeMm - b.sizeMm) < 0.02 && b.xMm - (a.xMm + a.wMm) < 0.3 * a.sizeMm);
          return Math.abs(center(r.slice(i, j + 1)) - mid) <= 2 && !glued(r[i - 1], r[i]) && !glued(r[j], r[j + 1]);
        }
        if (!m.startsWith(acc)) return false;
      }
      return false;
    }));
    if (exact) continue;
    const closest = [...rows].sort((a, b) => Math.abs(center(a) - mid) - Math.abs(center(b) - mid))[0];
    out.push(`mesure « ${l.text} »\n        PDF    « ${closest ? closest.map((f) => f.str).join(' ').replace(/\s+/g, ' ').trim() : '—'} »`);
  }
  return out;
}
