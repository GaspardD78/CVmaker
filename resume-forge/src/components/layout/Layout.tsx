import { Link } from 'react-router-dom';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-md p-4 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold mb-8">ResumeForge</h2>
          <nav className="flex flex-col space-y-4">
            <Link to="/" className="text-blue-600 font-medium hover:text-blue-800 transition">
              Tableau de bord
            </Link>
            <Link to="/profile" className="text-blue-600 font-medium hover:text-blue-800 transition">
              Profil
            </Link>
            <Link to="/cv/1" className="text-blue-600 font-medium hover:text-blue-800 transition">
              Éditeur de CV
            </Link>
            <Link to="/tracker" className="text-blue-600 font-medium hover:text-blue-800 transition">
              Suivi des candidatures
            </Link>
          </nav>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
