import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { getTemplate } from '@/templates';
import { PrintableCV } from '../export/PrintableCV';

export function RightPanel() {
  const { currentCv, currentCvBlocks } = useCvStore();
  const { profile, entries } = useProfileStore();

  if (!currentCv || !profile) return <div>Chargement...</div>;

  const template = getTemplate(currentCv.templateId);

  return (
    <div className="w-[210mm] min-h-[297mm]">
      <PrintableCV
        cv={currentCv}
        profile={profile}
        blocks={currentCvBlocks}
        entries={entries}
        template={template}
      />
    </div>
  );
}
