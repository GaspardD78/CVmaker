import { useState } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { MasterEntry, EntryType } from '@/types/profile';
import { X, Check } from 'lucide-react';

interface EntrySelectorProps {
  cvId: string;
  onClose: () => void;
}

export function EntrySelector({ cvId, onClose }: EntrySelectorProps) {
  const { entries } = useProfileStore();
  const { createCvBlock, currentCvBlocks } = useCvStore();
  const [selectedType, setSelectedType] = useState<EntryType>('experience');

  const availableTypes: { value: EntryType; label: string }[] = [
    { value: 'experience', label: 'Expériences' },
    { value: 'education', label: 'Formations' },
    { value: 'skill', label: 'Compétences' },
    { value: 'certification', label: 'Certifications' },
    { value: 'language', label: 'Langues' },
    { value: 'project', label: 'Projets' },
    { value: 'interest', label: 'Intérêts' },
    { value: 'volunteer', label: 'Bénévolat' },
  ];

  const filteredEntries = entries.filter((e) => e.entryType === selectedType);

  // Track which entries are already in the CV
  const existingEntryIds = new Set(
    currentCvBlocks.filter(b => b.blockType === 'entry_ref' && b.entryId).map(b => b.entryId)
  );

  const handleAddEntry = async (entry: MasterEntry) => {
    // Determine the next sort order
    const maxOrder = currentCvBlocks.length > 0
      ? Math.max(...currentCvBlocks.map(b => b.sortOrder))
      : 0;

    await createCvBlock({
      cvId,
      entryId: entry.id,
      blockType: 'entry_ref',
      sectionName: null,
      customContent: null,
      sortOrder: maxOrder + 1,
      isVisible: true,
      overrideData: {},
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-50">
      <div className="w-96 bg-white h-full shadow-2xl flex flex-col transform transition-transform">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">Ajouter au CV</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EntryType)}
              className="w-full p-2 border rounded shadow-sm focus:ring focus:ring-blue-200"
            >
              {availableTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {filteredEntries.length === 0 ? (
              <p className="text-gray-500 text-sm text-center">Aucune entrée trouvée pour ce type.</p>
            ) : (
              filteredEntries.map((entry) => {
                const isAdded = existingEntryIds.has(entry.id);
                return (
                  <div key={entry.id} className="border rounded p-3 flex items-center justify-between hover:border-blue-300 transition-colors">
                    <div className="flex-1 mr-4 overflow-hidden">
                      <p className="font-semibold text-gray-900 truncate" title={entry.title}>{entry.title}</p>
                      {entry.subtitle && (
                        <p className="text-sm text-gray-500 truncate" title={entry.subtitle}>{entry.subtitle}</p>
                      )}
                    </div>
                    {isAdded ? (
                      <span className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-medium">
                        <Check className="w-4 h-4 mr-1" /> Ajouté
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddEntry(entry)}
                        className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded text-sm font-medium transition-colors"
                      >
                        Ajouter
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
