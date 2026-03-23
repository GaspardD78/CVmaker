import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, User, FileText, Briefcase, Settings, PanelLeftClose, PanelLeftOpen, Download, Menu, X } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const STORAGE_KEY = 'resumeforge_sidebar_collapsed';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { to: '/profile', icon: User, label: 'Profil' },
  { to: '/import', icon: Download, label: 'Importer' },
  { to: '/cv', icon: FileText, label: 'Mes CVs' },
  { to: '/tracker', icon: Briefcase, label: 'Suivi des candidatures' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useTheme(); // Apply theme class on mount

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const mobileNavItems = [
    { to: '/', icon: LayoutDashboard, label: 'Accueil', exact: true },
    { to: '/profile', icon: User, label: 'Profil' },
    { to: '/cv', icon: FileText, label: 'CVs' },
    { to: '/tracker', icon: Briefcase, label: 'Suivi' },
    { to: '/settings', icon: Settings, label: 'Config' },
  ];

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
        </div>
      </aside>

      {/* Mobile top header – mobile only */}
      <header className="sm:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <span className="text-base font-bold dark:text-gray-100">ResumeForge</span>
        <button
          onClick={() => setDrawerOpen(o => !o)}
          className="p-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          aria-label="Menu"
        >
          {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block pt-12 sm:pt-0">
        {children}
      </main>

      {/* Drawer overlay – mobile only */}
      {drawerOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/40 print:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer – mobile only */}
      <aside
        className={`sm:hidden fixed top-12 right-0 bottom-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl flex flex-col print:hidden transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <nav className="flex flex-col p-3 space-y-1 flex-1 overflow-y-auto">
          {mobileNavItems.map(({ to, icon: Icon, label, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
