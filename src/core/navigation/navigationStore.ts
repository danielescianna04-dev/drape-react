import { create } from 'zustand';

type Screen = 'splash' | 'auth' | 'home' | 'create' | 'terminal' | 'allProjects' | 'settings' | 'plans';

interface NavigationStore {
  // Pending navigation request (consumed by App.tsx)
  pendingNavigation: Screen | null;
  previousScreen: Screen | null;

  // Request navigation to a screen
  navigateTo: (screen: Screen) => void;

  // Clear pending navigation (called after App.tsx processes it)
  clearPendingNavigation: () => void;
}

export const useNavigationStore = create<NavigationStore>((set, get) => ({
  pendingNavigation: null,
  previousScreen: null,

  navigateTo: (screen) => set({
    previousScreen: get().pendingNavigation,
    pendingNavigation: screen
  }),

  clearPendingNavigation: () => set({ pendingNavigation: null }),
}));
