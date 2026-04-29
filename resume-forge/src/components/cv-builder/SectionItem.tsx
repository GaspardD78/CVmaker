import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CVBlock } from '@/types/cv';
import { GripVertical, Eye, EyeOff, Trash2, Edit2, Check, X, Tags, AlignLeft, List, Columns2, Columns3, Table2 } from 'lucide-react';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { confirm } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

type DisplayFormat = 'badges' | 'comma' | 'list' | 'columns2' | 'columns3' | 'table';

interface SectionItemProps {
  block: CVBlock;
}

export function SectionItem({ block }: SectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const { updateCvBlock, deleteCvBlock } = useCvStore();
  const { entries } = useProfileStore();

  const [isEditing, setIsEditing] = useState(false);

  // Local state for override data (entry_ref / custom_text)
  const [overrideTitle, setOverrideTitle] = useState('');
  const [overrideSubtitle, setOverrideSubtitle] = useState('');
  const [overrideDescription, setOverrideDescription] = useState('');

  // Local state for section_header
  const [sectionName, setSectionName] = useState('');
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('badges');

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isEntryRef = block.blockType === 'entry_ref' && block.entryId;
  const isSectionHeader = block.blockType === 'section_header';

  useEffect(() => {
    if (!isEditing) return;

    let hasChanged = false;

    if (isSectionHeader) {
      const currentName = block.sectionName || '';
      const currentFormat = (block.overrideData?.displayFormat as DisplayFormat) || 'badges';
      if (sectionName !== currentName || displayFormat !== currentFormat) hasChanged = true;
    } else if (isEntryRef) {
      const currentTitle = block.overrideData?.title ?? entries.find(e => e.id === block.entryId)?.title ?? '';
      const currentSubtitle = block.overrideData?.subtitle ?? entries.find(e => e.id === block.entryId)?.subtitle ?? '';
      const currentDescription = block.overrideData?.description ?? entries.find(e => e.id === block.entryId)?.description ?? '';
      if (overrideTitle !== currentTitle || overrideSubtitle !== currentSubtitle || overrideDescription !== currentDescription) {
        hasChanged = true;
      }
    } else if (block.blockType === 'custom_text') {
      if (overrideDescription !== (block.customContent || '')) hasChanged = true;
    }

    if (!hasChanged) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      if (isSectionHeader) {
        updateCvBlock(block.id, {
          sectionName,
          overrideData: { ...block.overrideData, displayFormat },
        });
      } else if (isEntryRef) {
        updateCvBlock(block.id, {
          overrideData: {
            ...block.overrideData,
            title: overrideTitle,
            subtitle: overrideSubtitle,
            description: overrideDescription,
          },
        });
      } else if (block.blockType === 'custom_text') {
        updateCvBlock(block.id, { customContent: overrideDescription });
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    sectionName, displayFormat,
    overrideTitle, overrideSubtitle, overrideDescription,
    isEditing, block.id, block.overrideData, block.customContent,
    block.blockType, block.sectionName, isSectionHeader,
    isEntryRef, block.entryId, entries, updateCvBlock,
  ]);

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

    const extraIds: string[] = [];
    let confirmMessage = "Êtes-vous sûr de vouloir retirer ce bloc du CV ?";

    if (block.blockType === 'section_header') {
      for (let i = idx + 1; i < blocks.length; i++) {
        if (blocks[i].blockType === 'section_header') break;
        extraIds.push(blocks[i].id);
      }
      if (extraIds.length > 0) {
        confirmMessage = `Supprimer ce titre de section retirera aussi ses ${extraIds.length} bloc(s) associé(s). Continuer ?`;
      }
    } else {
      for (let i = idx - 1; i >= 0; i--) {
        if (blocks[i].blockType === 'section_header') {
          let sectionEnd = blocks.length;
          for (let j = i + 1; j < blocks.length; j++) {
            if (blocks[j].blockType === 'section_header') { sectionEnd = j; break; }
          }
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
      } catch {
        toast.error("Erreur lors du retrait du bloc");
      }
    }
  };

  let title = 'Section';
  let subtitle = '';
  let defaultDescription = '';

  if (isSectionHeader) {
    title = block.sectionName || 'Nouvelle Section';
  } else if (isEntryRef) {
    const entry = entries.find(e => e.id === block.entryId);
    if (entry) {
      title = (block.overrideData?.title as string) || entry.title;
      subtitle = (block.overrideData?.subtitle as string) || entry.subtitle || '';
      defaultDescription = (block.overrideData?.description as string) || entry.description || '';
    }
  } else if (block.blockType === 'custom_text') {
    title = 'Texte personnalisé';
    defaultDescription = block.customContent || '';
  }

  const startEditing = () => {
    if (isSectionHeader) {
      setSectionName(block.sectionName || '');
      setDisplayFormat((block.overrideData?.displayFormat as DisplayFormat) || 'badges');
      setIsEditing(true);
    } else if (isEntryRef) {
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
    if (isSectionHeader) {
      updateCvBlock(block.id, {
        sectionName,
        overrideData: { ...block.overrideData, displayFormat },
      });
    } else if (isEntryRef) {
      updateCvBlock(block.id, {
        overrideData: {
          ...block.overrideData,
          title: overrideTitle,
          subtitle: overrideSubtitle,
          description: overrideDescription,
        },
      });
    } else if (block.blockType === 'custom_text') {
      updateCvBlock(block.id, { customContent: overrideDescription });
    }
    setIsEditing(false);
  };

  // ── Edit panel ────────────────────────────────────────────────────────────

  if (isEditing) {
    return (
      <div className="border rounded mb-2 bg-blue-50 flex flex-col p-3 shadow-md border-blue-200 text-gray-900">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-blue-800 uppercase">
            {isSectionHeader ? 'Section' : 'Personnaliser pour ce CV'}
          </span>
          <div className="flex space-x-2">
            <button onClick={saveOverride} className="text-green-600 hover:text-green-700 bg-green-100 p-1 rounded">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={cancelEditing} className="text-red-600 hover:text-red-700 bg-red-100 p-1 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section header edit */}
        {isSectionHeader && (
          <>
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="Nom de la section"
              className="mb-3 p-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs font-medium text-blue-700 mb-1.5">Format d'affichage des éléments</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { value: 'badges',   icon: <Tags className="w-3.5 h-3.5" />,    label: 'Tags'    },
                  { value: 'comma',    icon: <AlignLeft className="w-3.5 h-3.5" />, label: 'Texte'  },
                  { value: 'list',     icon: <List className="w-3.5 h-3.5" />,    label: 'Liste'   },
                  { value: 'columns2', icon: <Columns2 className="w-3.5 h-3.5" />, label: '2 col.' },
                  { value: 'columns3', icon: <Columns3 className="w-3.5 h-3.5" />, label: '3 col.' },
                  { value: 'table',    icon: <Table2 className="w-3.5 h-3.5" />,  label: 'Tableau' },
                ] as { value: DisplayFormat; icon: React.ReactNode; label: string }[]
              ).map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => setDisplayFormat(value)}
                  className={`flex items-center justify-center gap-1 text-xs py-1.5 rounded border transition ${
                    displayFormat === value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Entry ref edit */}
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

  // ── Normal row ────────────────────────────────────────────────────────────

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group border rounded mb-1 flex items-center shadow-sm transition-colors ${
        isSectionHeader
          ? 'bg-gray-100 border-gray-300 mt-2'
          : 'bg-white border-gray-200 hover:border-gray-300'
      } ${!block.isVisible ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : 'dark:bg-gray-800 dark:border-gray-700'}`}
    >
      <div {...attributes} {...listeners} className="p-2 cursor-grab hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 py-2 px-1 flex flex-col justify-center truncate">
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate ${isSectionHeader ? 'font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400 text-xs' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
            {title}
          </span>
          {!block.isVisible && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              Masqué
            </span>
          )}
        </div>
        {subtitle && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</span>}
      </div>

      <div className="flex p-1.5 space-x-0.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
        <button onClick={startEditing} className="flex items-center hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded transition-colors" title="Personnaliser">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={toggleVisibility} className={`flex items-center p-1.5 rounded transition-colors ${block.isVisible ? 'hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30' : 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50'}`} title={block.isVisible ? "Masquer du CV" : "Réafficher dans le CV"}>
          {block.isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button onClick={removeBlock} className="flex items-center hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded transition-colors" title="Retirer du CV">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
