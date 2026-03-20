import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { CVList } from "@/components/cv-builder/CVList";
import { CVBuilderPage } from "@/components/cv-builder/CVBuilderPage";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TrackerPage } from "@/components/tracker/TrackerPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ImportPage } from "@/components/import/ImportPage";
import PrintView from "@/pages/PrintView";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import "./App.css";

/** Wrap Layout around non-print routes only — /print renders standalone. */
function AppRoutes() {
  const location = useLocation();

  // /print route: render outside Layout (no sidebar, no scroll container)
  if (location.pathname === '/print') {
    return <PrintView />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/cv" element={<CVList />} />
        <Route path="/cv/:id" element={<CVBuilderPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
