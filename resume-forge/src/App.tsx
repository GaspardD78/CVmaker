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
import { LoginPage } from "@/components/auth/LoginPage";
import { JobWatchPage } from "@/components/job-watch/JobWatchPage";
import { useAuthStore } from "@/stores/authStore";
import { useJobWatcher } from "@/hooks/useJobWatcher";
import PrintView from "@/pages/PrintView";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import "./App.css";

/** Mounts the job watcher scheduler when authenticated. */
function JobWatcherMount() {
  useJobWatcher();
  return null;
}

/** Wrap Layout around non-print routes only — /print renders standalone. */
function AppRoutes() {
  const location = useLocation();
  const { isAuthenticated, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Chargement...</p></div>;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // /print route: render outside Layout (no sidebar, no scroll container)
  if (location.pathname === '/print') {
    return <PrintView />;
  }

  return (
    <Layout>
      <JobWatcherMount />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/cv" element={<CVList />} />
        <Route path="/cv/:id" element={<CVBuilderPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/job-watch" element={<JobWatchPage />} />
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

/**
 * Sur Android, le bouton physique/gestuel "Retour" appelle history.back().
 * Si la pile d'historique est vide (on est sur la page d'accueil), la WebView
 * ferme l'application. On injecte un état gardien pour absorber ce premier
 * "retour" et garder l'utilisateur dans l'app — pattern "double back to exit".
 */
function useAndroidBackGuard() {
  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return;

    // Ajoute une entrée supplémentaire dans l'historique du navigateur.
    // Quand back est pressé depuis la racine, on revient à cet état au lieu
    // de fermer l'app. React Router ne réagit pas (même URL), l'app reste.
    if (!window.history.state?.androidGuardian) {
      window.history.pushState({ androidGuardian: true }, '');
    }

    const onPopState = (e: PopStateEvent) => {
      // L'utilisateur vient de consommer l'entrée gardienne → on la remet
      // pour absorber le prochain "retour" depuis la racine.
      if (e.state?.androidGuardian) {
        window.history.pushState({ androidGuardian: true }, '');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}

function App() {
  useDeepLinkOAuthForward();
  useAndroidBackGuard();

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
