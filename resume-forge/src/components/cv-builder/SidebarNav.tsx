import { Layers, Palette, FileText, Sparkles } from 'lucide-react';

export type SidebarTab = 'blocs' | 'design' | 'resume' | 'ia';

interface SidebarNavProps {
  activeTab: SidebarTab | null;
  onTabChange: (tab: SidebarTab | null) => void;
  layout?: 'vertical' | 'horizontal';
}

const TABS: Array<{
  id: SidebarTab;
  icon: React.ElementType;
  label: string;
  activeColor: string;
  activeBg: string;
}> = [
  { id: 'blocs',  icon: Layers,   label: 'Blocs',  activeColor: 'text-blue-600',   activeBg: 'bg-blue-50 dark:bg-blue-900/30'   },
  { id: 'design', icon: Palette,  label: 'Design', activeColor: 'text-purple-600', activeBg: 'bg-purple-50 dark:bg-purple-900/30' },
  { id: 'resume', icon: FileText, label: 'Résumé', activeColor: 'text-green-600',  activeBg: 'bg-green-50 dark:bg-green-900/30'  },
  { id: 'ia',     icon: Sparkles, label: 'IA',     activeColor: 'text-amber-500',  activeBg: 'bg-amber-50 dark:bg-amber-900/30'  },
];

export function SidebarNav({ activeTab, onTabChange, layout = 'vertical' }: SidebarNavProps) {
  const handleClick = (id: SidebarTab) => {
    // En mode vertical (desktop), on peut toggle. En horizontal (mobile), on force toujours un panel ouvert
    if (layout === 'vertical') {
      onTabChange(activeTab === id ? null : id);
    } else {
      onTabChange(id);
    }
  };

  const isHorizontal = layout === 'horizontal';

  return (
    <div className={`flex bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex-shrink-0 print:hidden ${
      isHorizontal
        ? 'flex-row items-center justify-around py-1 border-t w-full h-[60px]'
        : 'flex-col items-center py-2 gap-0.5 border-r w-14 h-full'
    }`}>
      {TABS.map(({ id, icon: Icon, label, activeColor, activeBg }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            title={label}
            className={`
              flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg
              transition-all duration-150 cursor-pointer
              ${isHorizontal ? 'flex-1 max-w-[80px]' : 'w-full'}
              ${isActive
                ? `${activeBg} ${activeColor}`
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }
            `}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-[9px] font-semibold leading-none tracking-wide">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
