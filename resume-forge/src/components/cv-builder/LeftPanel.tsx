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

export function LeftPanel({ cvId }: { cvId: string }) {
  const { currentCvBlocks, reorderCvBlocks } = useCvStore();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

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

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">Blocs du CV</h2>
      </div>

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
                  <SectionItem key={block.id} block={block} cvId={cvId} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <button
        onClick={() => setIsSelectorOpen(true)}
        className="mt-4 bg-blue-50 text-blue-700 py-3 rounded-lg font-medium w-full border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm"
      >
        + Ajouter une entrée
      </button>

      {isSelectorOpen && (
        <EntrySelector cvId={cvId} onClose={() => setIsSelectorOpen(false)} />
      )}
    </div>
  );
}
