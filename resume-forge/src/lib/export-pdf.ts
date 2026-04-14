import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';

/**
 * Exporte le CV en PDF.
 * Sur Desktop : utilise l'API native `generate_pdf` du backend Rust (Headless Chrome)
 * qui donne un PDF 100% vectoriel, texte sélectionnable et rendu parfait.
 * Si l'environnement Tauri n'est pas détecté ou si l'export natif échoue (ex: Chromium absent),
 * on déclenche un fallback natif via window.print().
 */

function isTauri(): boolean {
  // Check if Tauri is available (in window object)
  return '__TAURI_INTERNALS__' in window;
}

// Convertit une image en data URL
async function getBase64FromUrl(url: string): Promise<string> {
  try {
    const data = await fetch(url);
    const blob = await data.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
    });
  } catch (error) {
    console.error(`Impossible de charger l'image ${url}:`, error);
    return url;
  }
}

// ─── Extracteur de styles (inline externe) ───────────────────────────────────

/**
 * Récupère le contenu textuel de tous les stylesheets (y compris les liens externes générés par Vite)
 * et les transforme en balises <style> inline pour que Headless Chrome n'ait pas à
 * résoudre des URLs locales (file://).
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
        styles.push(tag.outerHTML); // fallback
      }
    }
  }

  return styles.join('\n');
}

// ─── Chemin Web Fallback ──────────────────────────────────────────────────────

async function exportPdfWebFallback(): Promise<boolean> {
  // Affiche un toast informatif car ça ouvre la boîte de dialogue système
  toast.info("Génération du PDF via le navigateur...", {
    description: "Veuillez cliquer sur 'Enregistrer en PDF' dans la fenêtre d'impression.",
    duration: 5000,
  });

  // Petite pause pour laisser le toast s'afficher
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    window.print();
    return true;
  } catch (err) {
    console.error("Erreur lors de l'impression fallback:", err);
    return false;
  }
}

// ─── Chemin Desktop (Vectoriel natif via Headless Chrome) ───────────────────

async function exportPdfDesktop(sourceElementId: string): Promise<boolean> {
  const cvNode = document.getElementById(sourceElementId);
  if (!cvNode) {
    console.error(`exportPdfDesktop: #${sourceElementId} introuvable`);
    return false;
  }

  // 1. Cloner le nœud pour ne pas affecter le DOM en cours de lecture
  const clonedCv = cvNode.cloneNode(true) as HTMLElement;

  // 2. Extraire et inliner les styles CSS
  const inlinedStyles = await getInlinedStyles();

  // 3. Transformer les SVGs inline et images locales
  const images = clonedCv.querySelectorAll('img');
  for (const img of Array.from(images)) {
    if (img.src && !img.src.startsWith('data:')) {
      img.src = await getBase64FromUrl(img.src);
    }
  }

  // 4. Construire un document HTML propre
  // L'ajout d'un script d'attente des fonts (document.fonts.ready) n'est utile
  // que si on fait exécuter du JS au Headless Chrome. Or printToPdf ne garantit pas
  // l'exécution asynchrone arbitraire avant impression.
  // Cependant, wait_until_navigated dans Rust va attendre le load DOM complet.
  // Les balises <style> inlinées contenant des fontes Google ou locales en Base64 seront lues correctement.
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>CV</title>
        ${inlinedStyles}
        <style>
          /* Forcer des styles d'impression parfaits */
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
    // 5. Demander à l'utilisateur où sauvegarder
    const filePath = await save({
      defaultPath: 'cv_export.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (!filePath) return false;

    // 6. Envoyer le HTML au backend Rust
    const pdfBytes = await invoke<number[]>('generate_pdf', { html: htmlContent });
    const pdfData = new Uint8Array(pdfBytes);

    // 7. Écrire le fichier
    await writeFile(filePath, pdfData);

    return true;
  } catch (error) {
    console.error("Erreur lors de l'export PDF vectoriel natif:", error);

    // Fallback gracieux si Headless Chromium n'est pas trouvé ou autre erreur Rust
    toast.error("L'export natif a échoué. Basculement sur l'impression système...");
    return exportPdfWebFallback();
  }
}

// ─── Point d'entrée public ───────────────────────────────────────────────────

export async function exportNativePdf(sourceElementId: string = 'printable-cv'): Promise<boolean> {
  // On utilise plus jsPDF/html2canvas sur Android non plus, fallback global sur print
  if (!isTauri()) {
    return exportPdfWebFallback();
  }

  return exportPdfDesktop(sourceElementId);
}
