import { useState } from 'react';
import { useCvStore } from '@/stores/cvStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SectionItem } from './SectionItem';
import { EntrySelector } from './EntrySelector';

import { Settings } from 'lucide-react';

export function LeftPanel({ cvId }: { cvId: string }) {
  const { currentCv, currentCvBlocks, reorderCvBlocks, createCvBlock, updateCv } = useCvStore();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Local state for CV settings
  const [targetJob, setTargetJob] = useState(currentCv?.targetJob || '');
  const [targetCompany, setTargetCompany] = useState(currentCv?.targetCompany || '');
  const [customSummary, setCustomSummary] = useState(currentCv?.customSummary || '');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = currentCvBlocks.findIndex((item) => item.id === active.id);
      const newIndex = currentCvBlocks.findIndex((item) => item.id === over?.id);

      const newArray = arrayMove(currentCvBlocks, oldIndex, newIndex);
      const newOrder = newArray.map(item => item.id);
      await reorderCvBlocks(cvId, newOrder);
    }
  };

  const handleAddCustomText = async () => {
    const maxOrder = currentCvBlocks.length > 0
      ? Math.max(...currentCvBlocks.map(b => b.sortOrder))
      : 0;

    await createCvBlock({
      cvId,
      entryId: null,
      blockType: 'custom_text',
      sectionName: null,
      customContent: 'Nouveau texte personnalisé...',
      sortOrder: maxOrder + 1,
      isVisible: true,
      overrideData: {},
    });
  };

  const handleSaveSettings = async () => {
    await updateCv(cvId, {
      targetJob,
      targetCompany,
      customSummary,
    });
    setIsSettingsOpen(false);
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">Blocs du CV</h2>
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="text-gray-500 hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-gray-100"
          title="Paramètres du CV"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {isSettingsOpen && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-sm">
          <h3 className="font-semibold text-blue-900 mb-2">Paramètres de ce CV</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Poste ciblé</label>
              <input
                type="text"
                value={targetJob}
                onChange={e => setTargetJob(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
                placeholder="Ex: Développeur React"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Entreprise ciblée</label>
              <input
                type="text"
                value={targetCompany}
                onChange={e => setTargetCompany(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
                placeholder="Ex: Google"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Résumé personnalisé</label>
              <textarea
                value={customSummary}
                onChange={e => setCustomSummary(e.target.value)}
                className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200 resize-y h-20"
                placeholder="Accroche spécifique à ce CV..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50 border rounded-lg p-3 text-sm text-gray-500 shadow-inner custom-scrollbar">
        {currentCvBlocks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4">
            <p>Ce CV est vide.</p>
            <p className="mt-2">Cliquez sur "Ajouter une entrée" pour commencer à construire votre CV.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={currentCvBlocks.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {currentCvBlocks.map((block) => (
                  <SectionItem key={block.id} block={block} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={() => setIsSelectorOpen(true)}
          className="bg-blue-50 text-blue-700 py-3 rounded-lg font-medium w-full border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm"
        >
          + Ajouter une entrée master
        </button>

        <button
          onClick={handleAddCustomText}
          className="bg-gray-50 text-gray-700 py-2 rounded-lg font-medium w-full border-2 border-dashed border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors shadow-sm text-sm"
        >
          + Ajouter du texte personnalisé
        </button>
      </div>

      {isSelectorOpen && (
        <EntrySelector cvId={cvId} onClose={() => setIsSelectorOpen(false)} />
      )}
    </div>
  );
}
