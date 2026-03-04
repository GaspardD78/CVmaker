import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useApplicationStore } from '@/stores/applicationStore';
import { Application, ApplicationStatus, ApplicationSource } from '@/types/application';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { ApplicationDetailsPanel } from './ApplicationDetailsPanel';

export const KANBAN_COLUMNS = [
  { id: 'draft', title: 'Brouillon', statuses: ['draft'] },
  { id: 'applied', title: 'Postulé', statuses: ['applied', 'acknowledged'] },
  { id: 'in_progress', title: 'En cours', statuses: ['phone_screen', 'technical_test'] },
  { id: 'interview', title: 'Entretien', statuses: ['interview'] },
  { id: 'offer', title: 'Offre', statuses: ['offer'] },
  { id: 'done', title: 'Terminé', statuses: ['accepted', 'rejected', 'withdrawn', 'ghosted'] },
];

interface KanbanBoardProps {
  searchTerm?: string;
  sourceFilter?: ApplicationSource | 'all';
}

export function KanbanBoard({ searchTerm = '', sourceFilter = 'all' }: KanbanBoardProps) {
  const { applications, updateApplication, createEvent } = useApplicationStore();
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

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

  const applicationsByColumn = useMemo(() => {
    const filteredApps = applications.filter(app => {
      const matchesSearch = app.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            app.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSource = sourceFilter === 'all' || app.source === sourceFilter;
      return matchesSearch && matchesSource;
    });

    const grouped = KANBAN_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filteredApps.filter(app => col.statuses.includes(app.status));
      return acc;
    }, {} as Record<string, Application[]>);
    return grouped;
  }, [applications, searchTerm, sourceFilter]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const { application } = active.data.current as { application: Application };
    setActiveApplication(application);
  };

  const handleDragOver = (_event: DragOverEvent) => {};

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveApplication(null);
    const { active, over } = event;

    if (!over) return;

    const activeAppId = active.id as string;
    const overId = over.id as string;

    const activeApplication = applications.find(app => app.id === activeAppId);
    if (!activeApplication) return;

    const isOverAColumn = over.data.current?.type === 'Column';
    let targetColumnId = overId;

    if (!isOverAColumn) {
       const overApp = applications.find(app => app.id === overId);
       if (overApp) {
         const col = KANBAN_COLUMNS.find(c => c.statuses.includes(overApp.status));
         if (col) targetColumnId = col.id;
       }
    }

    const currentColumnId = KANBAN_COLUMNS.find(c => c.statuses.includes(activeApplication.status))?.id;

    if (currentColumnId !== targetColumnId) {
      const targetColumn = KANBAN_COLUMNS.find(c => c.id === targetColumnId);
      if (targetColumn) {
        const newStatus = targetColumn.statuses[0] as ApplicationStatus;
        const oldStatus = activeApplication.status;

        updateApplication(activeAppId, { status: newStatus }).then(() => {
          createEvent({
            applicationId: activeAppId,
            eventType: 'status_change',
            eventDate: new Date().toISOString(),
            title: `Statut modifié : ${newStatus}`,
            description: null,
            oldStatus,
            newStatus,
            calendarId: null,
          });
        });
      }
    }
  };

  const handleCardClick = (app: Application) => {
    setSelectedApplicationId(app.id);
  };

  return (
    <>
      <div className="flex h-full gap-6 w-max pb-4 px-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              applications={applicationsByColumn[col.id] || []}
              onCardClick={handleCardClick}
            />
          ))}

          <DragOverlay dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
              styles: {
                active: { opacity: '0.4' },
              },
            }),
          }}>
            {activeApplication ? (
              <KanbanCard application={activeApplication} onClick={() => {}} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedApplicationId && (
        <ApplicationDetailsPanel
          applicationId={selectedApplicationId}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}
    </>
  );
}