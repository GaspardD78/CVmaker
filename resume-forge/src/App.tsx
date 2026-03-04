import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { CVList } from "@/components/cv-builder/CVList";
import { CVBuilderPage } from "@/components/cv-builder/CVBuilderPage";
import { Toaster } from "sonner";
import "./App.css";

function Dashboard() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p>Bienvenue sur ResumeForge !</p>
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
          <Route path="/cv" element={<CVList />} />
          <Route path="/cv/:id" element={<CVBuilderPage />} />
          <Route path="/tracker" element={<Tracker />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}

export default App;
