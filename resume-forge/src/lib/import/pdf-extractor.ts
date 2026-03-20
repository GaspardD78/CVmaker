// Vite resolves the worker URL at build time via the `?url` query
// This must be a static import (not dynamic) for Vite to bundle the worker asset
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Extracts plain text from a PDF ArrayBuffer using PDF.js (WASM, no system deps).
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamic import to avoid loading the heavy WASM bundle upfront
  const pdfjsLib = await import('pdfjs-dist');

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}
