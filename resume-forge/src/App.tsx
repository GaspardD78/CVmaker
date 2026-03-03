import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProfilePage } from "@/components/profile/ProfilePage";
import "./App.css";

function Dashboard() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p>Bienvenue sur ResumeForge !</p>
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

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cv/:id" element={<CVBuilder />} />
          <Route path="/tracker" element={<Tracker />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
