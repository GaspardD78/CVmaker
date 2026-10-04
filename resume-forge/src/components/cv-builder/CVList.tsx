import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { toast } from 'sonner';
import { confirm } from '@tauri-apps/plugin-dialog';
import { exportToDocx } from '@/lib/export-docx';
import { getTemplate } from '@/templates';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import { CVBlock, CVDocument } from '@/types/cv';
import { readAngleSnapshot } from '@/lib/cv-angles';

const TEMPLATE_ACCENTS: Record<string, string> = {
  'ats-classic':   '#6366f1',
  'modern':        '#10b981',
  'minimal':       '#f59e0b',
  'executive':     '#7e22ce',
  'creative':      '#ec4899',
};

function getAccent(templateId: string) {
  return TEMPLATE_ACCENTS[templateId] ?? '#6366f1';
}

function MiniCVPreview({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 200 260" width="100%" style={{ display: 'block', borderRadius: '8px 8px 0 0' }}>
      <rect width="200" height="260" fill="var(--rf-bg)" />
      <rect width="200" height="60" fill={accent} opacity="0.9" />
      <rect x="16" y="14" width="80" height="10" rx="3" fill="rgba(255,255,255,.9)" />
      <rect x="16" y="30" width="50" height="6" rx="2" fill="rgba(255,255,255,.5)" />
      <rect x="16" y="42" width="100" height="5" rx="2" fill="rgba(255,255,255,.35)" />
      <rect x="16" y="76" width="40" height="5" rx="2" fill={accent} />
      <rect x="16" y="88" width="168" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="96" width="140" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="104" width="155" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="120" width="40" height="5" rx="2" fill={accent} />
      <rect x="16" y="132" width="168" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="140" width="120" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="156" width="40" height="5" rx="2" fill={accent} />
      <rect x="16" y="168" width="168" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="176" width="100" height="4" rx="2" fill="var(--rf-border)" />
      <rect x="16" y="192" width="40" height="5" rx="2" fill={accent} />
      <rect x="16" y="204" width="50" height="6" rx="2" fill="var(--rf-border)" opacity="0.7" />
      <rect x="72" y="204" width="50" height="6" rx="2" fill="var(--rf-border)" opacity="0.7" />
      <rect x="124" y="204" width="40" height="6" rx="2" fill="var(--rf-border)" opacity="0.7" />
    </svg>
  );
}

function CVCard({ cv, onDelete, onDuplicate, onExportDocx, onExportPdf }: {
  cv: CVDocument;
  onDelete: () => void;
  onDuplicate: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const accent = getAccent(cv.templateId);

  return (
    <div
      onClick={() => navigate(`/cv/${cv.id}`)}
      className="rf-hoverable-card"
      style={{
        background: 'var(--rf-card)',
        border: '1px solid var(--rf-border)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Mini preview */}
      <div style={{ height: 180, overflow: 'hidden', borderBottom: '1px solid var(--rf-border)' }}>
        <MiniCVPreview accent={accent} />
      </div>

      {/* Card footer */}
      <div style={{ padding: '14px 16px' }}>
        <p style={{
          margin: '0 0 4px', fontSize: 13, fontWeight: 700,
          color: 'var(--rf-text)', fontFamily: 'var(--font-display)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{cv.name}</p>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
          Modifié · {new Date(cv.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(99,102,241,.15)', color: '#818cf8',
            borderRadius: 99, fontSize: 10, fontWeight: 600,
            padding: '2px 8px', fontFamily: 'var(--font-body)',
          }}>{cv.templateId}</span>
          {readAngleSnapshot(cv.settings) && (
            <span title="Angle de génération du CV" style={{
              background: 'rgba(16,185,129,.15)', color: '#10b981',
              borderRadius: 99, fontSize: 10, fontWeight: 600,
              padding: '2px 8px', fontFamily: 'var(--font-body)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140,
            }}>{readAngleSnapshot(cv.settings)!.label}</span>
          )}
          <span style={{ flex: 1 }} />

          {/* Actions */}
          <div
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v); }}
            style={{
              width: 28, height: 28, borderRadius: 6, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: menuOpen ? 'var(--rf-accent-subtle)' : 'transparent',
              color: 'var(--rf-muted)', transition: 'all 0.12s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 56, right: 12,
            background: 'var(--rf-surface)', border: '1px solid var(--rf-border)',
            borderRadius: 10, padding: '6px', zIndex: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
            minWidth: 160,
          }}
        >
          {[
            { label: 'Exporter DOCX', action: onExportDocx, icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
            { label: 'Exporter PDF', action: onExportPdf, icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
            { label: 'Dupliquer', action: onDuplicate, icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
            { label: 'Supprimer', action: onDelete, icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); item.action(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 10px', borderRadius: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)',
                color: item.danger ? '#f87171' : 'var(--rf-text)',
                transition: 'background 0.1s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'rgba(248,113,113,.1)' : 'var(--rf-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CVList() {
  const { cvs, fetchCvs, createCv, deleteCv, duplicateCv } = useCvStore();
  const { profile, entries, fetchProfile } = useProfileStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCvName, setNewCvName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchCvs();
    fetchProfile();
  }, [fetchCvs, fetchProfile]);

  const handleCreate = async () => {
    if (!newCvName.trim() || !profile) return;
    setIsCreating(true);
    try {
      await createCv({
        profileId: profile.id,
        name: newCvName,
        templateId: 'ats-classic',
        targetJob: null,
        targetCompany: null,
        customSummary: null,
        settings: {},
        isFavorite: false,
        lastExported: null,
        markdownContent: null,
        markdownMode: 0,
      });
      setNewCvName('');
      setShowNewModal(false);
      toast.success('CV créé avec succès');
    } catch {
      toast.error('Erreur lors de la création du CV');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm(`Supprimer le CV "${name}" ?`, { title: 'Confirmer', kind: 'warning' });
    if (ok) {
      try { await deleteCv(id); toast.success('CV supprimé'); }
      catch { toast.error('Erreur lors de la suppression'); }
    }
  };

  const handleDuplicate = async (id: string) => {
    try { await duplicateCv(id); toast.success('CV dupliqué'); }
    catch { toast.error('Erreur lors de la duplication'); }
  };

  const loadBlocks = async (cvId: string): Promise<CVBlock[]> => {
    const db = await getDb();
    const raw = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM cv_blocks WHERE cv_id = ?1 ORDER BY sort_order ASC', [cvId]
    );
    return raw.map(b => keysToCamelCase<CVBlock>(b));
  };

  const handleExportDocx = async (cv: CVDocument) => {
    if (!profile) return;
    try {
      const blocks = await loadBlocks(cv.id);
      const template = getTemplate(cv.templateId);
      const ok = await exportToDocx(cv, profile, blocks, entries, template);
      if (ok) toast.success(`DOCX exporté : ${cv.name}`);
    } catch (err) {
      toast.error(`Erreur DOCX: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    }
  };

  const handleExportPdf = (cv: CVDocument) => {
    toast.info('Ouverture pour export PDF...');
    window.location.hash = `/cv/${cv.id}?exportPdf=1`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--rf-bg)' }}>
      {/* Header */}
      <div style={{
        padding: 'clamp(16px, 5vw, 28px) clamp(16px, 5vw, 32px) clamp(12px, 4vw, 20px)',
        borderBottom: '1px solid var(--rf-border)',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16,
        background: 'var(--rf-surface)',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--rf-text)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.4px', margin: 0,
          }}>Mes CVs</h1>
          <p style={{ fontSize: 13, color: 'var(--rf-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
            {cvs.length} document{cvs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button className="rf-btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" /><polyline points="17 6 23 6 23 12" />
            </svg>
            Importer
          </button>
          <button className="rf-btn-primary" onClick={() => setShowNewModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau CV
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 'clamp(16px, 5vw, 28px) clamp(16px, 5vw, 32px)', flex: 1 }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(160px, 45vw, 220px), 1fr))', 
          gap: 'clamp(12px, 4vw, 20px)' 
        }}>
          {cvs.map(cv => (
            <CVCard
              key={cv.id}
              cv={cv}
              onDelete={() => handleDelete(cv.id, cv.name)}
              onDuplicate={() => handleDuplicate(cv.id)}
              onExportDocx={() => handleExportDocx(cv)}
              onExportPdf={() => handleExportPdf(cv)}
            />
          ))}

          {/* New CV placeholder */}
          <div
            onClick={() => setShowNewModal(true)}
            className="rf-hoverable-card"
            style={{
              background: 'transparent',
              border: '1.5px dashed var(--rf-border)',
              borderRadius: 12, height: 290,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 12, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 99,
              background: 'var(--rf-accent-subtle)', color: 'var(--rf-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rf-accent)', fontFamily: 'var(--font-body)' }}>
              Créer un nouveau CV
            </span>
          </div>
        </div>
      </div>

      {/* New CV modal */}
      {showNewModal && (
        <div
          onClick={() => setShowNewModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--rf-card)', border: '1px solid var(--rf-border)',
              borderRadius: 14, padding: 28, width: 420,
              animation: 'modalIn 0.18s ease',
              boxShadow: '0 24px 64px rgba(0,0,0,.6)',
            }}
          >
            <h2 style={{
              margin: '0 0 6px', fontSize: 18, fontWeight: 700,
              fontFamily: 'var(--font-display)', color: 'var(--rf-text)', letterSpacing: '-0.3px',
            }}>Nouveau CV</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
              Donnez un nom à votre CV (ex&nbsp;: Développeur React — Startup)
            </p>
            <input
              autoFocus
              type="text"
              placeholder="Nom du CV..."
              value={newCvName}
              onChange={(e) => setNewCvName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNewModal(false); }}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--rf-surface)', border: '1px solid var(--rf-border)',
                borderRadius: 8, color: 'var(--rf-text)', fontSize: 14,
                fontFamily: 'var(--font-body)', outline: 'none',
                transition: 'border-color 0.12s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--rf-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rf-border)'; }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="rf-btn-secondary" onClick={() => setShowNewModal(false)}>Annuler</button>
              <button
                className="rf-btn-primary"
                onClick={handleCreate}
                disabled={isCreating || !newCvName.trim() || !profile}
                style={{ opacity: (isCreating || !newCvName.trim()) ? 0.5 : 1 }}
              >
                {isCreating ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
