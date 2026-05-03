import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useApplicationStore } from '@/stores/applicationStore';
import { KanbanBoard } from './KanbanBoard';
import { ApplicationFormModal } from './ApplicationFormModal';
import { ApplicationDetailsPanel } from './ApplicationDetailsPanel';
import { ExportApplicationsModal } from './ExportApplicationsModal';
import { toast } from 'sonner';
import { Application, ApplicationSource } from '@/types/application';
import { isMobilePlatform } from '@/lib/platform';

const SOURCE_FILTERS: { id: ApplicationSource | 'all'; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'job_board', label: 'Job board' },
  { id: 'network', label: 'Réseau' },
  { id: 'recruiter', label: 'Recruteur' },
];

export function TrackerPage() {
  const location = useLocation();
  const { applications, fetchApplications, isLoading, error } = useApplicationStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ApplicationSource | 'all'>('all');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [isMobile, setIsMobile] = useState(() => isMobilePlatform());

  // Écoute les changements de taille d'écran (rotation, redimensionnement)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    const ro = new ResizeObserver(updateScrollIndicators);
    ro.observe(el);
    updateScrollIndicators();
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      ro.disconnect();
    };
  }, [updateScrollIndicators]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const openAppIdHandled = useRef(false);
  useEffect(() => {
    const openId = (location.state as { openApplicationId?: string } | null)?.openApplicationId;
    if (openId && applications.length > 0 && !openAppIdHandled.current) {
      const app = applications.find(a => a.id === openId);
      if (app) {
        setSelectedApplication(app);
        openAppIdHandled.current = true;
        window.history.replaceState({}, '');
      }
    }
  }, [applications, location.state]);

  useEffect(() => {
    if (selectedApplication) {
      const fresh = applications.find(a => a.id === selectedApplication.id);
      if (!fresh) setSelectedApplication(null);
      else if (fresh !== selectedApplication) setSelectedApplication(fresh);
    }
  }, [applications]);

  useEffect(() => { if (error) toast.error(error); }, [error]);

  const active = applications.filter(a => !['rejected', 'withdrawn', 'accepted', 'ghosted'].includes(a.status)).length;
  const interviews = applications.filter(a => ['interview', 'technical_test', 'offer', 'phone_screen'].includes(a.status)).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--rf-bg)', color: 'var(--rf-muted)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
        Chargement des candidatures...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--rf-bg)', overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{
        background: 'var(--rf-surface)', borderBottom: '1px solid var(--rf-border)',
        padding: 'clamp(12px, 4vw, 20px) clamp(16px, 5vw, 32px)',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <h1 style={{
            margin: '0 0 3px', fontSize: 'clamp(17px, 5vw, 22px)', fontWeight: 700, color: 'var(--rf-text)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.4px',
          }}>Suivi des candidatures</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
            {applications.length} candidature{applications.length !== 1 ? 's' : ''} · Kanban interactif
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="rf-btn-secondary"
            onClick={() => setIsExportOpen(true)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" /><polyline points="17 6 23 6 23 12" />
            </svg>
            Exporter
          </button>
          <button className="rf-btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouvelle candidature
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        padding: 'clamp(8px, 2vw, 10px) clamp(16px, 5vw, 32px)',
        background: 'var(--rf-surface)', borderBottom: '1px solid var(--rf-border)',
        alignItems: 'center', flexShrink: 0,
      }}>
        {[
          { label: 'Total', value: applications.length, color: 'var(--rf-text)' },
          { label: 'Actives', value: active, color: '#6366f1' },
          { label: 'Entretiens', value: interviews, color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)' }}>{s.value}</span>
            <span style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>{s.label}</span>
          </div>
        ))}
        <span style={{ flex: 1 }} />
        {!isMobile && (
          <span style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
            Glissez les cartes pour changer de statut
          </span>
        )}
      </div>

      {/* Search + filter row */}
      <div style={{
        background: 'var(--rf-surface)', borderBottom: '1px solid var(--rf-border)',
        padding: 'clamp(8px, 2vw, 10px) clamp(16px, 5vw, 32px)',
        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 260 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--rf-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par entreprise, poste…"
            style={{
              width: '100%', padding: '7px 10px 7px 28px',
              background: 'var(--rf-card)', border: '1px solid var(--rf-border)',
              borderRadius: 7, color: 'var(--rf-text)', fontSize: 12.5,
              fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--rf-accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rf-border)'; }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SOURCE_FILTERS.map((f) => {
            const active = sourceFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setSourceFilter(f.id)}
                style={{
                  padding: '5px 11px', borderRadius: 99, fontSize: 11.5,
                  background: active ? 'var(--rf-accent-subtle)' : 'transparent',
                  color: active ? 'var(--rf-accent)' : 'var(--rf-muted)',
                  border: `1px solid ${active ? 'rgba(99,102,241,.2)' : 'var(--rf-border)'}`,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontWeight: active ? 600 : 400, transition: 'all 0.12s',
                  minHeight: 44,
                }}
              >{f.label}</button>
            );
          })}
        </div>
      </div>

      {/* Kanban + drawer */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {canScrollLeft && (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, zIndex: 10, pointerEvents: 'none', background: 'linear-gradient(to right, var(--rf-bg), transparent)' }} />
        )}
        {canScrollRight && (
          <div style={{ position: 'absolute', right: selectedApplication ? 420 : 0, top: 0, bottom: 0, width: 48, zIndex: 10, pointerEvents: 'none', background: 'linear-gradient(to left, var(--rf-bg), transparent)' }} />
        )}
        <div ref={scrollRef} style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px' }}>
          <KanbanBoard
            searchTerm={searchTerm}
            sourceFilter={sourceFilter}
            onCardClick={(app) => setSelectedApplication(app)}
          />
        </div>

        {selectedApplication && (
          <ApplicationDetailsPanel
            applicationId={selectedApplication.id}
            onClose={() => { setSelectedApplication(null); setEditingApplication(null); }}
            onEdit={() => setEditingApplication(selectedApplication)}
          />
        )}
      </div>

      <ExportApplicationsModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      <ApplicationFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <ApplicationFormModal
        isOpen={editingApplication !== null}
        onClose={() => setEditingApplication(null)}
        application={editingApplication ?? undefined}
      />
    </div>
  );
}
