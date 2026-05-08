import { useEffect, useState, useRef } from 'react';
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
  const [scale, setScale] = useState(1);
  const [wrapperHeight, setWrapperHeight] = useState<number | 'auto'>('auto');
  const printRootRef = useRef<HTMLDivElement>(null);

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

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      setPrinted(true);

      // Auto-print ONLY on non-mobile devices
      if (!isMobile) {
        window.print();
        // After print dialog closes, close the window if it was opened by window.open.
        // If the user navigated here directly, the close() will be ignored by the browser.
        setTimeout(() => window.close(), 300);
      }
    };

    doPrint();
    return () => { cancelled = true; };
  }, [data, printed]);

  // Responsive scaling for preview (fit-to-width)
  useEffect(() => {
    const updateScale = () => {
      const mmInPx = 794; // approx 210mm at 96dpi
      const screenWidth = window.innerWidth;
      if (screenWidth < mmInPx) {
        setScale(screenWidth / mmInPx);
      } else {
        setScale(1);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Update wrapper height to prevent excessive scrolling space
  useEffect(() => {
    if (!printRootRef.current || scale === 1) {
      setWrapperHeight('auto');
      return;
    }
    const updateHeight = () => {
      if (printRootRef.current) {
        setWrapperHeight(printRootRef.current.offsetHeight * scale);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(printRootRef.current);
    return () => ro.disconnect();
  }, [scale, data]);

  // Modifying viewport for native pinch-to-zoom and touch scrolling
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=0.1, maximum-scale=5.0, user-scalable=yes');
  }, []);

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
          size: A4 portrait;
          margin: 0mm 0mm 0mm 0mm;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #f3f4f6; /* Soft gray background for preview */
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
          /* Smooth scrolling on mobile */
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }
        body {
          overflow-y: auto !important;
          height: auto !important;
          padding-bottom: 80px !important; /* Space for fixed controls */
        }
        
        .preview-wrapper {
          display: flex;
          justify-content: center;
          width: 100%;
          overflow-x: hidden; /* Hide the overflow from the 210mm child */
        }

        #print-root {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
          transform-origin: top center;
        }

        /* Prevent page breaks inside entries during printing */
        .cv-entry, .cv-section, h3, .cv-badge-group, .cv-desc li {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        h3 {
          page-break-after: avoid;
          break-after: avoid;
        }

        @media print {
          html, body {
            background: white;
            padding-bottom: 0 !important;
            overflow: visible !important;
            width: 210mm !important;
          }
          .preview-wrapper {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
          }
          #print-root {
            display: block !important;
            visibility: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            min-height: auto !important;
            box-shadow: none !important;
            transform: none !important;
          }
          /* Hide EVERYTHING in body, then selectively re-show */
          body > * {
            display: none !important;
          }
          body > div:first-child {
            display: block !important;
          }
          #print-root * {
            visibility: visible !important;
          }
          #printable-cv {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            max-width: none !important;
          }
          .print-controls {
            display: none !important;
          }
          [data-sonner-toaster],
          [data-radix-portal],
          .Toastify {
            display: none !important;
          }
        }
      `}</style>

      {/* Controls — visible on screen, hidden when printing */}
      <div className="print-controls" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '12px 16px',
        background: 'rgba(243, 244, 246, 0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.05)',
      }}>
        <button
          onClick={() => { window.print(); }}
          style={{ padding: '8px 24px', cursor: 'pointer', background: '#1f2937', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 500, flex: 1, maxWidth: '250px' }}
        >
          Imprimer / Enregistrer PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '8px 24px', cursor: 'pointer', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontWeight: 500, flex: 1, maxWidth: '250px' }}
        >
          Fermer
        </button>
      </div>

      {/* CV render — clean, unconstrained, full width */}
      <div className="preview-wrapper" style={{ height: wrapperHeight }}>
        <div id="print-root" ref={printRootRef} style={{ transform: `scale(${scale})` }}>
          <PrintableCV
            cv={data.cv}
            profile={data.profile}
            blocks={data.blocks}
            entries={data.entries}
            template={data.template}
          />
        </div>
      </div>
    </>
  );
}
