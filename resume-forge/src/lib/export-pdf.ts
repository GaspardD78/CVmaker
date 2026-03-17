import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { setPrintData } from '@/pages/PrintView';

/**
 * Exporte le CV en PDF via le rendu natif du WebView.
 *
 * Stratégie : ouvrir une fenêtre dédiée sur /print qui rend le CV
 * dans un composant standalone (sans sidebar, sans scroll container,
 * sans aucune contrainte de layout). Le moteur WebView2 (Windows) ou
 * WebKitGTK (Linux) rend le HTML nativement, puis window.print()
 * déclenche le dialogue d'impression système (avec option "Enregistrer
 * en PDF").
 *
 * Avantages par rapport à html2canvas + jsPDF :
 * - Rendu 100% fidèle (même moteur que l'aperçu)
 * - Pas de problème de clipping/overflow
 * - Pas de problème de couleurs oklch
 * - Pagination native gérée par le moteur d'impression
 * - Cross-platform sans code spécifique OS
 */
export async function exportNativePdf(): Promise<boolean> {
  // ── 1. Read current data from Zustand stores ──
  const { currentCv, currentCvBlocks } = useCvStore.getState();
  const { profile, entries } = useProfileStore.getState();

  if (!currentCv || !profile) return false;

  // ── 2. Serialize to sessionStorage for the print window ──
  setPrintData({
    cv: currentCv,
    profile,
    blocks: currentCvBlocks,
    entries,
    templateId: currentCv.templateId,
  });

  // ── 3. Open /print in a new window ──
  // The window renders PrintableCV in a clean, unconstrained page.
  // After fonts load, it auto-triggers window.print() and then closes.
  const printWindow = window.open(
    '/print',
    '_blank',
    'width=900,height=700,menubar=no,toolbar=no,location=no,status=no'
  );

  if (!printWindow) {
    // Popup blocked — fall back to printing in the current window.
    // The @media print CSS in App.css hides everything except #printable-cv.
    window.print();
  }

  return true;
}
