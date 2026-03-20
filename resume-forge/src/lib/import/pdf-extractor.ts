/**
 * Extracts plain text from a PDF ArrayBuffer using PDF.js (WASM, no system deps).
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamic import to avoid loading the heavy WASM bundle upfront
  const pdfjsLib = await import('pdfjs-dist');

  // Point to the bundled worker (Vite will handle the URL resolution)
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

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
