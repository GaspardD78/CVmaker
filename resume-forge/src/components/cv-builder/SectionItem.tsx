import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CVBlock } from '@/types/cv';
import { GripVertical, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';

interface SectionItemProps {
  block: CVBlock;
}

export function SectionItem({ block }: SectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const { updateCvBlock, deleteCvBlock } = useCvStore();
  const { entries } = useProfileStore();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleVisibility = () => {
    updateCvBlock(block.id, { isVisible: !block.isVisible });
  };

  const removeBlock = () => {
    // TODO: Utiliser une boîte de dialogue personnalisée au lieu de confirm() selon le Jalon 10
    deleteCvBlock(block.id);
  };

  // Determine what to display based on block type
  let title = 'Section';
  let subtitle = '';

  if (block.blockType === 'section_header') {
    title = block.sectionName || 'Nouvelle Section';
  } else if (block.blockType === 'entry_ref' && block.entryId) {
    const entry = entries.find(e => e.id === block.entryId);
    if (entry) {
      title = entry.title;
      subtitle = entry.subtitle || '';
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded mb-2 bg-white flex items-center shadow-sm ${!block.isVisible ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="p-2 cursor-grab hover:bg-gray-100 text-gray-400">
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 py-2 px-1 flex flex-col justify-center truncate">
        <span className="font-medium text-sm text-gray-800 truncate">{title}</span>
        {subtitle && <span className="text-xs text-gray-500 truncate">{subtitle}</span>}
      </div>

      <div className="flex p-2 space-x-1 text-gray-400">
        <button onClick={toggleVisibility} className="hover:text-blue-600 p-1" title={block.isVisible ? "Masquer" : "Afficher"}>
          {block.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button onClick={removeBlock} className="hover:text-red-600 p-1" title="Retirer">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
