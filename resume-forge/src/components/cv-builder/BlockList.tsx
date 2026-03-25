import { useState, useEffect } from 'react';
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

  // Local state for immediate visual feedback on drag end, independent of the
  // async store update. Syncs from the parent prop whenever it changes (e.g.
  // after the DB write confirms the new order or rolls back on error).
  const [localBlocks, setLocalBlocks] = useState<CVBlock[]>(blocks);
  useEffect(() => {
    setLocalBlocks(blocks);
  }, [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      const oldIndex = localBlocks.findIndex((item) => item.id === active.id);
      const newIndex = localBlocks.findIndex((item) => item.id === over.id);

      const draggedBlock = localBlocks[oldIndex];
      let newArray: CVBlock[];

      if (draggedBlock.blockType === 'section_header') {
        // Find all items in the dragged group
        const groupIds: string[] = [draggedBlock.id];
        for (let i = oldIndex + 1; i < localBlocks.length; i++) {
          if (localBlocks[i].blockType === 'section_header') break;
          groupIds.push(localBlocks[i].id);
        }

        const groupItems = groupIds.map((id) => localBlocks.find((b) => b.id === id)!);

        if (groupIds.includes(over.id as string)) {
          // If dropped over its own header or entries, do nothing
          return;
        }

        // Find the section the over element belongs to
        let targetHeaderIndex = -1;
        for (let i = newIndex; i >= 0; i--) {
          if (localBlocks[i].blockType === 'section_header') {
            targetHeaderIndex = i;
            break;
          }
        }

        let remainingBlocks = localBlocks.filter((b) => !groupIds.includes(b.id));

        if (targetHeaderIndex === -1) {
          // Fallback: dropping outside any valid section (shouldn't happen, but safe default)
          let insertIndex = remainingBlocks.findIndex((b) => b.id === over.id);
          if (insertIndex === -1) insertIndex = 0;
          remainingBlocks.splice(insertIndex, 0, ...groupItems);
          newArray = remainingBlocks;
        } else {
          const targetHeaderId = localBlocks[targetHeaderIndex].id;
          let insertIndex = remainingBlocks.findIndex((b) => b.id === targetHeaderId);
          const isMovingDown = oldIndex < targetHeaderIndex;

          if (isMovingDown) {
            // When moving down, insert AFTER the entire target section
            let endOfTargetSection = insertIndex + 1;
            while (
              endOfTargetSection < remainingBlocks.length &&
              remainingBlocks[endOfTargetSection].blockType !== 'section_header'
            ) {
              endOfTargetSection++;
            }
            insertIndex = endOfTargetSection;
          }

          remainingBlocks.splice(insertIndex, 0, ...groupItems);
          newArray = remainingBlocks;
        }
      } else {
        // Normal move for single entries
        newArray = arrayMove(localBlocks, oldIndex, newIndex);
      }

      // Update sortOrder for all items in the new array
      const updatedArray = newArray.map((item, index) => ({
        ...item,
        sortOrder: index,
      }));

      const newOrder = updatedArray.map(item => item.id);

      // Update local state immediately so the UI reflects the new order right
      // away, before the async DB write and re-fetch complete.
      setLocalBlocks(updatedArray);

      // Also update the store so PrintableCV and other consumers see the new order.
      useCvStore.setState({ currentCvBlocks: updatedArray });

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
        items={localBlocks.map(b => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {localBlocks.map((block) => (
            <SectionItem key={block.id} block={block} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
