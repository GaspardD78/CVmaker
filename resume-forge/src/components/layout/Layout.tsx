import { Link } from 'react-router-dom';
import { LayoutDashboard, User, FileText, Briefcase, Settings } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100 print:h-auto print:bg-white print:overflow-visible print:block">
      <aside className="w-64 bg-white shadow-md p-4 flex flex-col justify-between print:hidden">
        <div>
          <h2 className="text-xl font-bold mb-8">ResumeForge</h2>
          <nav className="flex flex-col space-y-4">
            <Link to="/" className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition">
              <LayoutDashboard className="w-5 h-5 mr-3" />
              Tableau de bord
            </Link>
            <Link to="/profile" className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition">
              <User className="w-5 h-5 mr-3" />
              Profil
            </Link>
            <Link to="/cv" className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition">
              <FileText className="w-5 h-5 mr-3" />
              Mes CVs
            </Link>
            <Link to="/tracker" className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition">
              <Briefcase className="w-5 h-5 mr-3" />
              Suivi des candidatures
            </Link>
          </nav>
        </div>
        <div className="pb-2">
          <Link to="/settings" className="flex items-center text-gray-500 font-medium hover:text-gray-700 transition text-sm">
            <Settings className="w-4 h-4 mr-3" />
            Paramètres
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 print:block">
        {children}
      </main>
    </div>
  );
}
