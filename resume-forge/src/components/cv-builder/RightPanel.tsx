import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { useRef } from 'react';
import { getTemplate } from '@/templates';
import { PrintableCV } from '../export/PrintableCV';

export function RightPanel() {
  const { currentCv, currentCvBlocks } = useCvStore();
  const { profile, entries } = useProfileStore();
  const printableRef = useRef<HTMLDivElement>(null);

  if (!currentCv || !profile) return <div>Chargement...</div>;

  const template = getTemplate(currentCv.templateId);

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white relative print:w-full print:min-h-0 print:m-0 print:p-0 shadow-lg print:shadow-none">
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
}
