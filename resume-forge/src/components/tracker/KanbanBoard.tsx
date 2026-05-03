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
import { toast } from 'sonner';

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
  onCardClick?: (app: Application) => void;
}

export function KanbanBoard({ searchTerm = '', sourceFilter = 'all', onCardClick }: KanbanBoardProps) {
  const { applications, updateApplication, createEvent } = useApplicationStore();
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // 8px de distance pour distinguer tap/scroll d'un drag
        // Sur mobile Android, PointerSensor utilise pointer events (unifie touch + mouse)
        distance: 8,
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
        }).catch(() => {
          toast.error("Erreur lors du déplacement de la candidature");
        });
      }
    }
  };

  const handleCardClick = (app: Application) => {
    onCardClick?.(app);
  };

  if (applications.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', textAlign: 'center', padding: '80px 0',
        color: 'var(--rf-muted)', fontFamily: 'var(--font-body)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 99,
          background: 'var(--rf-accent-subtle)', color: 'var(--rf-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--rf-text)', margin: '0 0 4px' }}>Aucune candidature</p>
        <p style={{ fontSize: 12, color: 'var(--rf-muted)', margin: 0 }}>Cliquez sur "Nouvelle candidature" pour commencer le suivi.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 14, width: 'max-content', paddingBottom: 16 }}>
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
  );
}