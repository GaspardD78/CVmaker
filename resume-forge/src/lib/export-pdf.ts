import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { isTauri, isAndroid } from './platform';
import { shareBlob } from './share';

/**
 * Exporte le CV en PDF.
 *
 * | Plateforme | Stratégie |
 * |---|---|
 * | Desktop Tauri | `generate_pdf` Rust via Headless Chrome (vectoriel) |
 * | Android Tauri | jsPDF + html2canvas (bitmap haute résolution) → Web Share API |
 * | Navigateur web | `window.print()` système |
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convertit une URL d'image en data URL base64 pour l'inlining HTML. */
async function getBase64FromUrl(url: string): Promise<string> {
  try {
    const data = await fetch(url);
    const blob = await data.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => resolve(reader.result as string);
    });
  } catch (error) {
    console.error(`Impossible de charger l'image ${url}:`, error);
    return url;
  }
}

/**
 * Récupère le contenu textuel de tous les stylesheets (y compris les liens
 * externes générés par Vite) et les transforme en balises <style> inline
 * pour que Headless Chrome n'ait pas à résoudre des URLs locales (file://).
 */
async function getInlinedStyles(): Promise<string> {
  const styles: string[] = [];
  const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));

  for (const tag of styleTags) {
    if (tag.tagName.toLowerCase() === 'style') {
      styles.push(tag.outerHTML);
    } else if (tag.tagName.toLowerCase() === 'link') {
      const href = (tag as HTMLLinkElement).href;
      try {
        const response = await fetch(href);
        const cssText = await response.text();
        styles.push(`<style>${cssText}</style>`);
      } catch (err) {
        console.warn(`Impossible d'inliner le stylesheet: ${href}`, err);
        styles.push(tag.outerHTML);
      }
    }
  }

  return styles.join('\n');
}

// ── Chemin Web Fallback (print système) ───────────────────────────────────────

async function exportPdfWebFallback(): Promise<boolean> {
  toast.info('Génération du PDF via le navigateur…', {
    description: "Veuillez cliquer sur 'Enregistrer en PDF' dans la fenêtre d'impression.",
    duration: 5000,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    window.print();
    return true;
  } catch (err) {
    console.error("Erreur lors de l'impression fallback:", err);
    return false;
  }
}

// ── Chemin Android (jsPDF + html2canvas) ─────────────────────────────────────

async function exportPdfAndroid(sourceElementId: string): Promise<boolean> {
  const el = document.getElementById(sourceElementId);
  if (!el) {
    toast.error(`Impossible de trouver l'élément #${sourceElementId} dans le DOM.`);
    return false;
  }

  const toastId = toast.loading('Génération du PDF Android…');

  try {
    // Import dynamique pour ne pas alourdir le bundle desktop
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);

    // Rendu du nœud CV en canvas à 2× pour la qualité (équiv. 144 dpi)
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    // Format A4 en mm
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth  = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Mise à l'échelle : on remplit la largeur A4, on pagine en hauteur
    const imgWidthPx  = canvas.width;
    const imgHeightPx = canvas.height;
    const ratio       = pageWidth / (imgWidthPx / 2);  // /2 car scale=2
    const imgHeightMm = (imgHeightPx / 2) * ratio;

    let yPosition = 0;
    let pageCount = 0;

    while (yPosition < imgHeightMm) {
      if (pageCount > 0) pdf.addPage();

      pdf.addImage(
        imgData,
        'JPEG',
        0,
        -yPosition,
        pageWidth,
        imgHeightMm,
      );

      yPosition += pageHeight;
      pageCount++;
    }

    toast.dismiss(toastId);

    const cvName = document.querySelector('h1')?.textContent?.trim() || 'CV';
    const filename = `${cvName.replace(/[^a-z0-9]/gi, '_')}_export.pdf`;

    const blob = pdf.output('blob');
    await shareBlob(blob, filename, 'application/pdf');

    return true;
  } catch (error) {
    toast.dismiss(toastId);
    console.error('Erreur export PDF Android:', error);
    toast.error(`Échec de l'export PDF : ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// ── Chemin Desktop (Vectoriel natif via Headless Chrome) ─────────────────────

async function exportPdfDesktop(sourceElementId: string): Promise<boolean> {
  const cvNode = document.getElementById(sourceElementId);
  if (!cvNode) {
    console.error(`exportPdfDesktop: #${sourceElementId} introuvable`);
    return false;
  }

  const clonedCv = cvNode.cloneNode(true) as HTMLElement;
  const inlinedStyles = await getInlinedStyles();

  const images = clonedCv.querySelectorAll('img');
  for (const img of Array.from(images)) {
    if (img.src && !img.src.startsWith('data:')) {
      img.src = await getBase64FromUrl(img.src);
    }
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>CV</title>
        ${inlinedStyles}
        <style>
          body {
            margin: 0;
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #printable-cv {
            width: 100% !important;
            height: auto !important;
            min-height: 100vh;
            margin: 0;
            box-shadow: none !important;
          }
          @page {
            margin: 0;
            size: A4 portrait;
          }
        </style>
      </head>
      <body>
        ${clonedCv.outerHTML}
      </body>
    </html>
  `;

  try {
    const filePath = await save({
      defaultPath: 'cv_export.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (!filePath) return false;

    const pdfBytes = await invoke<number[]>('generate_pdf', { html: htmlContent });
    const pdfData = new Uint8Array(pdfBytes);
    await writeFile(filePath, pdfData);

    return true;
  } catch (error) {
    console.error("Erreur lors de l'export PDF vectoriel natif:", error);
    toast.error("L'export natif a échoué. Basculement sur l'impression système…");
    return exportPdfWebFallback();
  }
}

// ── Point d'entrée public ─────────────────────────────────────────────────────

/**
 * Exporte le CV en PDF.
 * - Desktop Tauri   → Headless Chrome (vectoriel)
 * - Android Tauri   → jsPDF + html2canvas + Web Share API
 * - Navigateur web  → window.print()
 */
export async function exportNativePdf(sourceElementId = 'printable-cv'): Promise<boolean> {
  if (!isTauri()) {
    return exportPdfWebFallback();
  }

  if (isAndroid()) {
    return exportPdfAndroid(sourceElementId);
  }

  return exportPdfDesktop(sourceElementId);
}
