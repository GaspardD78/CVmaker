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
import { CVBlock } from '@/types/cv';
import { useCvStore } from '@/stores/cvStore';

interface BlockListProps {
  cvId: string;
  blocks: CVBlock[];
}

export function BlockList({ cvId, blocks }: BlockListProps) {
  const { reorderCvBlocks } = useCvStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = blocks.findIndex((item) => item.id === active.id);
      const newIndex = blocks.findIndex((item) => item.id === over?.id);

      let newArray = arrayMove(blocks, oldIndex, newIndex);

      // If dragging a section_header, bring its associated entries along with it
      const draggedBlock = blocks[oldIndex];
      if (draggedBlock.blockType === 'section_header') {
        const groupEntryIds: string[] = [];
        for (let i = oldIndex + 1; i < blocks.length; i++) {
          if (blocks[i].blockType === 'section_header') break;
          groupEntryIds.push(blocks[i].id);
        }

        if (groupEntryIds.length > 0) {
          const groupEntries = groupEntryIds.map(id => newArray.find(b => b.id === id)!);
          newArray = newArray.filter(b => !groupEntryIds.includes(b.id));
          const headerNewIdx = newArray.findIndex(b => b.id === draggedBlock.id);
          newArray.splice(headerNewIdx + 1, 0, ...groupEntries);
        }
      }

      const newOrder = newArray.map(item => item.id);

      // Optimistic update to prevent jitter
      useCvStore.setState({ currentCvBlocks: newArray });

      await reorderCvBlocks(cvId, newOrder);
    }
  };

  if (blocks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4">
        <p>Ce CV est vide.</p>
        <p className="mt-2">Cliquez sur "Ajouter une entrée" pour commencer à construire votre CV.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={blocks.map(b => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {blocks.map((block) => (
            <SectionItem key={block.id} block={block} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
