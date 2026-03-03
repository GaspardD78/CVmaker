import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';

export function RightPanel() {
  const { currentCv, currentCvBlocks } = useCvStore();
  const { profile, entries } = useProfileStore();

  if (!currentCv || !profile) return <div>Chargement...</div>;

  const visibleBlocks = currentCvBlocks.filter(b => b.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white shadow-xl p-12 border border-gray-200">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold uppercase tracking-wider text-gray-900 mb-2">
          {profile.firstName} {profile.lastName}
        </h1>
        <div className="text-sm text-gray-600 flex justify-center space-x-4">
          {profile.email && <span>{profile.email}</span>}
          {profile.phone && <span>{profile.phone}</span>}
          {profile.city && <span>{profile.city}</span>}
        </div>
      </div>

      {(currentCv.targetJob || profile.title) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-center text-gray-800 mb-2">
             {currentCv.targetJob || profile.title}
          </h2>
          {(currentCv.customSummary || profile.summary) && (
             <p className="text-sm text-gray-700 text-justify">
               {currentCv.customSummary || profile.summary}
             </p>
          )}
        </div>
      )}

      {/* Render Blocks */}
      <div className="space-y-6">
        {visibleBlocks.map(block => {
          if (block.blockType === 'section_header') {
            return (
              <div key={block.id} className="border-b-2 border-gray-800 pb-1 mb-4 mt-8">
                <h3 className="text-lg font-bold uppercase tracking-wide">{block.sectionName}</h3>
              </div>
            );
          }

          if (block.blockType === 'entry_ref' && block.entryId) {
            const entry = entries.find(e => e.id === block.entryId);
            if (!entry) return null;

            return (
              <div key={block.id} className="mb-4">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="font-bold text-gray-900">{entry.title}</h4>
                  <span className="text-sm text-gray-500 font-medium whitespace-nowrap ml-4">
                    {entry.startDate ? `${entry.startDate} - ${entry.isCurrent ? 'Présent' : entry.endDate || ''}` : ''}
                  </span>
                </div>
                {entry.subtitle && (
                  <div className="text-sm font-semibold text-gray-700 mb-1">
                    {entry.subtitle} {entry.location ? `— ${entry.location}` : ''}
                  </div>
                )}
                {entry.description && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mt-2 text-justify">
                    {entry.description}
                  </p>
                )}
              </div>
            );
          }

          if (block.blockType === 'custom_text' && block.customContent) {
            return (
              <div key={block.id} className="text-sm text-gray-700 whitespace-pre-wrap text-justify">
                {block.customContent}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
