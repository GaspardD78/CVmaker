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
    set({ currentUserId: profileId, isAuthenticated: true, hasExplicitlyLoggedOut: false });
  },

  logout: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(LOGOUT_FLAG_KEY, 'true');
    } catch { /* ignore */ }
    set({ currentUserId: null, isAuthenticated: false, hasExplicitlyLoggedOut: true });
  },
}));
