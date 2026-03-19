import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Application } from '@/types/application';
import { Building2, Calendar, GripVertical } from 'lucide-react';

interface KanbanCardProps {
  application: Application;
  onClick: (application: Application) => void;
}

const TERMINAL_STATUSES = ['accepted', 'rejected', 'withdrawn', 'ghosted'];

function getUrgency(nextActionDate: string | null): { color: string; borderColor: string; textColor: string } {
  if (!nextActionDate) return { color: 'bg-gray-100', borderColor: 'border-gray-200', textColor: 'text-gray-400' };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(nextActionDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return { color: 'bg-red-500', borderColor: 'border-red-500', textColor: 'text-red-600' };
  if (diffDays <= 3) return { color: 'bg-orange-400', borderColor: 'border-orange-400', textColor: 'text-orange-600' };
  return { color: 'bg-blue-400', borderColor: 'border-blue-400', textColor: 'text-blue-600' };
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function KanbanCard({ application, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: {
      type: 'Application',
      application,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = (priority: 1 | 2 | 3) => {
    switch (priority) {
      case 1:
        return 'bg-red-100 text-red-800 border-red-200';
      case 2:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 3:
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityLabel = (priority: 1 | 2 | 3) => {
    switch (priority) {
      case 1: return 'Haute';
      case 2: return 'Moyenne';
      case 3: return 'Basse';
      default: return '';
    }
  };

  const urgency = getUrgency(application.nextActionDate);
  const showNextAction = application.nextAction && !TERMINAL_STATUSES.includes(application.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow relative group overflow-hidden ${
        isDragging ? 'z-50 ring-2 ring-blue-400' : ''
      }`}
      onClick={() => onClick(application)}
    >
      {/* Urgency bar */}
      <div className={`h-[3px] ${urgency.color}`} />

      <div className="p-3">
        <div
          className="absolute top-2 right-2 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()} // Prevent opening detail panel when grabbing
        >
          <GripVertical size={16} />
        </div>

        <div className="pr-6">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
            {application.jobTitle}
          </h3>

          <div className="flex items-center text-xs text-gray-600 mb-2">
            <Building2 size={12} className="mr-1 flex-shrink-0" />
            <span className="truncate">{application.companyName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getPriorityColor(application.priority)}`}>
              Priorité {getPriorityLabel(application.priority)}
            </span>

            {application.nextActionDate && (
              <div className={`flex items-center text-[10px] ${
                new Date(application.nextActionDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}>
                <Calendar size={10} className="mr-1" />
                {new Date(application.nextActionDate).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit'
                })}
              </div>
            )}
          </div>
        </div>

        {showNextAction && (
          <div className={`mt-2 pt-2 border-t border-gray-100 flex items-center text-[11px] ${urgency.textColor} truncate`}>
            <span className="truncate">
              → {application.nextAction}
              {application.nextActionDate && (
                <span className="ml-1 opacity-75">({formatDateShort(application.nextActionDate)})</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
