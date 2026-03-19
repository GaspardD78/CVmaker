import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, User, FileText, Briefcase, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const STORAGE_KEY = 'resumeforge_sidebar_collapsed';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { to: '/profile', icon: User, label: 'Profil' },
  { to: '/cv', icon: FileText, label: 'Mes CVs' },
  { to: '/tracker', icon: Briefcase, label: 'Suivi des candidatures' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const location = useLocation();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="flex h-screen bg-gray-100 print:h-auto print:bg-white print:overflow-visible print:block">
      <aside
        className={`${collapsed ? 'w-12' : 'w-64'} bg-white shadow-md flex flex-col justify-between print:hidden transition-all duration-200 overflow-hidden`}
      >
        <div className={collapsed ? 'px-1 pt-4' : 'p-4'}>
          {!collapsed && <h2 className="text-xl font-bold mb-8">ResumeForge</h2>}
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
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-blue-600 font-medium hover:text-blue-800 hover:bg-gray-50'
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
            className={`flex items-center text-gray-400 hover:text-gray-600 transition rounded-md ${
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
                ? 'bg-gray-100 text-gray-700 font-semibold'
                : 'text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Settings className={`w-4 h-4 ${collapsed ? '' : 'mr-3'} flex-shrink-0`} />
            {!collapsed && <span>Paramètres</span>}
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block">
        {children}
      </main>
    </div>
  );
}
