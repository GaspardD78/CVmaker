import { useEffect, useState } from 'react';
import { PrintableCV } from '@/components/export/PrintableCV';
import { getTemplate } from '@/templates';
import { CVDocument, CVBlock } from '@/types/cv';
import { Profile, MasterEntry } from '@/types/profile';
import { CVTemplate } from '@/types/template';

/** Key used to pass CV data from the builder to the print view via sessionStorage */
const PRINT_DATA_KEY = '__resume_forge_print_data__';

interface PrintData {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
  templateId: string;
}

/**
 * Serialize CV data into sessionStorage so the print view can read it.
 * Must be called BEFORE navigating to /print.
 */
export function setPrintData(data: PrintData): void {
  sessionStorage.setItem(PRINT_DATA_KEY, JSON.stringify(data));
}

/**
 * Standalone print page — renders the CV without any layout wrapper
 * (no sidebar, no scroll container, no overflow constraints).
 *
 * Data flow:
 * 1. CVBuilderPage serializes CV data to sessionStorage
 * 2. Opens /print in a new window (window.open)
 * 3. This component reads data, renders PrintableCV in a clean page
 * 4. Waits for fonts + layout, then calls window.print()
 * 5. After print dialog closes, closes the window
 */
export default function PrintView() {
  const [data, setData] = useState<{
    cv: CVDocument;
    profile: Profile;
    blocks: CVBlock[];
    entries: MasterEntry[];
    template: CVTemplate;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

  // Load data from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRINT_DATA_KEY);
      if (!raw) {
        setError('Aucune donnée de CV trouvée. Retournez à l\'éditeur et réessayez l\'export.');
        return;
      }
      const parsed: PrintData = JSON.parse(raw);
      const template = getTemplate(parsed.templateId);
      setData({
        cv: parsed.cv,
        profile: parsed.profile,
        blocks: parsed.blocks,
        entries: parsed.entries,
        template,
      });
    } catch (e) {
      setError(`Erreur de chargement: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Auto-print once data is rendered and fonts are loaded
  useEffect(() => {
    if (!data || printed) return;

    let cancelled = false;

    const doPrint = async () => {
      // Wait for all fonts to be loaded (critical for correct layout)
      await document.fonts.ready;
      // Extra delay for layout stabilisation (images, reflow)
      await new Promise(r => setTimeout(r, 600));

      if (cancelled) return;

      setPrinted(true);
      window.print();

      // After print dialog closes, close the window if it was opened by window.open.
      // If the user navigated here directly, the close() will be ignored by the browser.
      setTimeout(() => window.close(), 300);
    };

    doPrint();
    return () => { cancelled = true; };
  }, [data, printed]);

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>
        <button
          onClick={() => window.close()}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Fermer
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#6b7280' }}>
        Chargement…
      </div>
    );
  }

  return (
    <>
      {/* Print-specific styles — override everything for clean rendering */}
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 210mm;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          overflow: visible !important;
          height: auto !important;
        }
        /* Ensure absolutely nothing is hidden */
        #print-root, #print-root * {
          visibility: visible !important;
          overflow: visible !important;
        }
        @media print {
          /* Hide the close button when printing */
          .print-controls { display: none !important; }
        }
      `}</style>

      {/* Controls — visible on screen, hidden when printing */}
      <div className="print-controls" style={{
        padding: '8px 16px',
        background: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        fontFamily: 'sans-serif',
        fontSize: '14px',
      }}>
        <button
          onClick={() => { window.print(); }}
          style={{ padding: '4px 12px', cursor: 'pointer', background: '#1f2937', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          Imprimer / Enregistrer PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '4px 12px', cursor: 'pointer', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white' }}
        >
          Fermer
        </button>
      </div>

      {/* CV render — clean, unconstrained, full width */}
      <div id="print-root" style={{ width: '210mm', margin: '0 auto', background: 'white' }}>
        <PrintableCV
          cv={data.cv}
          profile={data.profile}
          blocks={data.blocks}
          entries={data.entries}
          template={data.template}
        />
      </div>
    </>
  );
}
