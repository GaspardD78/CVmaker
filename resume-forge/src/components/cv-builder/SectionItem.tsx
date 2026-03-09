import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CVBlock } from '@/types/cv';
import { GripVertical, Eye, EyeOff, Trash2, Edit2, Check, X } from 'lucide-react';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { confirm } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

interface SectionItemProps {
  block: CVBlock;
}

export function SectionItem({ block }: SectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const { updateCvBlock, deleteCvBlock } = useCvStore();
  const { entries } = useProfileStore();

  const [isEditing, setIsEditing] = useState(false);

  // Local state for override data
  const [overrideTitle, setOverrideTitle] = useState('');
  const [overrideSubtitle, setOverrideSubtitle] = useState('');
  const [overrideDescription, setOverrideDescription] = useState('');

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isEntryRef = block.blockType === 'entry_ref' && block.entryId;

  useEffect(() => {
    if (!isEditing) return;

    let hasChanged = false;
    if (isEntryRef) {
      const currentTitle = block.overrideData?.title ?? entries.find(e => e.id === block.entryId)?.title ?? '';
      const currentSubtitle = block.overrideData?.subtitle ?? entries.find(e => e.id === block.entryId)?.subtitle ?? '';
      const currentDescription = block.overrideData?.description ?? entries.find(e => e.id === block.entryId)?.description ?? '';

      if (overrideTitle !== currentTitle || overrideSubtitle !== currentSubtitle || overrideDescription !== currentDescription) {
        hasChanged = true;
      }
    } else if (block.blockType === 'custom_text') {
      if (overrideDescription !== (block.customContent || '')) {
        hasChanged = true;
      }
    }

    if (!hasChanged) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      if (isEntryRef) {
        const newOverrideData = {
          ...block.overrideData,
          title: overrideTitle,
          subtitle: overrideSubtitle,
          description: overrideDescription,
        };
        updateCvBlock(block.id, { overrideData: newOverrideData });
      } else if (block.blockType === 'custom_text') {
         updateCvBlock(block.id, { customContent: overrideDescription });
      }
    }, 2000); // 2 second auto-save

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [overrideTitle, overrideSubtitle, overrideDescription, isEditing, block.id, block.overrideData, block.customContent, block.blockType, isEntryRef, block.entryId, entries, updateCvBlock]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleVisibility = () => {
    updateCvBlock(block.id, { isVisible: !block.isVisible });
  };

  const removeBlock = async () => {
    const blocks = useCvStore.getState().currentCvBlocks;
    const idx = blocks.findIndex(b => b.id === block.id);

    // Build the list of extra IDs to cascade-delete
    const extraIds: string[] = [];
    let confirmMessage = "Êtes-vous sûr de vouloir retirer ce bloc du CV ?";

    if (block.blockType === 'section_header') {
      // Collect every block that belongs to this section (until next header)
      for (let i = idx + 1; i < blocks.length; i++) {
        if (blocks[i].blockType === 'section_header') break;
        extraIds.push(blocks[i].id);
      }
      if (extraIds.length > 0) {
        confirmMessage = `Supprimer ce titre de section retirera aussi ses ${extraIds.length} bloc(s) associé(s). Continuer ?`;
      }
    } else {
      // For entry_ref / custom_text: check if this is the last block under its section header
      for (let i = idx - 1; i >= 0; i--) {
        if (blocks[i].blockType === 'section_header') {
          // Find the end of this section
          let sectionEnd = blocks.length;
          for (let j = i + 1; j < blocks.length; j++) {
            if (blocks[j].blockType === 'section_header') { sectionEnd = j; break; }
          }
          // Count remaining entries after removing this block
          const remaining = blocks.slice(i + 1, sectionEnd).filter(b => b.id !== block.id).length;
          if (remaining === 0) {
            extraIds.push(blocks[i].id);
            confirmMessage = "C'est le dernier bloc de cette section. Retirer aussi le titre de section ?";
          }
          break;
        }
      }
    }

    const isConfirmed = await confirm(confirmMessage, {
      title: 'Confirmer le retrait',
      kind: 'warning',
    });

    if (isConfirmed) {
      try {
        await deleteCvBlock(block.id);
        for (const id of extraIds) {
          await deleteCvBlock(id);
        }
        toast.success("Bloc retiré avec succès");
      } catch (err) {
        toast.error("Erreur lors du retrait du bloc");
      }
    }
  };

  let title = 'Section';
  let subtitle = '';
  let defaultDescription = '';

  if (block.blockType === 'section_header') {
    title = block.sectionName || 'Nouvelle Section';
  } else if (isEntryRef) {
    const entry = entries.find(e => e.id === block.entryId);
    if (entry) {
      // Use override data if available, otherwise fallback to master entry data
      title = (block.overrideData?.title as string) || entry.title;
      subtitle = (block.overrideData?.subtitle as string) || entry.subtitle || '';
      defaultDescription = (block.overrideData?.description as string) || entry.description || '';
    }
  } else if (block.blockType === 'custom_text') {
    title = 'Texte personnalisé';
    defaultDescription = block.customContent || '';
  }

  const startEditing = () => {
    if (isEntryRef) {
      setOverrideTitle(title);
      setOverrideSubtitle(subtitle);
      setOverrideDescription(defaultDescription);
      setIsEditing(true);
    } else if (block.blockType === 'custom_text') {
       setOverrideDescription(defaultDescription);
       setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveOverride = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (isEntryRef) {
      const newOverrideData = {
        ...block.overrideData,
        title: overrideTitle,
        subtitle: overrideSubtitle,
        description: overrideDescription,
      };
      updateCvBlock(block.id, { overrideData: newOverrideData });
    } else if (block.blockType === 'custom_text') {
       updateCvBlock(block.id, { customContent: overrideDescription });
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border rounded mb-2 bg-blue-50 flex flex-col p-3 shadow-md border-blue-200">
        <div className="flex justify-between items-center mb-2">
           <span className="text-xs font-semibold text-blue-800 uppercase">Personnaliser pour ce CV</span>
           <div className="flex space-x-2">
             <button onClick={saveOverride} className="text-green-600 hover:text-green-700 bg-green-100 p-1 rounded">
               <Check className="w-4 h-4" />
             </button>
             <button onClick={cancelEditing} className="text-red-600 hover:text-red-700 bg-red-100 p-1 rounded">
               <X className="w-4 h-4" />
             </button>
           </div>
        </div>

        {isEntryRef && (
          <>
            <input
              type="text"
              value={overrideTitle}
              onChange={(e) => setOverrideTitle(e.target.value)}
              placeholder="Titre du poste/diplôme"
              className="mb-2 p-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={overrideSubtitle}
              onChange={(e) => setOverrideSubtitle(e.target.value)}
              placeholder="Entreprise/École"
              className="mb-2 p-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </>
        )}

        {(isEntryRef || block.blockType === 'custom_text') && (
          <>
            <textarea
              value={overrideDescription}
              onChange={(e) => setOverrideDescription(e.target.value)}
              placeholder="Description des missions, réalisations..."
              className="p-1 text-sm border border-gray-300 rounded h-24 resize-y focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Astuce : <code className="bg-white px-1 rounded">- texte</code> liste à puces · <code className="bg-white px-1 rounded">**texte**</code> gras · <code className="bg-white px-1 rounded">*texte*</code> italique</p>
          </>
        )}
      </div>
    );
  }

  const isSectionHeader = block.blockType === 'section_header';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded mb-1 flex items-center shadow-sm ${
        isSectionHeader
          ? 'bg-gray-100 border-gray-300 mt-2'
          : 'bg-white border-gray-200'
      } ${!block.isVisible ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="p-2 cursor-grab hover:bg-gray-200 text-gray-400">
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 py-2 px-1 flex flex-col justify-center truncate">
        <span className={`text-sm truncate ${isSectionHeader ? 'font-bold uppercase tracking-wide text-gray-600 text-xs' : 'font-medium text-gray-800'}`}>
          {title}
        </span>
        {subtitle && <span className="text-xs text-gray-500 truncate">{subtitle}</span>}
      </div>

      <div className="flex p-2 space-x-1 text-gray-400">
        {(isEntryRef || block.blockType === 'custom_text') && (
          <button onClick={startEditing} className="hover:text-blue-600 p-1" title="Personnaliser">
            <Edit2 className="w-4 h-4" />
          </button>
        )}
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
