import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Application } from '@/types/application';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  id: string; // The status string (e.g., 'draft', 'applied')
  title: string;
  applications: Application[];
  onCardClick: (application: Application) => void;
}

export function KanbanColumn({ id, title, applications, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'Column',
      columnId: id,
    },
  });

  return (
    <div className="flex flex-col flex-shrink-0 w-72 bg-gray-100 rounded-lg max-h-full">
      <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50/80 rounded-t-lg sticky top-0 z-10 backdrop-blur-sm">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{title}</h2>
        <span className="bg-white text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full shadow-sm border border-gray-200">
          {applications.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-[150px] transition-colors rounded-b-lg ${
          isOver ? 'bg-blue-50 border-2 border-dashed border-blue-300' : 'bg-transparent border-2 border-transparent'
        }`}
      >
        <SortableContext
          items={applications.map(app => app.id)}
          strategy={verticalListSortingStrategy}
        >
          {applications.map((app) => (
            <KanbanCard
              key={app.id}
              application={app}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}