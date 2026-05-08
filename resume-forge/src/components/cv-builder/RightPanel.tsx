import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { getTemplate } from '@/templates';
import { PrintableCV } from '../export/PrintableCV';

const A4_WIDTH_PX = 794;   // 210mm at 96dpi
const A4_HEIGHT_PX = 1123; // 297mm at 96dpi
const MOBILE_PADDING_PX = 16;

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

  // Mobile-only: track container width + content height to drive a CSS scale
  // transform. Native vertical scroll handles long CVs; the wrapper is sized
  // to the *visual* (post-scale) dimensions so scrolling and clipping behave
  // like a regular page, not a zoom-pan canvas.
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX);

  useLayoutEffect(() => {
    if (!isMobile) return;
    const updateScale = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const next = Math.min(1, Math.max(0.2, (w - MOBILE_PADDING_PX) / A4_WIDTH_PX));
      setScale(next);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('orientationchange', updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', updateScale);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const el = innerRef.current;
    if (!el) return;
    const update = () => setContentHeight(Math.max(A4_HEIGHT_PX, el.offsetHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, currentCv, currentCvBlocks]);

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
    return (
      <div
        ref={containerRef}
        className="w-full h-full overflow-y-auto overscroll-contain bg-gray-200 dark:bg-gray-900 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          style={{
            width: A4_WIDTH_PX * scale,
            height: contentHeight * scale,
            margin: '0 auto',
            position: 'relative',
          }}
        >
          <div
            ref={innerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: A4_WIDTH_PX,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {content}
          </div>
        </div>
      </div>
    );
  }

  return content;
}
