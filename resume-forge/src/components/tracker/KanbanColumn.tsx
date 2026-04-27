import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Application } from '@/types/application';
import { KanbanCard } from './KanbanCard';

const COL_COLORS: Record<string, string> = {
  draft:       '#6b7280',
  applied:     '#6366f1',
  in_progress: '#fbbf24',
  interview:   '#a78bfa',
  offer:       '#34d399',
  done:        '#f87171',
};

interface KanbanColumnProps {
  id: string;
  title: string;
  applications: Application[];
  onCardClick: (application: Application) => void;
}

export function KanbanColumn({ id, title, applications, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'Column', columnId: id } });
  const color = COL_COLORS[id] ?? '#6b7280';

  return (
    <div style={{
      width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%',
    }}>
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 4px 8px',
        borderBottom: `2px solid ${color}40`,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--rf-text)',
          fontFamily: 'var(--font-display)', flex: 1, letterSpacing: '-0.1px',
        }}>{title}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-display)',
          background: color + '18', borderRadius: 99, padding: '1px 7px',
        }}>{applications.length}</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        style={{
          display: 'flex', flexDirection: 'column', gap: 7,
          overflowY: 'auto', flex: 1, paddingBottom: 4,
          background: isOver ? color + '08' : 'transparent',
          borderRadius: 8, transition: 'background 0.15s',
          padding: isOver ? 4 : 0, minHeight: 80,
          border: isOver ? `1.5px dashed ${color}40` : '1.5px solid transparent',
        }}
      >
        <SortableContext items={applications.map(app => app.id)} strategy={verticalListSortingStrategy}>
          {applications.map((app) => (
            <KanbanCard key={app.id} application={app} onClick={onCardClick} />
          ))}
        </SortableContext>
        {applications.length === 0 && (
          <div style={{
            padding: '16px 8px', textAlign: 'center',
            color: isOver ? color : 'var(--rf-muted)',
            fontSize: 11.5, fontFamily: 'var(--font-body)',
            border: `1.5px dashed ${isOver ? color : 'var(--rf-border)'}`,
            borderRadius: 8, transition: 'all 0.15s',
          }}>
            {isOver ? 'Déposer ici' : 'Aucune candidature'}
          </div>
        )}
      </div>
    </div>
  );
}
