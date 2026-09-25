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

interface Frag { str: string; x: number; y: number; w: number }

export async function extractPdfText(pdfBytes: Uint8Array): Promise<{ pages: number; text: string }> {
  // pdfjs peut détacher le buffer reçu : on lui passe une copie.
  const doc = await getDocument({ data: pdfBytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const frags: Frag[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str === '') continue;
      frags.push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width });
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
  return { pages, text: out.join('\n') + '\n' };
}
