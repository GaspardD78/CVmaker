import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, User, FileText, Briefcase, Settings, PanelLeftClose, PanelLeftOpen, Download, LogOut } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';

const STORAGE_KEY = 'resumeforge_sidebar_collapsed';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { to: '/profile', icon: User, label: 'Profil' },
  { to: '/import', icon: Download, label: 'Importer' },
  { to: '/cv', icon: FileText, label: 'Mes CVs' },
  { to: '/tracker', icon: Briefcase, label: 'Suivi des candidatures' },
];

// 5 destinations affichées dans la bottom nav mobile
const mobileNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Accueil', exact: true },
  { to: '/profile', icon: User, label: 'Profil' },
  { to: '/cv', icon: FileText, label: 'CVs' },
  { to: '/tracker', icon: Briefcase, label: 'Suivi' },
  { to: '/settings', icon: Settings, label: 'Réglages' },
];

import { useState } from 'react';

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const location = useLocation();
  const { logout } = useAuthStore();
  useTheme();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 print:h-auto print:bg-white print:overflow-visible print:block">
      {/* Sidebar – desktop only */}
      <aside
        className={`${collapsed ? 'w-12' : 'w-64'} hidden sm:flex bg-white dark:bg-gray-800 shadow-md flex-col justify-between print:hidden transition-all duration-200 overflow-hidden`}
      >
        <div className={collapsed ? 'px-1 pt-4' : 'p-4'}>
          {!collapsed && <h2 className="text-xl font-bold mb-8 dark:text-gray-100">ResumeForge</h2>}
          {collapsed && <div className="mb-6" />}
          <nav className="flex flex-col space-y-1">
            {navItems.map(({ to, icon: Icon, label, exact }) => {
              const active = isActive(to, exact);
              return (
                <Link
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={`flex items-center rounded-md transition ${
                    collapsed ? 'justify-center p-2' : 'px-3 py-2'
                  } ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-blue-600 dark:text-blue-400 font-medium hover:text-blue-800 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${collapsed ? '' : 'mr-3'} flex-shrink-0`} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={`pb-2 flex flex-col ${collapsed ? 'px-1 items-center' : 'px-4'} space-y-2`}>
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
            className={`flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition rounded-md ${
              collapsed ? 'justify-center p-2' : 'px-3 py-2'
            }`}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
              : <><PanelLeftClose className="w-4 h-4 mr-3 flex-shrink-0" /><span className="text-sm">Réduire</span></>
            }
          </button>
          <Link
            to="/settings"
            title={collapsed ? 'Paramètres' : undefined}
            className={`flex items-center rounded-md transition text-sm ${
              collapsed ? 'justify-center p-2' : 'px-3 py-2'
            } ${
              isActive('/settings')
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold'
                : 'text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Settings className={`w-4 h-4 ${collapsed ? '' : 'mr-3'} flex-shrink-0`} />
            {!collapsed && <span>Paramètres</span>}
          </Link>
          <button
            onClick={logout}
            title={collapsed ? 'Déconnexion' : undefined}
            className={`flex items-center rounded-md transition text-sm ${
              collapsed ? 'justify-center p-2' : 'px-3 py-2'
            } text-gray-500 dark:text-gray-400 font-medium hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
          >
            <LogOut className={`w-4 h-4 ${collapsed ? '' : 'mr-3'} flex-shrink-0`} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Mobile top header — titre seul, pas de hamburger */}
      <header className="sm:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 print:hidden mobile-header">
        <div className="flex items-center px-4 h-12">
          <span className="text-base font-bold dark:text-gray-100">ResumeForge</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block mobile-main-content sm:pt-0 sm:pb-0">
        {children}
      </main>

      {/* Bottom Navigation Bar — mobile only */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex print:hidden mobile-bottom-nav">
        {mobileNavItems.map(({ to, icon: Icon, label, exact }) => {
          const active = isActive(to, exact);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
