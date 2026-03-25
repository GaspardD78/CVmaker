import { create } from 'zustand';

const STORAGE_KEY = 'resumeforge_current_user_id';
const LOGOUT_FLAG_KEY = 'resumeforge_explicit_logout';

interface AuthState {
  currentUserId: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  hasExplicitlyLoggedOut: boolean;
  login: (profileId: string) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUserId: null,
  isAuthenticated: false,
  isInitialized: false,
  hasExplicitlyLoggedOut: false,

  initialize: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const loggedOut = localStorage.getItem(LOGOUT_FLAG_KEY) === 'true';
      if (saved && !loggedOut) {
        set({ currentUserId: saved, isAuthenticated: true, isInitialized: true, hasExplicitlyLoggedOut: false });
      } else {
        set({ isInitialized: true, hasExplicitlyLoggedOut: loggedOut });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  login: (profileId: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, profileId);
      localStorage.removeItem(LOGOUT_FLAG_KEY);
    } catch { /* ignore */ }
    // Reset all stores so the new user starts with clean state
    Promise.all([
      import('@/stores/profileStore').then(m => m.useProfileStore.getState().reset()),
      import('@/stores/cvStore').then(m => m.useCvStore.getState().reset()),
      import('@/stores/applicationStore').then(m => m.useApplicationStore.getState().reset()),
    ]).catch(() => {});
    set({ currentUserId: profileId, isAuthenticated: true, hasExplicitlyLoggedOut: false });
  },

  logout: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(LOGOUT_FLAG_KEY, 'true');
    } catch { /* ignore */ }
    // Clear all stores on logout
    Promise.all([
      import('@/stores/profileStore').then(m => m.useProfileStore.getState().reset()),
      import('@/stores/cvStore').then(m => m.useCvStore.getState().reset()),
      import('@/stores/applicationStore').then(m => m.useApplicationStore.getState().reset()),
    ]).catch(() => {});
    set({ currentUserId: null, isAuthenticated: false, hasExplicitlyLoggedOut: true });
  },
}));
