import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';

const STORAGE_KEY = 'rf_sidebar_collapsed';

const NAV_ITEMS = [
  {
    to: '/',
    exact: true,
    label: 'Tableau de bord',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    to: '/cv',
    label: 'Mes CVs',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    to: '/tracker',
    label: 'Candidatures',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
  },
  {
    to: '/job-watch',
    label: 'Veille emploi',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    hasBadge: true,
  },
  {
    to: '/profile',
    label: 'Profil',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

const MOBILE_NAV = NAV_ITEMS.slice(0, 5);

function NavBtn({
  collapsed,
  active,
  badge,
  label,
  children,
}: {
  collapsed: boolean;
  active: boolean;
  badge?: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '9px 0' : '9px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8,
        background: active ? 'var(--rf-accent-subtle)' : 'transparent',
        color: active ? 'var(--rf-accent)' : 'var(--rf-muted)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        position: 'relative',
        whiteSpace: 'nowrap',
        transition: 'all 0.12s ease',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ flexShrink: 0, position: 'relative' }}>
        {children}
        {badge != null && badge > 0 && collapsed && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: 'var(--rf-accent)', color: '#fff',
            borderRadius: 99, fontSize: 10, fontWeight: 700,
            padding: '1px 4px', lineHeight: 1.4, fontFamily: 'var(--font-body)',
          }}>{badge > 9 ? '9+' : badge}</span>
        )}
      </span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{
          background: active ? 'var(--rf-accent)' : 'var(--rf-border)',
          color: active ? '#fff' : 'var(--rf-muted)',
          borderRadius: 99, fontSize: 11, fontWeight: 600,
          padding: '1px 7px', lineHeight: 1.5, fontFamily: 'var(--font-body)',
        }}>{badge}</span>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const unreadCount = useJobWatchStore(s => s.unreadCount());
  const profile = useProfileStore(s => s.profile);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const initials = profile
    ? (profile.firstName?.[0] ?? '') + (profile.lastName?.[0] ?? '')
    : (user?.email?.[0]?.toUpperCase() ?? 'U');

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim() || user?.email
    : user?.email;

  const displayTitle = profile?.title ?? '';

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      background: 'var(--rf-bg)',
    }}>
      {/* ── Sidebar — desktop ── */}
      <aside
        className="print:hidden"
        style={{
          width: collapsed ? 60 : 220,
          minWidth: collapsed ? 60 : 220,
          background: 'var(--rf-surface)',
          borderRight: '1px solid var(--rf-border)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--rf-border)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--rf-accent)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 13, fontWeight: 700, color: '#fff',
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.5px',
          }}>RF</div>
          {!collapsed && (
            <span style={{
              fontSize: 15, fontWeight: 700, color: 'var(--rf-text)',
              fontFamily: 'var(--font-display)',
              whiteSpace: 'nowrap', letterSpacing: '-0.3px',
            }}>ResumeForge</span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to, item.exact);
            const badge = item.hasBadge ? unreadCount : 0;
            return (
              <Link key={item.to} to={item.to} title={collapsed ? item.label : undefined}
                style={{ textDecoration: 'none' }}
                onMouseEnter={e => {
                  const el = e.currentTarget.firstElementChild as HTMLElement;
                  if (!active && el) { el.style.background = 'var(--rf-hover)'; el.style.color = 'var(--rf-text)'; }
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget.firstElementChild as HTMLElement;
                  if (!active && el) { el.style.background = 'transparent'; el.style.color = 'var(--rf-muted)'; }
                }}
              >
                <NavBtn collapsed={collapsed} active={active} badge={badge} label={item.label}>
                  {item.icon}
                </NavBtn>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--rf-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Settings */}
          <Link to="/settings" style={{ textDecoration: 'none' }}
            title={collapsed ? 'Paramètres' : undefined}
            onMouseEnter={e => {
              const el = e.currentTarget.firstElementChild as HTMLElement;
              if (el) { el.style.background = 'var(--rf-hover)'; el.style.color = 'var(--rf-text)'; }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget.firstElementChild as HTMLElement;
              if (el) { el.style.background = 'transparent'; el.style.color = 'var(--rf-muted)'; }
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '9px 0' : '9px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8,
              background: isActive('/settings') ? 'var(--rf-hover)' : 'transparent',
              color: 'var(--rf-muted)',
              fontFamily: 'var(--font-body)', fontSize: 14,
              transition: 'all 0.12s',
              whiteSpace: 'nowrap',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {!collapsed && <span>Paramètres</span>}
            </div>
          </Link>

          {/* User avatar */}
          <button
            onClick={logout}
            title={collapsed ? `${displayName} — Déconnexion` : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '9px 0' : '9px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', transition: 'background 0.12s',
              width: '100%', marginTop: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--rf-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 99,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
              fontFamily: 'var(--font-display)',
            }}>{initials}</div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rf-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)', maxWidth: 130 }}>{displayName}</div>
                {displayTitle && <div style={{ fontSize: 11, color: 'var(--rf-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{displayTitle}</div>}
              </div>
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Étendre' : 'Réduire'}
          style={{
            position: 'absolute', top: '50%', right: -12, transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 99,
            background: 'var(--rf-card)', border: '1px solid var(--rf-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--rf-muted)', transition: 'all 0.15s',
            zIndex: 20,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--rf-text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--rf-accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--rf-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--rf-border)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed
              ? <polyline points="9 18 15 12 9 6"/>
              : <polyline points="15 18 9 12 15 6"/>}
          </svg>
        </button>
      </aside>

      {/* ── Mobile top header ── */}
      <header className="sm:hidden print:hidden" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--rf-surface)',
        borderBottom: '1px solid var(--rf-border)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: 48 }}>
          <div style={{
            width: 28, height: 28, background: 'var(--rf-accent)', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)',
            marginRight: 10,
          }}>RF</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)' }}>ResumeForge</span>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        className="mobile-main-content sm:pt-0 sm:pb-0 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}
      >
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden print:hidden mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--rf-surface)',
        borderTop: '1px solid var(--rf-border)',
        display: 'flex',
      }}>
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '8px 0', gap: 3, minHeight: 56,
                color: active ? 'var(--rf-accent)' : 'var(--rf-muted)',
                textDecoration: 'none', transition: 'color 0.12s',
                fontFamily: 'var(--font-body)',
              }}
            >
              {item.icon}
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.01em' }}>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
