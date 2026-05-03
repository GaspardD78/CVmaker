import { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Application } from '@/types/application';
import { useCompatibilityStore } from '@/stores/compatibilityStore';

interface KanbanCardProps {
  application: Application;
  onClick: (application: Application) => void;
}

const TERMINAL_STATUSES = ['accepted', 'rejected', 'withdrawn', 'ghosted'];

const SOURCE_COLORS: Record<string, string> = {
  linkedin:    '#818cf8',
  job_board:   '#38bdf8',
  network:     '#34d399',
  recruiter:   '#a78bfa',
  spontaneous: '#fbbf24',
  other:       '#6b7280',
};
const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', job_board: 'Job board', network: 'Réseau',
  recruiter: 'Recruteur', spontaneous: 'Spontanée', other: 'Autre',
};

function getUrgencyColor(nextActionDate: string | null): string {
  if (!nextActionDate) return 'var(--rf-border)';
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(nextActionDate); target.setHours(0,0,0,0);
  const diff = Math.floor((target.getTime() - now.getTime()) / 86400000);
  if (diff <= 0) return '#f87171';
  if (diff <= 3) return '#fbbf24';
  return '#6366f1';
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';
  const r = 11; const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
      <svg width="30" height="30" viewBox="0 0 30 30" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="15" cy="15" r={r} fill="none" stroke="var(--rf-border)" strokeWidth="2" />
        <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="2"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} strokeLinecap="round" />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color, fontFamily: 'var(--font-display)',
      }}>{score}</span>
    </div>
  );
}

export function KanbanCard({ application, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
    data: { type: 'Application', application },
  });

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const { scores, fetchScore } = useCompatibilityStore();
  const score = scores[application.id];

  useEffect(() => { fetchScore(application.id); }, [application.id, fetchScore]);

  const urgencyColor = getUrgencyColor(application.nextActionDate);
  const showNextAction = application.nextAction && !TERMINAL_STATUSES.includes(application.status);
  const srcColor = application.source ? (SOURCE_COLORS[application.source] ?? '#6b7280') : '#6b7280';
  const srcLabel = application.source ? (SOURCE_LABELS[application.source] ?? application.source) : '';

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--rf-surface)',
        border: `1px solid var(--rf-border)`,
        borderLeft: `3px solid ${urgencyColor}`,
        borderRadius: 9,
        cursor: 'pointer',
        transition: 'all 0.13s',
        ...(isDragging ? { zIndex: 50 } : {}),
      }}
      onClick={() => onClick(application)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--rf-card)';
        e.currentTarget.style.borderColor = 'var(--rf-border-active)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--rf-surface)';
        e.currentTarget.style.borderColor = 'var(--rf-border)';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Drag handle — visible au hover desktop, toujours visible sur mobile (tactile) */}
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 6, right: 6,
          color: 'var(--rf-muted)', cursor: 'grab',
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6,
          transition: 'opacity 0.12s',
          touchAction: 'none',   // ← indispensable pour @dnd-kit sur Android
        }}
        className="kanban-drag-handle"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </div>

      <div style={{ padding: '11px 12px' }}>
        <p style={{
          margin: '0 0 2px', fontSize: 12.5, fontWeight: 700,
          color: 'var(--rf-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.1px',
        }}>{application.companyName}</p>
        <p style={{
          margin: '0 0 9px', fontSize: 11, color: 'var(--rf-muted)',
          fontFamily: 'var(--font-body)', lineHeight: 1.3,
        }}>{application.jobTitle}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: srcColor,
            background: srcColor + '18', borderRadius: 99, padding: '2px 7px',
            fontFamily: 'var(--font-body)',
          }}>{srcLabel}</span>
          <span style={{ flex: 1 }} />
          {score && <ScoreRing score={score.scoreGlobal} />}
          {application.nextActionDate && (
            <span style={{ fontSize: 10, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
              {new Date(application.nextActionDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {showNextAction && (
          <p style={{
            margin: '8px 0 0', fontSize: 10,
            color: urgencyColor === '#f87171' ? '#f87171' : 'var(--rf-muted)',
            fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4,
            borderTop: '1px solid var(--rf-border)', paddingTop: 7,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {application.nextAction}
          </p>
        )}
      </div>
    </div>
  );
}
