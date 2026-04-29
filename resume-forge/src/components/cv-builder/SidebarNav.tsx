import { Layers, Palette, FileText, Sparkles } from 'lucide-react';

export type SidebarTab = 'blocs' | 'design' | 'resume' | 'ia';

interface SidebarNavProps {
  activeTab: SidebarTab | null;
  onTabChange: (tab: SidebarTab | null) => void;
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

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const handleClick = (id: SidebarTab) => {
    // Toggle : clic sur l'onglet actif ferme le panel
    onTabChange(activeTab === id ? null : id);
  };

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 w-14 flex-shrink-0 print:hidden h-full">
      {TABS.map(({ id, icon: Icon, label, activeColor, activeBg }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            title={label}
            className={`
              flex flex-col items-center justify-center gap-1 w-full py-3 px-1 rounded-lg
              transition-all duration-150 cursor-pointer
              ${isActive
                ? `${activeBg} ${activeColor}`
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }
            `}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className={`text-[9px] font-semibold leading-none tracking-wide ${isActive ? '' : ''}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
