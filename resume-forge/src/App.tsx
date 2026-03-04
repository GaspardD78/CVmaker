import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { CVList } from "@/components/cv-builder/CVList";
import { CVBuilderPage } from "@/components/cv-builder/CVBuilderPage";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TrackerPage } from "@/components/tracker/TrackerPage";
import { Toaster } from "sonner";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cv" element={<CVList />} />
          <Route path="/cv/:id" element={<CVBuilderPage />} />
          <Route path="/tracker" element={<TrackerPage />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}

export default App;
