import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { useRef, useState, useEffect } from 'react';
import { getTemplate } from '@/templates';
import { PrintableCV } from '../export/PrintableCV';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export function RightPanel() {
  const { currentCv, currentCvBlocks } = useCvStore();
  const { profile, entries } = useProfileStore();
  const printableRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  if (!currentCv || !profile) return <div>Chargement...</div>;

  const template = getTemplate(currentCv.templateId);

  const content = (
    <div className="w-[210mm] min-h-[297mm] bg-white relative print:w-full print:min-h-0 print:m-0 print:p-0 shadow-lg print:shadow-none mx-auto origin-top">
      {/* A4 Page Limit Guide - slightly less than 297mm to account for browser print margins */}
      <div
        className="absolute top-[295mm] left-0 w-full border-t-2 border-dashed border-red-400 opacity-50 print:hidden z-50 pointer-events-none"
      >
        <span className="absolute right-2 -top-5 text-xs text-red-500 font-semibold bg-white px-1">Limite Page 1</span>
      </div>

      <PrintableCV
        ref={printableRef}
        cv={currentCv}
        profile={profile}
        blocks={currentCvBlocks}
        entries={entries}
        template={template}
      />
    </div>
  );

  if (isMobile) {
    const mmInPx = 794;
    // Initial scale to fit the screen width, assuming some padding
    const initialScale = typeof window !== 'undefined' ? Math.min((window.innerWidth - 16) / mmInPx, 1) : 0.5;

    return (
      <div className="w-full h-full relative overflow-hidden">
        <TransformWrapper
          initialScale={initialScale}
          minScale={0.1}
          maxScale={3}
          centerOnInit={true}
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            {content}
          </TransformComponent>
        </TransformWrapper>
      </div>
    );
  }

  return content;
}
