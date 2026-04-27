import { useEffect, useMemo } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { format, subDays, startOfDay, isToday, differenceInDays, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link, useNavigate } from 'react-router-dom';

const safeDate = (val: string | null | undefined): Date | null => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const TERMINAL_STATUSES = ['accepted', 'rejected', 'withdrawn', 'ghosted'];

// ── Mini bar chart ──────────────────────────────────────────────────────────────
function BarChart({ data, color = 'var(--rf-accent)' }: { data: { label: string; v: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <svg width="100%" height={100} viewBox={`0 0 ${data.length * 48} 100`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = Math.round((d.v / max) * 72);
        return (
          <g key={i}>
            <rect x={i * 48 + 4} y={80 - h} width={40} height={h + 4} rx={6} fill={color} opacity={0.12} />
            <rect x={i * 48 + 4} y={80 - h} width={40} height={h} rx={6} fill={color} opacity={0.8} />
            <text x={i * 48 + 24} y={96} textAnchor="middle" fontSize={9} fill="var(--rf-muted)" fontFamily="var(--font-body)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score ring ──────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? '#34d399' : score >= 70 ? '#fbbf24' : '#f87171';
  const r = 16; const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--rf-border)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} strokeLinecap="round" />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color, fontFamily: 'var(--font-display)',
      }}>{score}</span>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, iconColor, icon }: {
  label: string; value: string | number; sub?: string; iconColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--rf-card)', border: '1px solid var(--rf-border)',
      borderRadius: 12, padding: 20, flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
          <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--rf-text)', fontFamily: 'var(--font-display)', margin: 0, letterSpacing: '-1px' }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: 'var(--rf-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>{sub}</p>}
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: iconColor + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor, flexShrink: 0,
        }}>{icon}</div>
      </div>
    </div>
  );
}

// ── Page header ─────────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div style={{
      padding: '28px 32px 20px',
      borderBottom: '1px solid var(--rf-border)',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 16,
      background: 'var(--rf-surface)',
      flexShrink: 0,
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.4px', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--rf-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

export function Dashboard() {
  const { applications, fetchApplications } = useApplicationStore();
  const { cvs, fetchCvs } = useCvStore();
  const profile = useProfileStore(s => s.profile);
  const navigate = useNavigate();

  useEffect(() => {
    fetchApplications();
    fetchCvs();
  }, [fetchApplications, fetchCvs]);

  const now = new Date();

  const stats = useMemo(() => {
    const activeStatuses = ['draft', 'applied', 'acknowledged', 'phone_screen', 'interview', 'technical_test', 'offer'];
    const activeApps = applications.filter(a => activeStatuses.includes(a.status));
    const thirtyDaysAgo = subDays(now, 30);
    const recentApps = applications.filter(a => { const d = safeDate(a.createdAt); return d && d >= thirtyDaysAgo; });

    const respondedStatuses = ['phone_screen', 'interview', 'technical_test', 'offer', 'accepted', 'rejected'];
    const appsWithResponse = applications.filter(a => respondedStatuses.includes(a.status));
    const nonDraft = applications.filter(a => a.status !== 'draft');
    const responseRate = nonDraft.length > 0 ? Math.round((appsWithResponse.length / nonDraft.length) * 100) : 0;

    const interviews = applications.filter(a => ['interview', 'technical_test', 'offer'].includes(a.status));

    const needsFollowup = applications
      .filter(a => {
        if (!a.nextActionDate || TERMINAL_STATUSES.includes(a.status)) return false;
        return safeDate(a.nextActionDate) !== null;
      })
      .sort((a, b) => {
        const da = safeDate(a.nextActionDate);
        const db = safeDate(b.nextActionDate);
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });

    // Chart data (4 weeks)
    const chartData = Array.from({ length: 4 }).map((_, i) => {
      const start = subDays(now, (i + 1) * 7);
      const end = subDays(now, i * 7);
      const count = applications.filter(a => { const d = safeDate(a.createdAt); return d && d >= start && d < end; }).length;
      const labels = ['S-3', 'S-2', 'S-1', 'Cette sem.'];
      return { label: labels[3 - i], v: count };
    }).reverse();

    // Source breakdown
    const SOURCE_LABELS: Record<string, string> = { job_board: 'Job board', spontaneous: 'Spontanée', network: 'Réseau', recruiter: 'Recruteur', linkedin: 'LinkedIn', other: 'Autre' };
    const SOURCE_COLORS: Record<string, string> = { linkedin: '#0077b5', job_board: 'var(--rf-accent)', network: '#34d399', recruiter: '#fbbf24', spontaneous: '#a78bfa', other: '#6b7280' };
    const sourceCounts: Record<string, number> = {};
    nonDraft.forEach(a => { const src = a.source || 'other'; sourceCounts[src] = (sourceCounts[src] || 0) + 1; });
    const total = nonDraft.length || 1;
    const sourceData = Object.entries(sourceCounts)
      .map(([key, value]) => ({ label: SOURCE_LABELS[key] || key, pct: Math.round((value / total) * 100), color: SOURCE_COLORS[key] || '#6b7280' }))
      .sort((a, b) => b.pct - a.pct);

    // Today items
    const todayItems = applications.filter(a => {
      if (TERMINAL_STATUSES.includes(a.status)) return false;
      const d = safeDate(a.nextActionDate);
      if (!d) return false;
      return d <= startOfDay(subDays(now, -1));
    }).sort((a, b) => {
      const da = safeDate(a.nextActionDate)!;
      const db = safeDate(b.nextActionDate)!;
      return da.getTime() - db.getTime();
    });

    return {
      activeCount: activeApps.length,
      recentCount: recentApps.length,
      responseRate,
      interviewsCount: interviews.length,
      needsFollowup,
      chartData,
      sourceData,
      todayItems,
      recentCvs: cvs.slice(0, 3),
    };
  }, [applications, cvs]);

  const greeting = profile?.firstName ? `Bonjour, ${profile.firstName} 👋` : 'Bienvenue 👋';
  const today = format(now, "EEEE d MMMM yyyy", { locale: fr });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--rf-bg)' }}>
      <PageHeader title="Tableau de bord" subtitle={`${todayLabel} · ${greeting}`}>
        <Link to="/cv" style={{ textDecoration: 'none' }}>
          <button className="rf-btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Mes CVs
          </button>
        </Link>
        <Link to="/tracker" style={{ textDecoration: 'none' }}>
          <button className="rf-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
            Suivi
          </button>
        </Link>
      </PageHeader>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Today banner */}
        {stats.todayItems.length > 0 && (
          <div style={{
            background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)',
            borderRadius: 12, padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-display)' }}>À traiter aujourd'hui</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stats.todayItems.slice(0, 5).map(app => (
                <button key={app.id}
                  onClick={() => navigate('/tracker', { state: { openApplicationId: app.id } })}
                  style={{
                    background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)',
                    borderRadius: 99, padding: '5px 14px', fontSize: 12, fontWeight: 600,
                    color: '#fbbf24', cursor: 'pointer', fontFamily: 'var(--font-body)',
                    transition: 'all 0.12s',
                  }}>
                  {app.companyName} — {app.nextAction || 'Relance'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <KpiCard label="Candidatures actives" value={stats.activeCount}
            iconColor="#6366f1"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>}/>
          <KpiCard label="Ce mois-ci" value={stats.recentCount} sub="candidatures envoyées"
            iconColor="#34d399"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}/>
          <KpiCard label="Taux de réponse" value={`${stats.responseRate}%`}
            iconColor="#a78bfa"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}/>
          <KpiCard label="Entretiens en cours" value={stats.interviewsCount} sub="interview / test / offre"
            iconColor="#f59e0b"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Activity chart */}
            <div style={{ background: 'var(--rf-card)', border: '1px solid var(--rf-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)' }}>Activité des 4 dernières semaines</h3>
                <span style={{ background: 'rgba(99,102,241,.15)', color: '#818cf8', borderRadius: 99, fontSize: 11, fontWeight: 600, padding: '3px 9px', fontFamily: 'var(--font-body)' }}>Candidatures</span>
              </div>
              <BarChart data={stats.chartData} />
            </div>

            {/* Source breakdown */}
            {stats.sourceData.length > 0 && (
              <div style={{ background: 'var(--rf-card)', border: '1px solid var(--rf-border)', borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)' }}>Répartition par source</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stats.sourceData.map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: 'var(--rf-muted)', width: 80, fontFamily: 'var(--font-body)' }}>{s.label}</span>
                      <div style={{ flex: 1, height: 6, background: 'var(--rf-border)', borderRadius: 99 }}>
                        <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--rf-muted)', width: 36, textAlign: 'right', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Follow-ups */}
            <div style={{ background: 'var(--rf-card)', border: '1px solid var(--rf-border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rf-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f87171' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </span>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)', flex: 1 }}>Relances à faire</h3>
                {stats.needsFollowup.length > 0 && (
                  <span style={{ background: 'rgba(248,113,113,.15)', color: '#f87171', borderRadius: 99, fontSize: 10, fontWeight: 600, padding: '2px 6px', fontFamily: 'var(--font-body)' }}>{stats.needsFollowup.length}</span>
                )}
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stats.needsFollowup.length > 0 ? stats.needsFollowup.slice(0, 4).map(app => {
                  const d = safeDate(app.nextActionDate);
                  const overdue = d ? isBefore(startOfDay(d), startOfDay(now)) : false;
                  const todayFlag = d ? isToday(d) : false;
                  const urgent = overdue || todayFlag;
                  return (
                    <button key={app.id}
                      onClick={() => navigate('/tracker', { state: { openApplicationId: app.id } })}
                      style={{
                        padding: '10px', borderRadius: 8, cursor: 'pointer',
                        background: urgent ? 'rgba(248,113,113,.06)' : 'var(--rf-hover)',
                        border: `1px solid ${urgent ? 'rgba(248,113,113,.15)' : 'transparent'}`,
                        display: 'flex', flexDirection: 'column', gap: 3,
                        textAlign: 'left', width: '100%',
                        transition: 'background 0.12s',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rf-text)', fontFamily: 'var(--font-body)' }}>{app.companyName}</span>
                        <span style={{ fontSize: 11, color: urgent ? '#f87171' : 'var(--rf-muted)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          {d ? format(d, 'dd MMM', { locale: fr }) : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>{app.jobTitle}</span>
                      {app.nextAction && <span style={{ fontSize: 11, color: urgent ? '#f87171' : 'var(--rf-accent)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>→ {app.nextAction}</span>}
                    </button>
                  );
                }) : (
                  <p style={{ fontSize: 12, color: 'var(--rf-muted)', padding: '12px 8px', fontFamily: 'var(--font-body)' }}>Aucune action requise pour le moment.</p>
                )}
              </div>
            </div>

            {/* Recent CVs */}
            <div style={{ background: 'var(--rf-card)', border: '1px solid var(--rf-border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rf-border)' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)' }}>CVs récents</h3>
              </div>
              <div style={{ padding: '8px 12px' }}>
                {stats.recentCvs.length > 0 ? stats.recentCvs.map(cv => {
                  const d = cv.updatedAt ? new Date(cv.updatedAt) : null;
                  const isValidDate = d && !isNaN(d.getTime());
                  return (
                    <Link key={cv.id} to={`/cv/${cv.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        padding: '10px', borderRadius: 8, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 3,
                        transition: 'background 0.12s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--rf-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rf-text)', fontFamily: 'var(--font-body)' }}>{cv.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
                          Modifié {isValidDate ? format(d, "le dd MMM yyyy", { locale: fr }) : ''}
                        </span>
                      </div>
                    </Link>
                  );
                }) : (
                  <p style={{ fontSize: 12, color: 'var(--rf-muted)', padding: '12px 8px', fontFamily: 'var(--font-body)' }}>Aucun CV créé pour le moment.</p>
                )}
                <Link to="/cv" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    padding: '10px', borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--rf-accent)', fontSize: 12, fontWeight: 600,
                    fontFamily: 'var(--font-body)', transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--rf-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Créer un nouveau CV
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
