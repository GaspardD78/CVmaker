import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
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

/**
 * Forward Android deep-link OAuth callbacks to the in-app event bus.
 * On desktop the Rust local server emits the event directly.
 * On Android, tauri-plugin-deep-link fires onOpenUrl which we convert here.
 */
function useDeepLinkOAuthForward() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        const { emit } = await import('@tauri-apps/api/event');
        unlisten = await onOpenUrl((urls) => {
          for (const url of urls) {
            if (url.includes('/oauth/callback') || url.includes('oauth/callback')) {
              try {
                const u = new URL(url);
                void emit('oauth://callback', u.search);
              } catch {
                // URL may use custom scheme — extract query string manually
                const qs = url.includes('?') ? url.substring(url.indexOf('?')) : '';
                if (qs) void emit('oauth://callback', qs);
              }
            }
          }
        });
      } catch {
        // Plugin not available on this platform — no-op
      }
    })();
    return () => { unlisten?.(); };
  }, []);
}

function App() {
  useDeepLinkOAuthForward();

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
