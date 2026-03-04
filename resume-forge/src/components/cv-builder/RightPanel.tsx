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
    <div className="w-[210mm] min-h-[297mm]">
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
