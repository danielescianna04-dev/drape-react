type AppScreen =
  | 'splash'
  | 'auth'
  | 'consent'
  | 'onboarding'
  | 'onboardingFlow'
  | 'firstProjectChoice'
  | 'home'
  | 'create'
  | 'terminal'
  | 'allProjects'
  | 'settings'
  | 'plans';

export const shouldShowHomeShell = (
  currentScreen: AppScreen,
  previousScreen: string | null | undefined,
  isFirstCreate: boolean,
) => (
  currentScreen === 'home'
  || (currentScreen === 'create' && !isFirstCreate)
  || (currentScreen === 'settings' && previousScreen === 'home')
);

export const shouldShowWorkspaceShell = (
  currentScreen: AppScreen,
  previousScreen: string | null | undefined,
) => (
  currentScreen === 'terminal'
  || ((currentScreen === 'settings' || currentScreen === 'plans') && previousScreen === 'terminal')
);

