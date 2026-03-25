import { create } from 'zustand';

const STORAGE_KEY = 'resumeforge_current_user_id';

interface AuthState {
  currentUserId: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (profileId: string) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUserId: null,
  isAuthenticated: false,
  isInitialized: false,

  initialize: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        set({ currentUserId: saved, isAuthenticated: true, isInitialized: true });
      } else {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  login: (profileId: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, profileId);
    } catch { /* ignore */ }
    set({ currentUserId: profileId, isAuthenticated: true });
  },

  logout: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    set({ currentUserId: null, isAuthenticated: false });
  },
}));
