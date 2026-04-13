import type { Screen } from '../core/navigation/navigationStore';

const TRACKED_SCREEN_LABELS: Partial<Record<Screen, string>> = {
  auth: 'Login',
  home: 'Home',
  allProjects: 'Tutti i Progetti',
  settings: 'Impostazioni',
  plans: 'Piani',
  firstProjectChoice: 'Scelta Primo Progetto',
};

export const getTrackedAppScreenLabel = (screen: Screen): string | null => (
  TRACKED_SCREEN_LABELS[screen] ?? null
);
