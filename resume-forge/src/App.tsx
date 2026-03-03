import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./App.css";

function Dashboard() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p>Bienvenue sur ResumeForge !</p>
    </div>
  );
}

function Profile() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Profil</h1>
      <p>Données du Profil Maître</p>
    </div>
  );
}

function CVBuilder() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Éditeur de CV</h1>
      <p>Éditez votre CV ici</p>
    </div>
  );
}

function Tracker() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Suivi des candidatures</h1>
      <p>Suivez vos candidatures</p>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-md p-4">
        <h2 className="text-xl font-bold mb-4">ResumeForge</h2>
        <nav className="flex flex-col space-y-2">
          <Link to="/" className="text-blue-600 hover:underline">Tableau de bord</Link>
          <Link to="/profile" className="text-blue-600 hover:underline">Profil</Link>
          <Link to="/cv/1" className="text-blue-600 hover:underline">Éditeur de CV</Link>
          <Link to="/tracker" className="text-blue-600 hover:underline">Suivi des candidatures</Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/cv/:id" element={<CVBuilder />} />
          <Route path="/tracker" element={<Tracker />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
