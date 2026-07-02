import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import logo from '@/assets/branding/logo.png';

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
  {
    to: '/settings',
    label: 'Paramètres',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

const MOBILE_NAV_PATHS = ['/', '/cv', '/tracker', '/job-watch', '/profile', '/settings'];
const MOBILE_NAV = NAV_ITEMS.filter(item => MOBILE_NAV_PATHS.includes(item.to));

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
  const { logout } = useAuthStore();
  const unreadCount = useJobWatchStore(s => s.unreadCount());
  const { profile, fetchProfile } = useProfileStore();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      background: 'var(--rf-bg)',
    }}>
      {/* ── Sidebar — desktop uniquement (masquée sur mobile) ── */}
      <aside
        className="print:hidden hidden sm:flex sm:flex-col"
        style={{
          width: collapsed ? 60 : 220,
          minWidth: collapsed ? 60 : 220,
          background: 'var(--rf-surface)',
          borderRight: '1px solid var(--rf-border)',
          flexDirection: 'column',
          transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
          overflowX: 'clip',
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
          <img src={logo} alt="ResumeForge" width={32} height={32} style={{ borderRadius: 8, flexShrink: 0 }} />
          {!collapsed && (
            <span style={{
              fontSize: 15, fontWeight: 700, color: 'var(--rf-text)',
              fontFamily: 'var(--font-display)',
              whiteSpace: 'nowrap', letterSpacing: '-0.3px',
            }}>ResumeForge</span>
          )}
        </div>
        
        {/* Current Profile Indicator */}
        {!collapsed && profile && (
          <div style={{ 
            margin: '12px 8px 4px', 
            padding: '8px 10px', 
            background: 'var(--rf-accent-subtle)', 
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid rgba(99, 102, 241, 0.1)'
          }}>
            <div style={{ 
              width: 28, height: 28, 
              borderRadius: 99, 
              background: 'var(--rf-accent)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
              flexShrink: 0
            }}>
              {profile.firstName?.[0]}{profile.lastName?.[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ 
                fontSize: 13, fontWeight: 600, color: 'var(--rf-accent)', 
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
              }}>
                {profile.firstName} {profile.lastName}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--rf-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Profil actif
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to, item.exact);
            const badge = item.hasBadge ? unreadCount : 0;
            return (
              <Link key={item.to} to={item.to} title={collapsed ? item.label : undefined}
                style={{ textDecoration: 'none' }}
              >
                <NavBtn collapsed={collapsed} active={active} badge={badge} label={item.label}>
                  {item.icon}
                </NavBtn>
              </Link>
            );
          })}

          {/* Bottom group: settings + logout */}
          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--rf-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Link to="/settings" title={collapsed ? 'Paramètres' : undefined} style={{ textDecoration: 'none' }}
            >
              <NavBtn collapsed={collapsed} active={isActive('/settings')} label="Paramètres">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </NavBtn>
            </Link>

            <button
              onClick={logout}
              title="Changer de profil / Déconnexion"
              style={{ background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer', textAlign: 'left' }}
            >
              <NavBtn collapsed={collapsed} active={false} label="Changer de profil">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M9 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                </svg>
              </NavBtn>
            </button>
          </div>
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Étendre' : 'Réduire'}
          className="rf-hoverable-border"
          style={{
            position: 'absolute', top: '50%', right: -12, transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 99,
            background: 'var(--rf-card)', border: '1px solid var(--rf-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--rf-muted)', transition: 'all 0.15s',
            zIndex: 20,
          }}
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
          <img src={logo} alt="ResumeForge" width={28} height={28} style={{ borderRadius: 7, marginRight: 10, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rf-text)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>ResumeForge</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--rf-accent)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: 2 }}>
              {NAV_ITEMS.find(item => isActive(item.to, item.exact))?.label || 'Application'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        className="mobile-main-content sm:pt-0 sm:pb-0 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}
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
              className="active:opacity-70"
            >
              {item.icon}
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.01em' }}>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
