import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Application } from '@/types/application';
import { Building2, Calendar, GripVertical } from 'lucide-react';

interface KanbanCardProps {
  application: Application;
  onClick: (application: Application) => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow relative group ${
        isDragging ? 'z-50 ring-2 ring-blue-400' : ''
      }`}
      onClick={() => onClick(application)}
    >
      <div
        className="absolute top-2 right-2 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()} // Prevent opening detail panel when grabbing
      >
        <GripVertical size={16} />
      </div>

      <div className="pr-6">
        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 mb-1">
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
    </div>
  );
}